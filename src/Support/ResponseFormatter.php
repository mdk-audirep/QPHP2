<?php

namespace Questionnaire\Support;

final class ResponseFormatter
{
    public static function extractContent(array $openAiResponse): string
    {
        $chunks = self::gatherOutputChunks($openAiResponse);
        if ($chunks === []) {
            return '';
        }

        $buffer = '';
        foreach ($chunks as $chunk) {
            $buffer .= self::stringifyChunk($chunk);
        }

        return trim($buffer);
    }

    /**
     * @param array<string, mixed> $response
     * @return array<int, mixed>
     */
    private static function gatherOutputChunks(array $response): array
    {
        $chunks = [];

        $candidates = [];
        if (isset($response['output']) && is_array($response['output'])) {
            $candidates[] = $response['output'];
        }

        if (isset($response['response']['output']) && is_array($response['response']['output'])) {
            $candidates[] = $response['response']['output'];
        }

        if (isset($response['delta']['output']) && is_array($response['delta']['output'])) {
            $candidates[] = $response['delta']['output'];
        }

        foreach ($candidates as $candidate) {
            foreach ($candidate as $chunk) {
                $chunks[] = $chunk;
            }
        }

        // Some payloads only provide `output_text` as a flat list of strings.
        if ($chunks === [] && isset($response['output_text'])) {
            $outputText = $response['output_text'];
            if (is_string($outputText)) {
                $chunks[] = ['content' => [['type' => 'output_text', 'text' => $outputText]]];
            } elseif (is_array($outputText)) {
                $chunks[] = ['content' => array_map(static function ($entry) {
                    return ['type' => 'output_text', 'text' => $entry];
                }, $outputText)];
            }
        }

        return $chunks;
    }

    /**
     * @param array<int, mixed> $deltaOutput
     */
    public static function stringifyDeltaOutput(array $deltaOutput): string
    {
        $buffer = '';
        foreach ($deltaOutput as $chunk) {
            $buffer .= self::stringifyChunk($chunk);
        }

        return $buffer;
    }

    /**
     * @param mixed $chunk
     */
    private static function stringifyChunk(mixed $chunk): string
    {
        if (!is_array($chunk)) {
            return '';
        }

        $content = $chunk['content'] ?? null;
        if ($content === null) {
            return '';
        }

        if (!is_array($content)) {
            return is_string($content) ? $content : '';
        }

        $buffer = '';
        foreach ($content as $entry) {
            $buffer .= self::stringifyContent($entry);
        }

        return $buffer;
    }

    /**
     * @param mixed $entry
     */
    private static function stringifyContent(mixed $entry): string
    {
        if (!is_array($entry)) {
            return is_string($entry) ? $entry : '';
        }

        $type = $entry['type'] ?? '';

        if ($type === 'output_text' || $type === 'output_text_delta' || $type === 'text') {
            $text = $entry['text'] ?? ($entry['text_delta'] ?? null);
            return self::stringifyText($text);
        }

        if ($type === 'message' && isset($entry['content']) && is_array($entry['content'])) {
            $buffer = '';
            foreach ($entry['content'] as $inner) {
                $buffer .= self::stringifyContent($inner);
            }

            return $buffer;
        }

        return '';
    }

    private static function stringifyText(mixed $text): string
    {
        if (is_string($text)) {
            return $text;
        }

        if (is_array($text)) {
            $buffer = '';
            foreach ($text as $piece) {
                $buffer .= self::stringifyText($piece);
            }

            return $buffer;
        }

        return '';
    }

    public static function detectPhase(string $markdown, string $fallback): string
    {
        $normalized = mb_strtolower($markdown);
        return match (true) {
            str_contains($normalized, 'phase finale') || str_contains($normalized, 'phase final') => 'final',
            str_contains($normalized, 'phase sections') || str_contains($normalized, 'phase section') => 'sections',
            str_contains($normalized, 'phase plan') => 'plan',
            str_contains($normalized, 'phase collecte') => 'collecte',
            default => $fallback,
        };
    }

    public static function hasFinalMarkdown(string $markdown): bool
    {
        return str_contains($markdown, "```markdown");
    }
}
