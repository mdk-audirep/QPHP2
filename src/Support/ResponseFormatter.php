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

        foreach ($documents as $documentId => $parts) {
            $label = self::buildSourceLabel($parts);
            self::pushUnique($sources['internal'], $label ?? $documentId);
        }

        foreach ($urls as $url => $parts) {
            $label = self::buildSourceLabel($parts);
            $display = $label !== null ? self::appendUrlToLabel($label, $url) : $url;
            self::pushUnique($sources['web'], $display);
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
     * @return array{0: array<string, list<string>>, 1: array<string, list<string>>}
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

            if (isset($current['search_results']) && is_array($current['search_results'])) {
                foreach ($current['search_results'] as $result) {
                    if (!is_array($result)) {
                        continue;
                    }

                    $summary = self::summarizeSearchResult($result);

                    if ($summary['documentId'] !== null) {
                        $documents[$summary['documentId']] = self::mergeSourceParts(
                            $documents[$summary['documentId']] ?? [],
                            $summary['parts']
                        );
                    }

                    if ($summary['url'] !== null) {
                        $urls[$summary['url']] = self::mergeSourceParts(
                            $urls[$summary['url']] ?? [],
                            $summary['parts']
                        );
                    }

                    $stack[] = $result;
                }
            }

            $documentId = self::sanitizeSourceId($current['document_id'] ?? null);
            if ($documentId !== null && !array_key_exists($documentId, $documents)) {
                $documents[$documentId] = [];
            }

            $fileId = self::sanitizeSourceId($current['file_id'] ?? null);
            if ($fileId !== null && !array_key_exists($fileId, $documents)) {
                $documents[$fileId] = [];
            }

            $url = self::sanitizeUrl($current['url'] ?? null);
            if ($url !== null && !array_key_exists($url, $urls)) {
                $urls[$url] = [];
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

    /**
     * @param list<string> $parts
     */
    private static function buildSourceLabel(array $parts): ?string
    {
        $buffer = [];

        foreach ($parts as $part) {
            if (!is_string($part)) {
                continue;
            }

            $normalized = self::normalizeSourceText($part);
            if ($normalized === '') {
                continue;
            }

            if (in_array($normalized, $buffer, true)) {
                continue;
            }

            $buffer[] = $normalized;
        }

        if ($buffer === []) {
            return null;
        }

        return implode(' — ', $buffer);
    }

    private static function appendUrlToLabel(string $label, string $url): string
    {
        if ($url === '') {
            return $label;
        }

        if (str_contains($label, $url)) {
            return $label;
        }

        return sprintf('%s — %s', $label, $url);
    }

    /**
     * @param list<string> $existing
     * @param list<string> $additional
     * @return list<string>
     */
    private static function mergeSourceParts(array $existing, array $additional): array
    {
        foreach ($additional as $value) {
            if (!is_string($value)) {
                continue;
            }

            $normalized = self::normalizeSourceText($value);
            if ($normalized === '') {
                continue;
            }

            if (in_array($normalized, $existing, true)) {
                continue;
            }

            $existing[] = $normalized;
        }

        return $existing;
    }

    /**
     * @return array{documentId: string|null, url: string|null, parts: list<string>}
     */
    private static function summarizeSearchResult(array $result): array
    {
        $parts = [];

        if (isset($result['file']) && is_array($result['file'])) {
            foreach (['display_name', 'filename', 'filepath', 'path'] as $key) {
                self::collectSourcePart($parts, $result['file'][$key] ?? null, false);
            }
        }

        foreach (['filename', 'file_name', 'name', 'label', 'title', 'heading'] as $key) {
            self::collectSourcePart($parts, $result[$key] ?? null, false);
        }

        $snippetCandidate = $result['snippet'] ?? ($result['content'] ?? ($result['excerpt'] ?? null));
        self::collectSourcePart($parts, $snippetCandidate, true);

        return [
            'documentId' => self::sanitizeSourceId($result['document_id'] ?? ($result['file_id'] ?? ($result['id'] ?? null))),
            'url' => self::sanitizeUrl($result['url'] ?? ($result['link'] ?? null)),
            'parts' => $parts,
        ];
    }

    /**
     * @param list<string> $parts
     */
    private static function collectSourcePart(array &$parts, mixed $value, bool $isSnippet): void
    {
        if (!is_string($value)) {
            return;
        }

        $normalized = $isSnippet ? self::normalizeSnippet($value) : self::normalizeSourceText($value);
        if ($normalized === '') {
            return;
        }

        if (in_array($normalized, $parts, true)) {
            return;
        }

        $parts[] = $normalized;
    }

    private static function normalizeSourceText(string $value): string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return '';
        }

        $normalized = preg_replace('/\s+/u', ' ', $trimmed);

        return is_string($normalized) ? trim($normalized) : $trimmed;
    }

    private static function normalizeSnippet(string $value): string
    {
        $normalized = self::normalizeSourceText($value);
        if ($normalized === '') {
            return '';
        }

        $limit = 160;
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($normalized) > $limit) {
                $normalized = rtrim(mb_substr($normalized, 0, $limit - 1)) . '…';
            }
        } elseif (strlen($normalized) > $limit) {
            $normalized = rtrim(substr($normalized, 0, $limit - 1)) . '…';
        }

        return $normalized;
    }

    private static function sanitizeSourceId(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private static function sanitizeUrl(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        return filter_var($trimmed, FILTER_VALIDATE_URL) ? $trimmed : null;
    }
}
