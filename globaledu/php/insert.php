<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

try {
    requestMethod('POST');
    $body = requestBody();
    $pdo = database();
    $resource = $body['resource'] ?? '';

    if ($resource === 'newsletter') {
        $email = strtolower(trim(is_string($body['email'] ?? null) ? $body['email'] : ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            jsonResponse(400, ['error' => 'Enter a valid email address.']);
        }
        $statement = $pdo->prepare('INSERT INTO newsletter_subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE email = VALUES(email)');
        $statement->execute([$email]);
        jsonResponse(201, ['message' => 'You are on the GlobalEdu update list.']);
    }

    if ($resource === 'admin_record') {
        $userId = requireUser();
        $name = trim(is_string($body['name'] ?? null) ? $body['name'] : '');
        $type = trim(is_string($body['type'] ?? null) ? $body['type'] : 'Custom');
        if ($name === '' || strlen($name) > 160 || $type === '' || strlen($type) > 80) {
            jsonResponse(400, ['error' => 'Provide a record name and type within the allowed length.']);
        }
        $statement = $pdo->prepare('INSERT INTO admin_records (user_id, name, record_type) VALUES (?, ?, ?)');
        $statement->execute([$userId, $name, $type]);
        jsonResponse(201, ['record' => ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'type' => $type]]);
    }

    jsonResponse(404, ['error' => 'Insert resource was not found.']);
} catch (Throwable $error) {
    handleApiError($error);
}
