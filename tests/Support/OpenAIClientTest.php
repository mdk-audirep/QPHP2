<?php

use Questionnaire\Support\CollecteFlow;
use Questionnaire\Support\OpenAIClient;

$autoload = __DIR__ . '/../../vendor/autoload.php';
if (file_exists($autoload)) {
    require_once $autoload;
}

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'Questionnaire\\')) {
        return;
    }

    $relative = substr($class, strlen('Questionnaire\\'));
    $path = __DIR__ . '/../../src/' . str_replace('\\', '/', $relative) . '.php';
    if (file_exists($path)) {
        require_once $path;
    }
});

if (!class_exists('GuzzleHttp\\Client')) {
    class OpenAIClientTestGuzzleStub
    {
        public function __construct(array $config = [])
        {
        }
    }

    class_alias(OpenAIClientTestGuzzleStub::class, 'GuzzleHttp\\Client');
}

$client = new OpenAIClient();

$questions = CollecteFlow::questions();

foreach ($questions as $question) {
    $session = [
        'id' => 'test-session',
        'promptVersion' => 'test',
        'phase' => 'collecte',
        'summary' => '',
        'recentTurns' => [],
        'collecte' => [
            'nextIndex' => $question['index'],
            'answers' => [],
        ],
    ];

    foreach ($questions as $previous) {
        if ($previous['index'] < $question['index']) {
            $session['collecte']['answers'][$previous['id']] = 'filled';
        }
    }

    $payload = $client->buildPayload($session, 'Bonjour');

    if (!isset($payload['input'][0]['content'][0]['text'])) {
        throw new RuntimeException('Le message système de collecte est introuvable.');
    }

    $systemMessage = $payload['input'][0]['content'][0]['text'];

    $baseInstructions = CollecteFlow::instructions($question['id']);
    $expectedInstructions = CollecteFlow::withSourceTraceability($baseInstructions);
    if ($baseInstructions === []) {
        $expectedInstructions[] = sprintf('Pose la question suivante : «%s».', $question['prompt']);
    }

    $traceabilityInstruction = CollecteFlow::sourceTraceabilityInstruction();
    if (!str_contains($systemMessage, $traceabilityInstruction)) {
        throw new RuntimeException(sprintf(
            "L'instruction de traçabilité des sources est absente pour la question %s.",
            $question['id']
        ));
    }

    foreach ($expectedInstructions as $instruction) {
        $resolvedInstruction = str_replace('{{prompt}}', $question['prompt'], $instruction);
        if (!str_contains($systemMessage, $resolvedInstruction)) {
            throw new RuntimeException(sprintf(
                "L'instruction attendue est absente pour la question %s : %s",
                $question['id'],
                $resolvedInstruction
            ));
        }
    }

    if (!str_contains($systemMessage, '⚠️ Attente réponse utilisateur')) {
        throw new RuntimeException(sprintf(
            "Le message de terminaison est absent pour la question %s.",
            $question['id']
        ));
    }
}

echo "OpenAIClient instructions test passed.\n";
