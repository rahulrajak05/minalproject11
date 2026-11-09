<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

try {
    $pdo = database();
    $resource = $_GET['resource'] ?? '';

    if ($resource === 'catalog') {
        requestMethod('GET');
        $catalog = [];
        foreach (['countries', 'universities', 'programs', 'scholarships', 'departments'] as $table) {
            $rows = $pdo->query("SELECT attributes FROM {$table} ORDER BY display_order, id")->fetchAll();
            $catalog[$table] = array_map(static function (array $row): array {
                $value = json_decode($row['attributes'], true);
                if (!is_array($value)) {
                    throw new RuntimeException('Invalid catalog data in the database.');
                }
                return $value;
            }, $rows);
        }
        $deadlines = $pdo->query(
            "SELECT id, title, type, DATE_FORMAT(due_date, '%Y-%m-%d') AS date, university FROM application_deadlines ORDER BY due_date"
        )->fetchAll();
        $catalog['deadlines'] = $deadlines;
        $catalog['requirements'] = $pdo->query('SELECT name FROM document_requirements ORDER BY id')
            ->fetchAll(PDO::FETCH_COLUMN);
        $catalog['notifications'] = $pdo->query(
            'SELECT id, title, message, label, tone, category FROM platform_notifications ORDER BY id'
        )->fetchAll();
        jsonResponse(200, $catalog);
    }

    if ($resource === 'workspace') {
        requestMethod('GET');
        [$ownerKey, $userId] = workspaceOwner();
        $statement = $pdo->prepare('SELECT data_key, data_value FROM user_workspace WHERE owner_key = ?');
        $statement->execute([$ownerKey]);
        $workspace = [];
        foreach ($statement->fetchAll() as $row) {
            $value = json_decode($row['data_value'], true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new RuntimeException('Invalid workspace data in the database.');
            }
            $workspace[$row['data_key']] = $value;
        }
        if ($userId !== null
            && (!array_key_exists('theme', $workspace) || !array_key_exists('preferences', $workspace))) {
            $legacy = $pdo->prepare('SELECT theme, notifications FROM user_settings WHERE user_id = ? LIMIT 1');
            $legacy->execute([$userId]);
            $settings = $legacy->fetch();
            if ($settings) {
                if (!array_key_exists('theme', $workspace)) {
                    $workspace['theme'] = $settings['theme'];
                }
                if (!array_key_exists('preferences', $workspace)) {
                    $notifications = json_decode($settings['notifications'], true);
                    if (!is_array($notifications)) {
                        throw new RuntimeException('Invalid legacy settings in the database.');
                    }
                    $workspace['preferences'] = ['notifications' => $notifications];
                }
            }
        }
        jsonResponse(200, ['workspace' => $workspace]);
    }

    if ($resource === 'admin_records') {
        $userId = requireUser();
        requestMethod('GET');
        $statement = $pdo->prepare('SELECT id, name, record_type AS type FROM admin_records WHERE user_id = ? ORDER BY id DESC');
        $statement->execute([$userId]);
        jsonResponse(200, ['records' => $statement->fetchAll()]);
    }

    jsonResponse(404, ['error' => 'Data resource was not found.']);
} catch (Throwable $error) {
    handleApiError($error);
}
