<?php
$input = $_GET['url'] ?? '';
$videoid = '';

// Video ID Extraction
if (preg_match('/^[a-zA-Z0-9_-]{11}$/', $input)) {
    $videoid = $input;
} else {
    $parts = parse_url($input);
    $host = strtolower($parts['host'] ?? '');
    $path = $parts['path'] ?? '';

    if (strpos($host, 'youtube.com') !== false) {
        parse_str($parts['query'] ?? '', $query);

        if (!empty($query['v']) && preg_match('/^[a-zA-Z0-9_-]{11}$/', $query['v'])) {
            $videoid = $query['v'];
        }
        if (!$videoid && preg_match('~^/shorts/([a-zA-Z0-9_-]{11})~', $path, $matches)) {
            $videoid = $matches[1];
        }
        if (!$videoid && preg_match('~^/embed/([a-zA-Z0-9_-]{11})~', $path, $matches)) {
            $videoid = $matches[1];
        }
    }

    if (!$videoid && ($host === 'youtu.be' || $host === 'www.youtu.be')) {
        if (preg_match('~^/([a-zA-Z0-9_-]{11})~', $path, $matches)) {
            $videoid = $matches[1];
        }
    }
}

if (!$videoid) {
    header('Content-Type: application/json; charset=utf-8');
    die(json_encode(['error' => 'Invalid YouTube URL or Video ID'], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

// 3 Servers Configuration
$servers = [
    [
        'name'    => 'epsilon',
        'host'    => 'epsilon.epsiloncloud.org',
        'origin'  => 'convertytmp3.org',
        'extraParams' => ''
    ],
    [
        'name'    => 'theta',
        'host'    => 'theta.thetacloud.org',
        'origin'  => 'mp3juice.sc',
        'extraParams' => ''
    ],
    [
        'name'    => 'aood',
        'host'    => 'www1.aood.download',
        'origin'  => 'ytshortsdl.com',
        'extraParams' => '&mode=downloader'
    ]
];

// Round-Robin Rotation Logic
session_start();
if (!isset($_SESSION['server_index'])) {
    $_SESSION['server_index'] = 0;
} else {
    $_SESSION['server_index'] = ($_SESSION['server_index'] + 1) % count($servers);
}

// Rotate Queue
$queue = [];
$total = count($servers);
for ($i = 0; $i < $total; $i++) {
    $idx = ($_SESSION['server_index'] + $i) % $total;
    $queue[] = $servers[$idx];
}

/**
 * Universal API Request Handler
 */
function executeApiRequest($videoid, $server) {
    $baseUrl = $server['host'];
    $originHost = $server['origin'];
    $extraParams = $server['extraParams'];
    $f = 'mp4';

    // Step 1: Auth Request
    $timestamp = (int) round(microtime(true) * 1000);
    $ch = curl_init("https://{$baseUrl}/api/v1/auth?_=" . $timestamp);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            "Origin: https://{$originHost}",
            "Referer: https://{$originHost}/",
            'User-Agent: Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
        ],
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || empty($response)) {
        return false;
    }

    $data = json_decode($response, true);
    if (empty($data['key'])) {
        return false;
    }

    // Step 2: Init Request
    $timestamp2 = (int) round(microtime(true) * 1000);
    $headers = [
        'Accept: */*',
        'Accept-Encoding: gzip, deflate, br, zstd',
        'Accept-Language: en-US,en;q=0.9,hi;q=0.8,es;q=0.7,pa;q=0.6',
        'Authorization: Bearer ' . $data['key'],
        'Cache-Control: no-cache',
        "Origin: https://{$originHost}",
        'Pragma: no-cache',
        "Referer: https://{$originHost}/",
        'Sec-CH-UA: "Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
        'Sec-CH-UA-Mobile: ?1',
        'Sec-CH-UA-Platform: "Android"',
        'Sec-Fetch-Dest: empty',
        'Sec-Fetch-Mode: cors',
        'Sec-Fetch-Site: cross-site',
        'User-Agent: Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
    ];

    $ch = curl_init("https://{$baseUrl}/api/v1/init?_=" . $timestamp2);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $result = curl_exec($ch);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $responseBody = substr($result, $headerSize);
    curl_close($ch);

    $json = json_decode($responseBody, true);
    if (empty($json['convertURL'])) {
        return false;
    }

    // Step 3: Convert URL Request
    $convertURL = $json['convertURL'];
    $separator = (strpos($convertURL, '?') !== false) ? '&' : '?';
    $timestamp3 = (int) round(microtime(true) * 1000);
    $finalURL = $convertURL . $separator . 'v=' . rawurlencode($videoid) . '&f=' . rawurlencode($f) . $extraParams . '&_=' . $timestamp3;

    $ch = curl_init($finalURL);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: */*',
            'Accept-Encoding: gzip, deflate, br',
            'Accept-Language: en-US,en;q=0.9,hi;q=0.8,es;q=0.7,pa;q=0.6',
            'Cache-Control: no-cache',
            "Origin: https://{$originHost}",
            'Pragma: no-cache',
            "Referer: https://{$originHost}/",
            'Sec-CH-UA: "Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
            'Sec-CH-UA-Mobile: ?1',
            'Sec-CH-UA-Platform: "Android"',
            'Sec-Fetch-Dest: empty',
            'Sec-Fetch-Mode: cors',
            'Sec-Fetch-Site: cross-site',
            'User-Agent: Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
        ],
        CURLOPT_ENCODING => '',
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $convertResponse = curl_exec($ch);
    curl_close($ch);

    $convertJson = json_decode($convertResponse, true);
    $progressURL = $convertJson['progressURL'] ?? null;
    $downloadURL = $convertJson['downloadURL'] ?? null;

    if (!$progressURL || !$downloadURL) {
        return false;
    }

    // Step 4: Progress Polling
    $maxAttempts = 20;
    $delay       = 1;
    $progressData = null;

    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        $timestamp4 = (int) round(microtime(true) * 1000);
        $sep = (strpos($progressURL, '?') !== false) ? '&' : '?';
        $requestURL = $progressURL . $sep . '_=' . $timestamp4;

        $ch = curl_init($requestURL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Accept: */*',
                'Accept-Encoding: gzip, deflate, br',
                'Accept-Language: en-US,en;q=0.9,hi;q=0.8,es;q=0.7,pa;q=0.6',
                'Cache-Control: no-cache',
                "Origin: https://{$originHost}",
                'Pragma: no-cache',
                "Referer: https://{$originHost}/",
                'Sec-CH-UA: "Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
                'Sec-CH-UA-Mobile: ?1',
                'Sec-CH-UA-Platform: "Android"',
                'Sec-Fetch-Dest: empty',
                'Sec-Fetch-Mode: cors',
                'Sec-Fetch-Site: cross-site',
                'User-Agent: Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
            ],
            CURLOPT_ENCODING => '',
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        if (is_array($data)) {
            $progressData = $data;
            if (isset($data['progress']) && (int)$data['progress'] === 3 && isset($data['error']) && (int)$data['error'] === 0) {
                break;
            }
        }
        sleep($delay);
    }

    // Step 5: Build Final Download Link
    $sepDl = (strpos($downloadURL, '?') !== false) ? '&' : '?';
    $finalDownloadURL = $downloadURL . $sepDl . 'v=' . rawurlencode($videoid) . '&f=' . rawurlencode($f) . '&r=' . rawurlencode($originHost);

    return [
        'server'       => $server['name'],
        'title'        => $progressData['title'] ?? '',
        'download_url' => $finalDownloadURL
    ];
}

// Queue execution with fallback
$finalResult = false;

foreach ($queue as $server) {
    $result = executeApiRequest($videoid, $server);
    if ($result !== false) {
        $finalResult = $result;
        break;
    }
}

// Output Response
header('Content-Type: application/json; charset=utf-8');

if ($finalResult) {
    echo json_encode([
        'status'       => 'completed',
        'source'       => $finalResult['server'],
        'title'        => $finalResult['title'],
        'youtubeid'    => $videoid,
        'format'       => 'mp4',
        'downloadUrl' => $finalResult['download_url']
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode([
        'status'  => 'error',
        'message' => 'All servers failed to process the request.'
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}
