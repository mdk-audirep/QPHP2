<?php

namespace Questionnaire\Support;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Exception\ServerException;
use Psr\Http\Message\StreamInterface;

final class OpenAIClient
{
    private Client $client;
    /**
     * @var array<string, string>
     */
    private array $fileNameCache = [];

    public function __construct()
    {
        $this->client = new Client([
            'base_uri' => 'https://api.openai.com/v1/',
            'timeout' => 600,
        ]);
    }

    // public function send(array $payload): array
    // {
        // $headers = [
            // 'Authorization' => 'Bearer ' . Env::get('OPENAI_API_KEY'),
            // 'Content-Type' => 'application/json'
        // ];

        // try {
            // $response = $this->client->post('responses', [
                // 'headers' => $headers,
                // 'body' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                // 'stream' => true
            // ]);
        // } catch (GuzzleException $exception) {
            // throw new \RuntimeException('Appel OpenAI impossible : ' . $exception->getMessage(), 0, $exception);
			// error_log('[OpenAI 4xx] ' . (string)$exception->getResponse()->getBody());
        // }

        // $payload = $this->decodeStream((string) $response->getBody());
        // if (!is_array($payload)) {
            // throw new \RuntimeException('Réponse OpenAI illisible');
        // }

        // return $payload;
    // }
                public function send(array $payload, ?callable $onDelta = null): array
                {
                        $headers = $this->defaultHeaders();
                        $headers['Content-Type'] = 'application/json';

			try {
				// (facultatif) log minimal côté requête, sans la clé
				error_log('[OpenAI request] ' . json_encode([
					'endpoint' => 'responses',
					'model'    => $payload['model'] ?? null,
					'has_tools' => isset($payload['tools']),
					'has_tool_resources' => isset($payload['tool_resources']),
					'stream'   => $payload['stream'] ?? null,
				], JSON_UNESCAPED_UNICODE));

                                $response = $this->client->post('responses', [
                                        'headers' => $headers,
                                        // mieux que 'body' : laisse Guzzle encoder et définir content-length
                                        'json'    => $payload,
					// ce 'stream' indique à Guzzle de ne pas bufferiser la réponse côté client PHP.
					// (OK pour SSE ; ta méthode decodeStream() devra lire le flux chunk par chunk)
					'stream'  => true,
					'timeout' => 120,
				]);

                                $decoded = $this->decodeStream($response->getBody(), $onDelta);
                                if (!is_array($decoded)) {
                                        throw new \RuntimeException('Réponse OpenAI illisible');
                                }
                                return $this->enrichWithFileMetadata($decoded);
			}
			catch (ClientException $e) { // 4xx
				$body = $e->hasResponse() ? (string) $e->getResponse()->getBody() : '';
				error_log('[OpenAI 4xx] ' . $body);
				throw new \RuntimeException(
					'Appel OpenAI impossible (4xx): ' . ($body ?: $e->getMessage()),
					$e->getCode(),
					$e
				);
			}
			catch (ServerException $e) { // 5xx
				$body = $e->hasResponse() ? (string) $e->getResponse()->getBody() : '';
				error_log('[OpenAI 5xx] ' . $body);
				throw new \RuntimeException(
					'Appel OpenAI impossible (5xx): ' . ($body ?: $e->getMessage()),
					$e->getCode(),
					$e
				);
			}
			catch (RequestException $e) { // réseau/timeout/SSL
				error_log('[OpenAI request error] ' . $e->getMessage());
				throw new \RuntimeException('Erreur réseau OpenAI: ' . $e->getMessage(), $e->getCode(), $e);
			}
		}
    private function decodeStream(StreamInterface $stream, ?callable $onDelta): array
    {
        $output = [];
        $fallback = null;
        $buffer = '';
        $eventLines = [];
        $done = false;
        $raw = '';
        $aggregatedSources = [
            'internal' => [],
            'web' => [],
        ];

        $appendSources = function (array $payload) use (&$aggregatedSources): void {
            $sources = ResponseFormatter::extractSources($payload);
            $aggregatedSources['internal'] = self::mergeSourceList($aggregatedSources['internal'], $sources['internal']);
            $aggregatedSources['web'] = self::mergeSourceList($aggregatedSources['web'], $sources['web']);
        };

        $processEvent = function (array $lines) use (&$output, &$fallback, $onDelta, &$done, $appendSources): void {
            if ($done) {
                return;
            }

            $dataLines = [];
            foreach ($lines as $line) {
                if (!str_starts_with($line, 'data:')) {
                    continue;
                }

                $dataLines[] = ltrim(substr($line, 5));
            }

            if ($dataLines === []) {
                return;
            }

            $json = trim(implode("\n", $dataLines));
            if ($json === '' || $json === '[DONE]') {
                if ($json === '[DONE]') {
                    $done = true;
                }

                return;
            }

            $decoded = json_decode($json, true);
            if (!is_array($decoded)) {
                return;
            }

            $fallback = $decoded;
            $appendSources($decoded);

            if (isset($decoded['output']) && is_array($decoded['output'])) {
                $output = $decoded['output'];
            }

            if (isset($decoded['delta']['output']) && is_array($decoded['delta']['output'])) {
                if (!isset($decoded['output'])) {
                    foreach ($decoded['delta']['output'] as $chunk) {
                        $output[] = $chunk;
                    }
                }

                if ($onDelta !== null) {
                    $text = ResponseFormatter::stringifyDeltaOutput($decoded['delta']['output']);
                    if ($text !== '') {
                        $onDelta($text);
                    }
                }
            }
        };

        while (!$done && !$stream->eof()) {
            $chunk = $stream->read(8192);
            if ($chunk === '') {
                usleep(10000);
                continue;
            }

            $buffer .= $chunk;
            $raw .= $chunk;

            while (!$done) {
                $newlinePosition = strpos($buffer, "\n");
                if ($newlinePosition === false) {
                    break;
                }

                $line = substr($buffer, 0, $newlinePosition);
                $buffer = substr($buffer, $newlinePosition + 1);
                $line = rtrim($line, "\r");

                if ($line === '') {
                    $processEvent($eventLines);
                    $eventLines = [];
                } else {
                    $eventLines[] = $line;
                }
            }
        }

        if (!$done && ($eventLines !== [] || $buffer !== '')) {
            if ($buffer !== '') {
                $eventLines[] = rtrim($buffer, "\r");
            }

            if ($eventLines !== []) {
                $processEvent($eventLines);
            }
        }

        $hasSources = $aggregatedSources['internal'] !== [] || $aggregatedSources['web'] !== [];

        if (!empty($output)) {
            $result = ['output' => $output];
            if ($hasSources) {
                $result['sources'] = $aggregatedSources;
            }

            return $result;
        }

        if ($fallback) {
            if ($hasSources) {
                $existingInternal = self::normalizeSourceList($fallback['sources']['internal'] ?? null);
                $existingWeb = self::normalizeSourceList($fallback['sources']['web'] ?? null);
                $fallback['sources'] = [
                    'internal' => self::mergeSourceList($existingInternal, $aggregatedSources['internal']),
                    'web' => self::mergeSourceList($existingWeb, $aggregatedSources['web']),
                ];
            }

            return $fallback;
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            if ($hasSources) {
                $existingInternal = self::normalizeSourceList($decoded['sources']['internal'] ?? null);
                $existingWeb = self::normalizeSourceList($decoded['sources']['web'] ?? null);
                $decoded['sources'] = [
                    'internal' => self::mergeSourceList($existingInternal, $aggregatedSources['internal']),
                    'web' => self::mergeSourceList($existingWeb, $aggregatedSources['web']),
                ];
            }

            return $decoded;
        }

        if ($hasSources) {
            return ['sources' => $aggregatedSources];
        }

        return [];
    }

