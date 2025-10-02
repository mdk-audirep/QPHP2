<?php

namespace Psr\Http\Message {
    if (!interface_exists(StreamInterface::class)) {
        interface StreamInterface
        {
            public function __toString();

            public function close();

            public function detach();

            public function getSize();

            public function tell();

            public function eof();

            public function isSeekable();

            public function seek($offset, $whence = SEEK_SET);

            public function rewind();

            public function isWritable();

            public function write($string);

            public function isReadable();

            public function read($length);

            public function getContents();

            public function getMetadata($key = null);
        }
    }
}

namespace {
    use Questionnaire\Support\OpenAIClient;
    use Questionnaire\Support\ResponseFormatter;
    use Psr\Http\Message\StreamInterface;

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
        class ResponseFormatterTestGuzzleStub
        {
            public function __construct(array $config = [])
            {
            }
        }

        class_alias(ResponseFormatterTestGuzzleStub::class, 'GuzzleHttp\\Client');
    }

    final class InMemoryStream implements StreamInterface
    {
        private string $buffer;
        private int $position = 0;

        public function __construct(string $buffer)
        {
            $this->buffer = $buffer;
        }

        public function __toString(): string
        {
            return $this->buffer;
        }

        public function close(): void
        {
            $this->position = 0;
        }

        public function detach()
        {
            return null;
        }

        public function getSize(): ?int
        {
            return strlen($this->buffer);
        }

        public function tell(): int
        {
            return $this->position;
        }

        public function eof(): bool
        {
            return $this->position >= strlen($this->buffer);
        }

        public function isSeekable(): bool
        {
            return true;
        }

        public function seek($offset, $whence = SEEK_SET): void
        {
            $size = strlen($this->buffer);
            $target = $this->position;

            switch ($whence) {
                case SEEK_SET:
                    $target = (int) $offset;
                    break;
                case SEEK_CUR:
                    $target += (int) $offset;
                    break;
                case SEEK_END:
                    $target = $size + (int) $offset;
                    break;
                default:
                    throw new RuntimeException('Invalid whence provided to seek.');
            }

            if ($target < 0) {
                $target = 0;
            }

            if ($target > $size) {
                $target = $size;
            }

            $this->position = $target;
        }

        public function rewind(): void
        {
            $this->position = 0;
        }

        public function isWritable(): bool
        {
            return false;
        }

        public function write($string): int
        {
            throw new RuntimeException('Stream is read-only.');
        }

        public function isReadable(): bool
        {
            return true;
        }

        public function read($length): string
        {
            $length = max(0, (int) $length);
            if ($length === 0 || $this->eof()) {
                return '';
            }

            $chunk = substr($this->buffer, $this->position, $length);
            $this->position += strlen($chunk);

            return $chunk;
        }

        public function getContents(): string
        {
            $remaining = substr($this->buffer, $this->position);
            $this->position = strlen($this->buffer);

            return $remaining;
        }

        public function getMetadata($key = null)
        {
            return null;
        }
    }

    $toolCallEvent = json_encode([
        'type' => 'response.tool_calls.delta',
        'delta' => [
            'tool_calls' => [
                [
                    'type' => 'file_search',
                    'id' => 'tool_file',
                    'file_search' => [
                        'results' => [
                            ['document_id' => 'doc_A'],
                        ],
                    ],
                    'file_search_call' => [
                        'search_results' => [
                            [
                                'document_id' => 'doc_A',
                                'file' => ['filename' => 'Guide interne.md'],
                                'snippet' => 'Section 2 – Aperçu',
                            ],
                        ],
                    ],
                ],
                [
                    'type' => 'web_search',
                    'id' => 'tool_web',
                    'web_search' => [
                        'results' => [
                            ['url' => 'https://example.net/resource'],
                        ],
                    ],
                    'web_search_call' => [
                        'search_results' => [
                            [
                                'url' => 'https://example.net/resource',
                                'title' => 'Article externe',
                                'snippet' => 'Résumé du contenu',
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $outputEvent = json_encode([
        'type' => 'response.output_text.delta',
        'delta' => [
            'output' => [
                [
                    'content' => [
                        ['type' => 'output_text_delta', 'text' => 'Bonjour']
                    ],
                ],
            ],
        ],
        'output' => [
            [
                'content' => [
                    [
                        'type' => 'output_text',
                        'text' => 'Bonjour',
                        'annotations' => [
                            ['type' => 'file_citation', 'document_id' => 'doc_B'],
                            ['type' => 'url_citation', 'url' => 'https://example.org/article'],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $streamContent = sprintf(
        "data: %s\n\n" .
        "data: %s\n\n" .
        "data: [DONE]\n\n",
        $toolCallEvent,
        $outputEvent
    );

    $stream = new InMemoryStream($streamContent);
    $client = new OpenAIClient();

    $reflection = new ReflectionClass(OpenAIClient::class);
    $method = $reflection->getMethod('decodeStream');
    $method->setAccessible(true);

    /** @var array<string, mixed> $payload */
    $payload = $method->invoke($client, $stream, null);

    if (!isset($payload['sources'])) {
        throw new RuntimeException('Les sources agrégées sont absentes.');
    }

    $internal = $payload['sources']['internal'] ?? [];
    $web = $payload['sources']['web'] ?? [];

    $expectedInternal = ['Guide interne.md — Section 2 – Aperçu', 'doc_B'];
    if ($internal !== $expectedInternal) {
        throw new RuntimeException('Sources internes incorrectes : ' . json_encode($internal, JSON_UNESCAPED_UNICODE));
    }

    $expectedWeb = ['Article externe — Résumé du contenu — https://example.net/resource', 'https://example.org/article'];
    if ($web !== $expectedWeb) {
        throw new RuntimeException('Sources web incorrectes : ' . json_encode($web, JSON_UNESCAPED_UNICODE));
    }

    $assistant = ResponseFormatter::formatAssistantResponse($payload);

    if ($assistant['markdown'] !== 'Bonjour') {
        throw new RuntimeException('Le markdown extrait est incorrect.');
    }

    if ($assistant['sources']['internal'] !== $internal) {
        throw new RuntimeException('Les sources internes formatées sont incorrectes.');
    }

    if ($assistant['sources']['web'] !== $web) {
        throw new RuntimeException('Les sources web formatées sont incorrectes.');
    }

    echo "ResponseFormatter sources test passed with search result labels.\n";
}
