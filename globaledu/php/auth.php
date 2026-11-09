<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

try {
    $pdo = database();
    $action = $_GET['action'] ?? '';

    if ($action === 'me') {
        requestMethod('GET');
        $userId = requireUser();
        $statement = $pdo->prepare('SELECT id, name, email FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$userId]);
        $user = $statement->fetch();
        if (!$user) {
            $_SESSION = [];
            session_destroy();
            jsonResponse(401, ['error' => 'Your session has expired. Please sign in again.']);
        }
        jsonResponse(200, ['user' => $user]);
    }

    if ($action === 'logout') {
        requestMethod('POST');
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], '', $params['secure'], $params['httponly']);
        }
        session_destroy();
        jsonResponse(200, ['message' => 'You have been signed out.']);
    }

    requestMethod('POST');
    $body = requestBody();
    $email = strtolower(trim(is_string($body['email'] ?? null) ? $body['email'] : ''));
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';

    if ($action === 'register') {
        $name = trim(is_string($body['name'] ?? null) ? $body['name'] : '');
        if ($name === '' || strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)
            || strlen($email) > 254 || strlen($password) < 8 || strlen($password) > 72) {
            jsonResponse(400, ['error' => 'Enter a valid name and email, and a password with 8 to 72 characters.']);
        }
        $statement = $pdo->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
        try {
            $statement->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                jsonResponse(409, ['error' => 'An account with that email already exists.']);
            }
            throw $error;
        }
        $user = ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'email' => $email];
    } elseif ($action === 'login') {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            jsonResponse(400, ['error' => 'Enter your email and password.']);
        }
        $statement = $pdo->prepare('SELECT id, name, email, password_hash FROM users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $row = $statement->fetch();
        $passwordHash = $row['password_hash'] ?? '';
        if (substr($passwordHash, 0, 4) === '$2b$') {
            $passwordHash = '$2y$' . substr($passwordHash, 4);
        }
        if (!$row || !password_verify($password, $passwordHash)) {
            jsonResponse(401, ['error' => 'Email or password is incorrect.']);
        }
        $user = ['id' => (int) $row['id'], 'name' => $row['name'], 'email' => $row['email']];
    } else {
        jsonResponse(404, ['error' => 'Authentication action was not found.']);
    }

    $pdo->beginTransaction();
    try {
        migrateGuestWorkspace($pdo, $user['id']);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    jsonResponse($action === 'register' ? 201 : 200, ['user' => $user]);
} catch (Throwable $error) {
    handleApiError($error);
}
