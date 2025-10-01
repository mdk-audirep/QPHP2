<?php

namespace Questionnaire\Support;

final class Env
{
    private static bool $initialized = false;
    private static array $values = [];

    public static function init(array $values): void
    {
        self::$values = [
            'OPENAI_API_KEY' => $values['OPENAI_API_KEY'] ?? null,
            'VECTOR_STORE_ID' => $values['VECTOR_STORE_ID'] ?? null,
            'PORT' => $values['PORT'] ?? '8080'
        ];
        self::$initialized = true;
    }

    public static function requireKeys(): void
    {
        if (!self::$initialized) {
            throw new \RuntimeException('Env not initialised');
        }

        if (!self::$values['OPENAI_API_KEY'] || !self::$values['VECTOR_STORE_ID']) {
            throw new MissingConfigurationException('Configuration manquante : OPENAI_API_KEY et VECTOR_STORE_ID doivent être définies.');
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$values[$key] ?? $default;
    }

    public static function openAiEnabled(): bool
    {
        return !empty(self::$values['OPENAI_API_KEY']) && !empty(self::$values['VECTOR_STORE_ID']);
    }
}

class MissingConfigurationException extends \RuntimeException
{
}
