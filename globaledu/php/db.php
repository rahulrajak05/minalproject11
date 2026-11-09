<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');

$isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('globaledu.sid');
session_set_cookie_params([
    'lifetime' => 86400,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($encoded === false) {
        http_response_code(500);
        $encoded = '{"error":"The server could not encode its response."}';
    }
    echo $encoded;
    exit;
}

function requestMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        jsonResponse(405, ['error' => 'This request method is not supported.']);
    }
}

function requestBody(): array
{
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') {
        jsonResponse(415, ['error' => 'Send request data as JSON.']);
    }

    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if ($raw === false || strlen($raw) > 65536) {
        jsonResponse(413, ['error' => 'The request is too large.']);
    }
    $body = json_decode($raw, true);
    if (!is_array($body) || json_last_error() !== JSON_ERROR_NONE) {
        jsonResponse(400, ['error' => 'Request body must be a valid JSON object.']);
    }
    return $body;
}

function database(): PDO
{
    static $connection;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $localConfigPath = __DIR__ . '/config.local.php';
    $localConfig = is_file($localConfigPath) ? require $localConfigPath : [];
    if (!is_array($localConfig)) {
        throw new RuntimeException('php/config.local.php must return a configuration array.');
    }
    $envHost = getenv('DB_HOST');
    $envPort = getenv('DB_PORT');
    $envName = getenv('DB_NAME');
    $envUser = getenv('DB_USER');
    $envPassword = getenv('DB_PASSWORD');
    $host = $envHost !== false && $envHost !== '' ? $envHost : ($localConfig['host'] ?? '127.0.0.1');
    $port = $envPort !== false && $envPort !== '' ? $envPort : ($localConfig['port'] ?? 3306);
    $name = $envName !== false && $envName !== '' ? $envName : ($localConfig['database'] ?? 'globaledu');
    $user = $envUser !== false ? $envUser : ($localConfig['username'] ?? 'root');
    $password = $envPassword !== false ? $envPassword : ($localConfig['password'] ?? '');

    try {
        $connection = new PDO(
            "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
            $user,
            $password,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    } catch (PDOException $error) {
        error_log('GlobalEdu database connection failed: ' . $error->getMessage());
        jsonResponse(500, ['error' => 'Database connection failed. Check MySQL and the php/db.php configuration.']);
    }
    return $connection;
}

function requireUser(): int
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!is_int($userId) && !ctype_digit((string) $userId)) {
        jsonResponse(401, ['error' => 'Please sign in to continue.']);
    }
    return (int) $userId;
}

function workspaceOwner(): array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (is_int($userId) || ctype_digit((string) $userId)) {
        $userId = (int) $userId;
        return ['user:' . $userId, $userId];
    }
    return ['guest:' . session_id(), null];
}

function validWorkspaceKey(string $key): bool
{
    return in_array($key, ['profile', 'favorites', 'compare', 'documents', 'theme', 'preferences', 'adminRecords', 'newsletterEmail'], true);
}

function migrateGuestWorkspace(PDO $pdo, int $userId): void
{
    $guestOwner = 'guest:' . session_id();
    $userOwner = 'user:' . $userId;
    $copy = $pdo->prepare(
        'INSERT IGNORE INTO user_workspace (owner_key, user_id, data_key, data_value)
         SELECT ?, ?, data_key, data_value FROM user_workspace WHERE owner_key = ?'
    );
    $copy->execute([$userOwner, $userId, $guestOwner]);
    $delete = $pdo->prepare('DELETE FROM user_workspace WHERE owner_key = ?');
    $delete->execute([$guestOwner]);
}

function handleApiError(Throwable $error): void
{
    error_log('GlobalEdu API request failed: ' . $error->getMessage());
    jsonResponse(500, ['error' => 'The server could not complete the request. Please try again.']);
}