    public function buildPayload(array $session, string $userMessage, bool $finalOverride = false): array
    {
        $messages = [];

        if (($session['phase'] ?? 'collecte') === 'collecte') {
            $pendingQuestion = SessionStore::getPendingCollecteQuestion($session);
            if ($pendingQuestion !== null) {
                $total = CollecteFlow::count();
                $systemLines = [
                    sprintf(
                        'Phase collecte – question %d/%d (%s).',
                        $pendingQuestion['order'],
                        $total,
                        $pendingQuestion['label']
                    ),
                ];

                foreach ($this->buildQuestionInstructions($pendingQuestion) as $instruction) {
                    $systemLines[] = $instruction;
                }

                $systemLines[] = "Aucune autre sortie n'est autorisée.";
                $systemLines[] = "Termine strictement par «⚠️ Attente réponse utilisateur».";
                $systemLines[] = "Reste en phase collecte et ne démarre ni plan, ni génération avant la fin des 9 questions obligatoires.";

                $systemText = implode("\n", $systemLines);

                $messages[] = [
                    'role' => 'system',
                    'content' => $this->buildTextContent('system', $systemText)
                ];
            }
        }

        if (empty($session['summary']) && empty($session['recentTurns'])) {
            $messages[] = [
                'role' => 'system',
                // 'content' => Prompt::systemPrompt()
                'content' => $this->buildTextContent('system', Prompt::systemPrompt())
            ];
        }

        if (!empty($session['summary'])) {
            $messages[] = [
                'role' => 'system',
                // 'content' => 'Résumé mémoire : ' . $session['summary']
                'content' => $this->buildTextContent('system', 'Résumé mémoire : ' . $session['summary'])
            ];
        }

        foreach ($session['recentTurns'] as $turn) {
            $messages[] = [
                'role' => $turn['role'],
                // 'content' => $turn['content']
                'content' => $this->buildTextContent($turn['role'], $turn['content'])
            ];
        }

        $messages[] = [
            'role' => 'user',
            // 'content' => $userMessage
            'content' => $this->buildTextContent('user', $userMessage)
        ];

        $payload = [
            'model' => 'gpt-5-mini',
            'reasoning' => ['effort' => 'medium'],
            'stream' => true,
            'parallel_tool_calls' => true,
			'tools' => [
				[
					'type' => 'file_search',
					'vector_store_ids' => [Env::get('VECTOR_STORE_ID')]
				],
				[
					'type' => 'web_search'
				]		
				],
			    'tool_choice' => 'auto',
            // 'tools' => [
                // ['type' => 'file_search'],
                // ['type' => 'web_search']
            // ],
			  // "tools": [
				// { "type": "file_search", "vector_store_ids": [Env::get('VECTOR_STORE_ID')] },
				// { "type": "web_search" }
			  // ],			
            // 'tool_resources' => [
                // 'file_search' => [
                    // 'vector_store_ids' => [Env::get('VECTOR_STORE_ID')]
                // ]
            // ],			
            'input' => $messages,
            'metadata' => [
                'session_id' => $session['id'],
                'prompt_version' => $session['promptVersion']
            ],
            'include' => [
                'output[*].file_search_call.search_results',
                'output[*].web_search_call.search_results',
            ]
        ];

        if ($finalOverride) {
            $payload['text'] = ['verbosity' => 'high'];
            $payload['max_output_tokens'] = 20000;
        }
        return $payload;
    }

