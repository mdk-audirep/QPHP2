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
            'recentTurns' => []
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
        if ($phase && in_array($phase, ['collecte', 'plan', 'sections', 'final'], true)) {
            $session['phase'] = $phase;
        }
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
