<?php

namespace Questionnaire\Support;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\ServerException;
use GuzzleHttp\Exception\RequestException;

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
		public function send(array $payload): array
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

				$decoded = $this->decodeStream((string) $response->getBody());
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
    private function decodeStream(string $raw): array
    {
        $events = preg_split('/\r?\n\r?\n/', trim($raw));
        $output = [];
        $fallback = null;

        foreach ($events as $event) {
            $lines = preg_split('/\r?\n/', trim($event));
            foreach ($lines as $line) {
                if (!str_starts_with($line, 'data:')) {
                    continue;
                }

                $json = trim(substr($line, 5));
                if ($json === '' || $json === '[DONE]') {
                    continue;
                }

                $decoded = json_decode($json, true);
                if (!is_array($decoded)) {
                    continue;
                }

                $fallback = $decoded;

                if (isset($decoded['output']) && is_array($decoded['output'])) {
                    $output = $decoded['output'];
                }

                if (isset($decoded['delta']['output']) && is_array($decoded['delta']['output'])) {
                    foreach ($decoded['delta']['output'] as $chunk) {
                        $output[] = $chunk;
                    }
                }
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

        if (empty($session['summary']) && empty($session['recentTurns'])) {
            $messages[] = [
                'role' => 'system',
                // 'content' => Prompt::systemPrompt()
				'content' => [
					[
						'type' => 'input_text',
						'text' => Prompt::systemPrompt()
					]
				]				
            ];
        }

        if (!empty($session['summary'])) {
            $messages[] = [
                'role' => 'system',
                // 'content' => 'Résumé mémoire : ' . $session['summary']
				'content' => [
					[
						'type' => 'input_text',
						'text' => 'Résumé mémoire : ' . $session['summary']
					]
				]				
            ];
        }

        foreach ($session['recentTurns'] as $turn) {
            $messages[] = [
                'role' => $turn['role'],
                // 'content' => $turn['content']
				'content' => [
					[
						'type' => 'input_text',
						'text' => $turn['content']
					]
				]				
            ];
        }

        $messages[] = [
            'role' => 'user',
            // 'content' => $userMessage
				'content' => [
					[
						'type' => 'input_text',
						'text' => $userMessage
					]
				]			
        ];

        $payload = [
            'model' => 'gpt-5-mini',
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
}
