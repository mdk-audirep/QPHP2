<?php

declare(strict_types=1);

use Questionnaire\Support\Env;
use Questionnaire\Support\MissingConfigurationException;
use Questionnaire\Support\OpenAIClient;
use Questionnaire\Support\Prompt;
use Questionnaire\Support\ResponseFormatter;
use Questionnaire\Support\SessionStore;

require __DIR__ . '/../src/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Allow: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rawInput = file_get_contents('php://input') ?: '';
$input = [];

if ($rawInput !== '') {
    $decoded = json_decode($rawInput, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        http_response_code(400);
        echo json_encode(['message' => 'Corps JSON invalide.']);
        exit;
    }
    $input = $decoded;
}

$action = $_GET['action'] ?? ($input['action'] ?? null);

if (!$action) {
    http_response_code(400);
    echo json_encode(['message' => 'Paramètre action manquant.']);
    exit;
}

if ($method !== 'POST') {
    if ($action === 'health') {
        respondHealth();
        exit;
    }

    http_response_code(405);
    echo json_encode(['message' => 'Méthode non autorisée. Utilisez POST pour cette action.']);
    exit;
}

try {
    switch ($action) {
        case 'start':
            responseStart($input);
            break;

        case 'continue':
            responseContinue($input, false);
            break;

        case 'final':
            responseContinue($input, true);
            break;

        case 'health':
            respondHealth();
            break;

        default:
            http_response_code(404);
            echo json_encode(['message' => 'Route inconnue']);
    }
} catch (MissingConfigurationException $exception) {
    http_response_code(503);
    echo json_encode(['message' => 'Configuration manquante : définissez OPENAI_API_KEY et VECTOR_STORE_ID.']);
} catch (\InvalidArgumentException $exception) {
    http_response_code(400);
    echo json_encode(['message' => $exception->getMessage()]);
} catch (\RuntimeException $exception) {
    http_response_code(500);
    echo json_encode(['message' => $exception->getMessage()]);
}

function respondHealth(): void
{
    echo json_encode([
        'status' => 'ok',
        'openaiEnabled' => Env::openAiEnabled(),
        'missingKeys' => Env::openAiEnabled() ? [] : ['OPENAI_API_KEY', 'VECTOR_STORE_ID'],
        'promptVersion' => Prompt::VERSION,
    ]);
}

function validateCommon(array $data, bool $expectSession = false): void
{
    if (($data['promptVersion'] ?? null) !== Prompt::VERSION) {
        throw new InvalidArgumentException('Version du prompt incompatible. Lancez /start à nouveau.');
    }

    if (empty($data['userMessage']) || !is_string($data['userMessage'])) {
        throw new InvalidArgumentException('userMessage est requis.');
    }

    if ($expectSession) {
        if (empty($data['sessionId']) || !is_string($data['sessionId'])) {
            throw new InvalidArgumentException('sessionId est requis.');
        }
    }
}

function responseStart(array $data): void
{
    Env::requireKeys();
    validateCommon($data);

    $session = SessionStore::create(Prompt::VERSION);
    SessionStore::ensureCollecteState($session);
    if (isset($data['phaseHint'])) {
        SessionStore::updatePhase($session, $data['phaseHint']);
    }
    SessionStore::mergeMemory($session, $data['memoryDelta'] ?? null);
    SessionStore::ensureCollecteState($session);

    $client = new OpenAIClient();
    $payload = $client->buildPayload($session, (string) $data['userMessage']);
        // echo json_encode($payload);
    $result = $client->send($payload);

    $assistantMarkdown = ResponseFormatter::extractContent($result);
    $phase = ResponseFormatter::detectPhase($assistantMarkdown, $session['phase']);
    SessionStore::updatePhase($session, $phase);

    SessionStore::appendTurn($session, 'user', (string) $data['userMessage']);
    SessionStore::appendTurn($session, 'assistant', $assistantMarkdown);
    SessionStore::updatePhase($session, $phase);
    SessionStore::mergeMemory($session, $data['memoryDelta'] ?? null);
    SessionStore::update($session);

    echo json_encode([
        'sessionId' => $session['id'],
        'promptVersion' => Prompt::VERSION,
        'phase' => $phase,
        'assistantMarkdown' => $assistantMarkdown,
        'memorySnapshot' => $session['memory'],
        'finalMarkdownPresent' => ResponseFormatter::hasFinalMarkdown($assistantMarkdown),
        'nextAction' => 'ask_user',
        'collecteState' => SessionStore::exportCollecteState($session),
    ]);
}

function responseContinue(array $data, bool $finalOverride): void
{
    Env::requireKeys();
    validateCommon($data, true);

    $session = SessionStore::get($data['sessionId']);
    if (!$session) {
        throw new RuntimeException('Session inconnue. Relancez /start.');
    }

    if (($data['promptVersion'] ?? null) !== $session['promptVersion']) {
        throw new InvalidArgumentException('Version du prompt obsolète. Démarrez une nouvelle session.');
    }

    if (isset($data['phaseHint'])) {
        SessionStore::updatePhase($session, $data['phaseHint']);
    }

    SessionStore::mergeMemory($session, $data['memoryDelta'] ?? null);
    SessionStore::ensureCollecteState($session);

    if ($finalOverride && !SessionStore::isCollecteComplete($session)) {
        throw new InvalidArgumentException('Impossible de finaliser : répondez d’abord aux 9 questions obligatoires.');
    }

    if (!$finalOverride) {
        SessionStore::registerCollecteAnswer($session, (string) $data['userMessage']);
    }

    $client = new OpenAIClient();
    $payload = $client->buildPayload($session, (string) $data['userMessage'], $finalOverride);

    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }

    while (ob_get_level() > 0) {
        ob_end_flush();
    }

    ob_implicit_flush(true);

    $sendEvent = static function (array $event): void {
        echo 'data: ' . json_encode($event, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
        @ob_flush();
        flush();
    };

    try {
        $result = $client->send($payload, static function (string $deltaText) use ($sendEvent): void {
            if ($deltaText === '') {
                return;
            }

            $sendEvent([
                'type' => 'delta',
                'text' => $deltaText,
            ]);
        });
    } catch (\Throwable $exception) {
        http_response_code(500);
        $sendEvent([
            'type' => 'error',
            'message' => $exception->getMessage(),
        ]);
        return;
    }

    $assistantMarkdown = ResponseFormatter::extractContent($result);
    $phase = $finalOverride ? 'final' : ResponseFormatter::detectPhase($assistantMarkdown, $session['phase']);

    SessionStore::appendTurn($session, 'user', (string) $data['userMessage']);
    SessionStore::appendTurn($session, 'assistant', $assistantMarkdown);
    SessionStore::updatePhase($session, $phase);
    SessionStore::mergeMemory($session, $data['memoryDelta'] ?? null);
    SessionStore::update($session);

    $payload = [
        'sessionId' => $session['id'],
        'promptVersion' => $session['promptVersion'],
        'phase' => $phase,
        'assistantMarkdown' => $assistantMarkdown,
        'memorySnapshot' => $session['memory'],
        'finalMarkdownPresent' => ResponseFormatter::hasFinalMarkdown($assistantMarkdown),
        'nextAction' => $finalOverride ? 'persist_and_render' : 'ask_user',
        'collecteState' => SessionStore::exportCollecteState($session),
    ];

    $sendEvent([
        'type' => 'result',
        'payload' => $payload,
    ]);
}
