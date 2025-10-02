<?php

namespace Questionnaire\Support;

final class ResponseFormatter
{
    public static function extractContent(array $openAiResponse): string
    {
        return self::formatAssistantResponse($openAiResponse)['markdown'];
    }

    /**
     * @return array{markdown: string, sources: array{internal: list<string>, web: list<string>}}
     */
    public static function formatAssistantResponse(array $response): array
    {
        $chunks = self::gatherOutputChunks($response);
        $markdown = '';

        if ($chunks !== []) {
            $buffer = '';
            foreach ($chunks as $chunk) {
                $buffer .= self::stringifyChunk($chunk);
            }

            $markdown = trim($buffer);
        }

        $sources = self::extractSources($response);

        return [
            'markdown' => $markdown,
            'sources' => $sources,
        ];
    }

    /**
     * @return array{internal: list<string>, web: list<string>}
     */
    public static function extractSources(array $payload): array
    {
        $sources = [
            'internal' => [],
            'web' => [],
        ];

        if (isset($payload['sources'])) {
            $sources = self::normalizeSources($payload['sources']);
        }

        [$documents, $urls] = self::collectRawSources($payload);

        foreach (array_keys($documents) as $documentId) {
            self::pushUnique($sources['internal'], $documentId);
        }

        foreach (array_keys($urls) as $url) {
            self::pushUnique($sources['web'], $url);
        }

        return $sources;
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

    /**
     * @param mixed $sources
     * @return array{internal: list<string>, web: list<string>}
     */
    private static function normalizeSources(mixed $sources): array
    {
        $normalized = [
            'internal' => [],
            'web' => [],
        ];

        if (!is_array($sources)) {
            return $normalized;
        }

        if (isset($sources['internal'])) {
            $normalized['internal'] = self::normalizeSourceList($sources['internal']);
        }

        if (isset($sources['web'])) {
            $normalized['web'] = self::normalizeSourceList($sources['web']);
        }

        return $normalized;
    }

    /**
     * @param mixed $value
     * @return list<string>
     */
    private static function normalizeSourceList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $result = [];
        foreach ($value as $entry) {
            if (!is_string($entry)) {
                continue;
            }

            $trimmed = trim($entry);
            if ($trimmed === '') {
                continue;
            }

            self::pushUnique($result, $trimmed);
        }

        return $result;
    }

    /**
     * @param list<string> $buffer
     */
    private static function pushUnique(array &$buffer, string $value): void
    {
        if ($value === '') {
            return;
        }

        if (!in_array($value, $buffer, true)) {
            $buffer[] = $value;
        }
    }

    /**
     * @return array{0: array<string, true>, 1: array<string, true>}
     */
    private static function collectRawSources(array $payload): array
    {
        $documents = [];
        $urls = [];
        $stack = [$payload];

        while ($stack !== []) {
            $current = array_pop($stack);
            if (!is_array($current)) {
                continue;
            }

            if (isset($current['document_id']) && is_string($current['document_id']) && $current['document_id'] !== '') {
                $documents[$current['document_id']] = true;
            }

            if (isset($current['file_id']) && is_string($current['file_id']) && $current['file_id'] !== '') {
                $documents[$current['file_id']] = true;
            }

            if (isset($current['annotations']) && is_array($current['annotations'])) {
                foreach ($current['annotations'] as $annotation) {
                    $stack[] = $annotation;
                }
            }

            if (isset($current['results']) && is_array($current['results'])) {
                foreach ($current['results'] as $result) {
                    $stack[] = $result;
                }
            }

            if (isset($current['url']) && is_string($current['url']) && $current['url'] !== '') {
                if (filter_var($current['url'], FILTER_VALIDATE_URL)) {
                    $urls[$current['url']] = true;
                }
            }

            foreach ($current as $key => $value) {
                if ($key === 'sources') {
                    continue;
                }

                if (is_array($value)) {
                    $stack[] = $value;
                }
            }
        }

        return [$documents, $urls];
    }
}
