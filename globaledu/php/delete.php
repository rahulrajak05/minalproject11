<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

try {
    requestMethod('POST');
    $body = requestBody();
    $pdo = database();
    $resource = $body['resource'] ?? '';

    if ($resource === 'workspace') {
        $key = is_string($body['key'] ?? null) ? $body['key'] : '';
        if (!validWorkspaceKey($key)) {
            jsonResponse(400, ['error' => 'Provide a valid workspace key.']);
        }
        [$ownerKey] = workspaceOwner();
        $statement = $pdo->prepare('DELETE FROM user_workspace WHERE owner_key = ? AND data_key = ?');
        $statement->execute([$ownerKey, $key]);
        jsonResponse(200, ['message' => 'Workspace data deleted.']);
    }

    if ($resource === 'admin_record') {
        $userId = requireUser();
        $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id) {
            jsonResponse(400, ['error' => 'Provide a valid record ID.']);
        }
        $statement = $pdo->prepare('DELETE FROM admin_records WHERE id = ? AND user_id = ?');
        $statement->execute([$id, $userId]);
        if ($statement->rowCount() === 0) {
            jsonResponse(404, ['error' => 'Record was not found.']);
        }
        jsonResponse(200, ['message' => 'Record deleted.']);
    }

    jsonResponse(404, ['error' => 'Delete resource was not found.']);
} catch (Throwable $error) {
    handleApiError($error);
}
