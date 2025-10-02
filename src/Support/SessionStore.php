<?php

namespace Questionnaire\Support;

use RuntimeException;

final class SessionStore
{
    private const FILE = __DIR__ . '/../../storage/sessions.json';

    /**
     * @return array<string, mixed>
     */
    private static function read(): array
    {
        if (!file_exists(self::FILE)) {
            return [];
        }

        $json = file_get_contents(self::FILE);
        if (!$json) {
            return [];
        }

        $data = json_decode($json, true);
        return is_array($data) ? $data : [];
    }

    private static function persist(array $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        file_put_contents(self::FILE, $json, LOCK_EX);
    }

    public static function create(string $promptVersion): array
    {
        $sessions = self::read();
        $id = bin2hex(random_bytes(8));

        $session = [
            'id' => $id,
            'promptVersion' => $promptVersion,
            'phase' => 'collecte',
            'memory' => [],
            'summary' => '',
            'recentTurns' => [],
            'collecte' => self::defaultCollecteState(),
        ];

        $sessions[$id] = $session;
        self::persist($sessions);

        return $session;
    }

    public static function get(string $id): ?array
    {
        $sessions = self::read();
        return $sessions[$id] ?? null;
    }

    public static function update(array $session): array
    {
        $sessions = self::read();
        if (!isset($sessions[$session['id']])) {
            throw new RuntimeException('Session introuvable');
        }

        $sessions[$session['id']] = $session;
        self::persist($sessions);

        return $session;
    }

    public static function mergeMemory(array &$session, mixed $memoryDelta): void
    {
        if (!$memoryDelta) {
            return;
        }

        $session['memory'] = self::arrayMergeRecursiveDistinct($session['memory'] ?? [], $memoryDelta);
    }

    private static function arrayMergeRecursiveDistinct(array $base, mixed $delta): array
    {
        if (!is_array($delta)) {
            return $base;
        }

        foreach ($delta as $key => $value) {
            if (is_array($value) && isset($base[$key]) && is_array($base[$key])) {
                $base[$key] = self::arrayMergeRecursiveDistinct($base[$key], $value);
            } else {
                $base[$key] = $value;
            }
        }

        return $base;
    }

    public static function updatePhase(array &$session, ?string $phase): void
    {
        self::ensureCollecteState($session);

        if (!$phase || !in_array($phase, ['collecte', 'plan', 'sections', 'final'], true)) {
            return;
        }

        if ($phase !== 'collecte' && !self::isCollecteComplete($session)) {
            return;
        }

        $session['phase'] = $phase;
    }

    public static function ensureCollecteState(array &$session): void
    {
        if (!isset($session['collecte']) || !is_array($session['collecte'])) {
            $session['collecte'] = self::defaultCollecteState();
        }

        if (!isset($session['collecte']['answers']) || !is_array($session['collecte']['answers'])) {
            $session['collecte']['answers'] = [];
        }

        $session['collecte']['nextIndex'] = (int) ($session['collecte']['nextIndex'] ?? 0);
        self::normalizeCollecteIndex($session);
    }

    public static function registerCollecteAnswer(array &$session, string $answer): ?array
    {
        self::ensureCollecteState($session);

        $index = (int) $session['collecte']['nextIndex'];
        $question = CollecteFlow::getQuestion($index);

        if ($question === null) {
            return null;
        }

        $session['collecte']['answers'][$question['id']] = trim($answer);
        $session['collecte']['nextIndex'] = $index + 1;
        self::normalizeCollecteIndex($session);

        return $question;
    }

    public static function getPendingCollecteQuestion(array $session): ?array
    {
        $state = self::exportCollecteState($session);
        if ($state['completed']) {
            return null;
        }

        return $state['pendingQuestion'];
    }

    public static function isCollecteComplete(array $session): bool
    {
        $state = self::exportCollecteState($session);
        return $state['completed'];
    }

    /**
     * @return array{nextIndex: int, total: int, completed: bool, pendingQuestion: ?array{id: string, order: int, label: string, prompt: string, index: int}, answers: array<string, string>}
     */
    public static function exportCollecteState(array $session): array
    {
        $answers = [];
        if (isset($session['collecte']['answers']) && is_array($session['collecte']['answers'])) {
            foreach ($session['collecte']['answers'] as $key => $value) {
                if (is_string($key)) {
                    $answers[$key] = is_scalar($value) ? (string) $value : json_encode($value, JSON_UNESCAPED_UNICODE);
                }
            }
        }

        $index = isset($session['collecte']['nextIndex']) ? (int) $session['collecte']['nextIndex'] : 0;
        if ($index < 0) {
            $index = 0;
        }

        $total = CollecteFlow::count();

        while ($index < $total) {
            $question = CollecteFlow::getQuestion($index);
            if ($question === null) {
                break;
            }

            if (!array_key_exists($question['id'], $answers)) {
                return [
                    'nextIndex' => $index,
                    'total' => $total,
                    'completed' => false,
                    'pendingQuestion' => $question,
                    'answers' => $answers,
                ];
            }

            $index++;
        }

        return [
            'nextIndex' => min($index, $total),
            'total' => $total,
            'completed' => true,
            'pendingQuestion' => null,
            'answers' => $answers,
        ];
    }

    private static function defaultCollecteState(): array
    {
        return [
            'nextIndex' => 0,
            'answers' => [],
        ];
    }

    private static function normalizeCollecteIndex(array &$session): void
    {
        $total = CollecteFlow::count();
        $answers = $session['collecte']['answers'];
        $index = (int) $session['collecte']['nextIndex'];

        if ($index < 0) {
            $index = 0;
        }

        while ($index < $total) {
            $question = CollecteFlow::getQuestion($index);
            if ($question === null) {
                break;
            }

            if (!array_key_exists($question['id'], $answers)) {
                break;
            }

            $index++;
        }

        $session['collecte']['nextIndex'] = $index;
    }

    public static function appendTurn(array &$session, string $role, string $content): void
    {
        $turn = [
            'role' => $role,
            'content' => $content,
            'time' => time()
        ];

        $session['recentTurns'][] = $turn;
        if (count($session['recentTurns']) > 5) {
            $session['recentTurns'] = array_slice($session['recentTurns'], -5);
        }

        $session['summary'] = self::compressSummary($session['summary'], $turn);
    }

    private static function compressSummary(string $summary, array $turn): string
    {
        $excerpt = mb_substr($turn['content'], 0, 400);
        $line = strtoupper($turn['role']) . ': ' . $excerpt;
        $lines = array_filter(array_map('trim', explode("\n", $summary)));
        $lines[] = $line;
        $combined = implode("\n", array_slice($lines, -20));
        return mb_substr($combined, -4000);
    }
}