    /**
     * @param array{id: string, prompt: string} $pendingQuestion
     * @return list<string>
     */
    private function buildQuestionInstructions(array $pendingQuestion): array
    {
        $baseInstructions = CollecteFlow::instructions($pendingQuestion['id']);
        $instructions = CollecteFlow::withSourceTraceability($baseInstructions);

        if ($baseInstructions === []) {
            $instructions[] = sprintf('Pose la question suivante : «%s».', $pendingQuestion['prompt']);
        }

        $resolved = [];
        foreach ($instructions as $line) {
            $resolved[] = str_replace('{{prompt}}', $pendingQuestion['prompt'], $line);
        }

        return $resolved;
    }
    /**
     * @return array<int, array{type: string, text: string}>
     */
    private function buildTextContent(string $role, string $text): array
    {
        $normalizedRole = strtolower(trim($role));
        $type = $normalizedRole === 'assistant' ? 'output_text' : 'input_text';

        return [[
            'type' => $type,
            'text' => $text,
        ]];
    }

    /**
     * @return array<string, string>
     */
    private function defaultHeaders(): array
    {
        return [
            'Authorization' => 'Bearer ' . Env::get('OPENAI_API_KEY'),
        ];
    }

    private function enrichWithFileMetadata(array $payload): array
    {
        $references = ResponseFormatter::summarizeSourceReferences($payload);
        $fileIds = $references['document_ids'] ?? [];

        if (!is_array($fileIds) || $fileIds === []) {
            return $payload;
        }

        $resolved = $this->resolveFileNames($fileIds);
        if ($resolved === []) {
            return $payload;
        }

        if (!isset($payload['resolved_file_names']) || !is_array($payload['resolved_file_names'])) {
            $payload['resolved_file_names'] = [];
        }

        foreach ($resolved as $id => $name) {
            $current = $payload['resolved_file_names'][$id] ?? null;
            if (!is_string($current) || trim($current) === '') {
                $payload['resolved_file_names'][$id] = $name;
            }
        }

        return $payload;
    }

