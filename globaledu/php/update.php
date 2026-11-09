<?php
declare(strict_types=1);

require __DIR__ . '/db.php';

function validateWorkspaceValue(PDO $pdo, string $key, $value): void
{
    if ($key === 'theme') {
        if (!in_array($value, ['light', 'dark'], true)) {
            jsonResponse(400, ['error' => 'Choose a valid theme.']);
        }
        return;
    }

    if ($key === 'preferences') {
        $notifications = is_array($value) ? ($value['notifications'] ?? null) : null;
        $keys = ['deadlines', 'recommendations', 'shortlist'];
        if (!is_array($notifications) || count($notifications) !== count($keys)) {
            jsonResponse(400, ['error' => 'Provide all notification preferences as booleans.']);
        }
        foreach ($keys as $name) {
            if (!array_key_exists($name, $notifications) || !is_bool($notifications[$name])) {
                jsonResponse(400, ['error' => 'Provide all notification preferences as booleans.']);
            }
        }
        return;
    }

    if ($key === 'profile') {
        $email = is_array($value) && is_string($value['email'] ?? null) ? trim($value['email']) : '';
        $name = is_array($value) && is_string($value['name'] ?? null) ? trim($value['name']) : '';
        if ($name === '' || strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) {
            jsonResponse(400, ['error' => 'Enter a valid profile name and email address.']);
        }
        $limits = ['nationality' => 100, 'program' => 120];
        foreach ($limits as $field => $limit) {
            if (isset($value[$field]) && (!is_string($value[$field]) || strlen($value[$field]) > $limit)) {
                jsonResponse(400, ['error' => 'One or more profile fields are too long.']);
            }
        }
        foreach (['score' => [0, 100], 'testScore' => [0, 9], 'budget' => [0, 10000000]] as $field => $range) {
            $number = $value[$field] ?? '';
            if ($number !== '' && (!is_numeric($number) || (float) $number < $range[0] || (float) $number > $range[1])) {
                jsonResponse(400, ['error' => 'Check the academic score, English score, and tuition budget.']);
            }
        }
        if (isset($value['degree']) && !in_array($value['degree'], ['Master’s', 'Bachelor’s', 'PhD'], true)) {
            jsonResponse(400, ['error' => 'Choose a valid degree.']);
        }
        if (isset($value['scholarship']) && !is_bool($value['scholarship'])) {
            jsonResponse(400, ['error' => 'Choose a valid scholarship preference.']);
        }
        $countries = $value['preferredCountries'] ?? [];
        if (!is_array($countries) || array_values($countries) !== $countries || count($countries) > 10) {
            jsonResponse(400, ['error' => 'Choose valid preferred countries.']);
        }
        if ($countries) {
            foreach ($countries as $country) {
                if (!is_string($country)) {
                    jsonResponse(400, ['error' => 'Choose valid preferred countries.']);
                }
            }
            $placeholders = implode(',', array_fill(0, count($countries), '?'));
            $statement = $pdo->prepare("SELECT COUNT(*) FROM countries WHERE id IN ({$placeholders})");
            $statement->execute(array_values(array_unique($countries)));
            if ((int) $statement->fetchColumn() !== count(array_unique($countries))) {
                jsonResponse(400, ['error' => 'Choose valid preferred countries.']);
            }
        }
        return;
    }

    if ($key === 'favorites' || $key === 'compare') {
        $limit = $key === 'compare' ? 4 : 20;
        if (!is_array($value) || array_values($value) !== $value || count($value) > $limit) {
            jsonResponse(400, ['error' => 'Choose a valid list of universities.']);
        }
        if ($value) {
            foreach ($value as $id) {
                if (!is_string($id)) {
                    jsonResponse(400, ['error' => 'Choose a valid list of universities.']);
                }
            }
            $ids = array_values(array_unique($value));
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $statement = $pdo->prepare("SELECT COUNT(*) FROM universities WHERE id IN ({$placeholders})");
            $statement->execute($ids);
            if ((int) $statement->fetchColumn() !== count($ids)) {
                jsonResponse(400, ['error' => 'Choose a valid list of universities.']);
            }
        }
        return;
    }

    if ($key === 'documents') {
        if (!is_array($value) || array_values($value) !== $value || count($value) > 9) {
            jsonResponse(400, ['error' => 'Choose valid document checklist items.']);
        }
        if ($value) {
            foreach ($value as $name) {
                if (!is_string($name)) {
                    jsonResponse(400, ['error' => 'Choose valid document checklist items.']);
                }
            }
            $names = array_values(array_unique($value));
            $placeholders = implode(',', array_fill(0, count($names), '?'));
            $statement = $pdo->prepare("SELECT COUNT(*) FROM document_requirements WHERE name IN ({$placeholders})");
            $statement->execute($names);
            if ((int) $statement->fetchColumn() !== count($names)) {
                jsonResponse(400, ['error' => 'Choose valid document checklist items.']);
            }
        }
    }
}

try {
    requestMethod('POST');
    $body = requestBody();
    $pdo = database();
    $resource = $body['resource'] ?? '';

    if ($resource === 'workspace') {
        $key = is_string($body['key'] ?? null) ? $body['key'] : '';
        if (!validWorkspaceKey($key) || !array_key_exists('value', $body)) {
            jsonResponse(400, ['error' => 'Provide a valid workspace key and value.']);
        }
        validateWorkspaceValue($pdo, $key, $body['value']);
        $value = json_encode($body['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($value === false || strlen($value) > 65536) {
            jsonResponse(400, ['error' => 'Workspace data must be valid JSON and no larger than 64 KB.']);
        }
        [$ownerKey, $userId] = workspaceOwner();
        $statement = $pdo->prepare(
            'INSERT INTO user_workspace (owner_key, user_id, data_key, data_value) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE data_value = VALUES(data_value)'
        );
        $statement->execute([$ownerKey, $userId, $key, $value]);
        jsonResponse(200, ['message' => 'Workspace data saved.']);
    }

    if ($resource === 'admin_record') {
        $userId = requireUser();
        $id = filter_var($body['id'] ?? null, FILTER_VALIDATE_INT);
        $name = trim(is_string($body['name'] ?? null) ? $body['name'] : '');
        $type = trim(is_string($body['type'] ?? null) ? $body['type'] : 'Custom');
        if (!$id || $name === '' || strlen($name) > 160 || $type === '' || strlen($type) > 80) {
            jsonResponse(400, ['error' => 'Provide a valid record ID, name, and type.']);
        }
        $statement = $pdo->prepare('UPDATE admin_records SET name = ?, record_type = ? WHERE id = ? AND user_id = ?');
        $statement->execute([$name, $type, $id, $userId]);
        if ($statement->rowCount() === 0) {
            $check = $pdo->prepare('SELECT id FROM admin_records WHERE id = ? AND user_id = ?');
            $check->execute([$id, $userId]);
            if (!$check->fetch()) {
                jsonResponse(404, ['error' => 'Record was not found.']);
            }
        }
        jsonResponse(200, ['record' => ['id' => $id, 'name' => $name, 'type' => $type]]);
    }

    jsonResponse(404, ['error' => 'Update resource was not found.']);
} catch (Throwable $error) {
    handleApiError($error);
}
