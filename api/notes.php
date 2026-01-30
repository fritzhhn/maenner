<?php
/**
 * Notes API for map pins.
 * GET  → list all notes (JSON array)
 * POST → create note (JSON body: { "note", "lng", "lat" }), returns created note
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Server config missing. Copy config.example.php to config.php.']);
    exit;
}

$config = require $configPath;

try {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['dbname'],
        $config['charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed.']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query('SELECT id, note, lng, lat, created_at FROM notes ORDER BY created_at DESC LIMIT 500');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $notes = array_map(function ($row) {
        return [
            'id'        => $row['id'],
            'note'      => $row['note'],
            'lng'       => (float) $row['lng'],
            'lat'       => (float) $row['lat'],
            'createdAt' => (int) $row['created_at'],
        ];
    }, $rows);
    echo json_encode($notes);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['note']) || !isset($data['lng'], $data['lat'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid body: need note, lng, lat.']);
        exit;
    }
    $note = trim((string) $data['note']);
    $lng  = (float) $data['lng'];
    $lat  = (float) $data['lat'];
    if ($note === '') {
        http_response_code(400);
        echo json_encode(['error' => 'note cannot be empty.']);
        exit;
    }
    $id        = (string) (time() . '-' . bin2hex(random_bytes(4)));
    $createdAt = time();
    $stmt = $pdo->prepare('INSERT INTO notes (id, note, lng, lat, created_at) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$id, $note, $lng, $lat, $createdAt]);
    $item = [
        'id'        => $id,
        'note'      => $note,
        'lng'       => $lng,
        'lat'       => $lat,
        'createdAt' => $createdAt,
    ];
    echo json_encode($item);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);