    /**
     * @param list<string> $fileIds
     * @return array<string, string>
     */
    private function resolveFileNames(array $fileIds): array
    {
        $result = [];
        $missing = [];

        foreach ($fileIds as $fileId) {
            if (!is_string($fileId)) {
                continue;
            }

            $normalized = trim($fileId);
            if ($normalized === '') {
                continue;
            }

            if (isset($this->fileNameCache[$normalized])) {
                $result[$normalized] = $this->fileNameCache[$normalized];
                continue;
            }

            $missing[] = $normalized;
        }

        foreach ($missing as $fileId) {
            $name = $this->fetchFileName($fileId);
            if ($name === null) {
                continue;
            }

            $this->fileNameCache[$fileId] = $name;
            $result[$fileId] = $name;
        }

        return $result;
    }

    private function fetchFileName(string $fileId): ?string
    {
        try {
            $response = $this->client->get('files/' . rawurlencode($fileId), [
                'headers' => $this->defaultHeaders(),
            ]);
        } catch (ClientException | ServerException | RequestException $exception) {
            error_log('[OpenAI file metadata] ' . $exception->getMessage());
            return null;
        }

        $payload = json_decode((string) $response->getBody(), true);
        if (!is_array($payload)) {
            return null;
        }

        $candidates = [
            $payload['display_name'] ?? null,
            $payload['filename'] ?? null,
            $payload['name'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $normalized = $this->sanitizeFileNameCandidate($candidate);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        if (isset($payload['metadata']) && is_array($payload['metadata'])) {
            foreach (['display_name', 'filename', 'name'] as $key) {
                if (!array_key_exists($key, $payload['metadata'])) {
                    continue;
                }

                $normalized = $this->sanitizeFileNameCandidate($payload['metadata'][$key]);
                if ($normalized !== null) {
                    return $normalized;
                }
            }
        }

        return null;
    }

    private function sanitizeFileNameCandidate(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @param list<string>|mixed $value
     * @return list<string>
     */
    private static function normalizeSourceList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }

        $normalized = [];
        foreach ($value as $entry) {
            if (!is_string($entry)) {
                continue;
            }

            $trimmed = trim($entry);
            if ($trimmed === '') {
                continue;
            }

            $normalized[] = $trimmed;
        }

        return self::mergeSourceList([], $normalized);
    }

    /**
     * @param list<string> $existing
     * @param list<string> $additional
     * @return list<string>
     */
    private static function mergeSourceList(array $existing, array $additional): array
    {
        $seen = [];
        $result = [];

        foreach ([$existing, $additional] as $list) {
            foreach ($list as $value) {
                if (!is_string($value)) {
                    continue;
                }

                $trimmed = trim($value);
                if ($trimmed === '') {
                    continue;
                }

                if (isset($seen[$trimmed])) {
                    continue;
                }

                $seen[$trimmed] = true;
                $result[] = $trimmed;
            }
        }

        return $result;
    }
}






