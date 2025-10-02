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
			$headers = [
				'Authorization' => 'Bearer ' . Env::get('OPENAI_API_KEY'),
				'Content-Type'  => 'application/json',
			];

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
				return $decoded;
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

        $processEvent = function (array $lines) use (&$output, &$fallback, $onDelta, &$done): void {
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

            if (isset($decoded['output']) && is_array($decoded['output'])) {
                $output = $decoded['output'];
            }

            if (isset($decoded['delta']['output']) && is_array($decoded['delta']['output'])) {
                foreach ($decoded['delta']['output'] as $chunk) {
                    $output[] = $chunk;
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

        if (!empty($output)) {
            return ['output' => $output];
        }

        if ($fallback) {
            return $fallback;
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
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
                $systemText = sprintf(
                    "Phase collecte – question %d/%d (%s).\nPose uniquement la question suivante : «%s».\nAucune autre sortie n'est autorisée. Termine strictement par «⚠️ Attente réponse utilisateur». Reste en phase collecte et ne démarre ni plan, ni génération avant la fin des 9 questions obligatoires.",
                    $pendingQuestion['order'],
                    $total,
                    $pendingQuestion['label'],
                    $pendingQuestion['prompt']
                );

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
            'model' => 'gpt-5',
            'reasoning' => ['effort' => 'high'],
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
            ]
        ];

        if ($finalOverride) {
            $payload['text'] = ['verbosity' => 'high'];
            $payload['max_output_tokens'] = 20000;
        }
        return $payload;
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
}




