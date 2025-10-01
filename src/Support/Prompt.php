<?php

namespace Questionnaire\Support;

final class Prompt
{
    public const VERSION = 'qmpie_v3_2025-09-30';

    public static function systemPrompt(): string
    {
        return file_get_contents(__DIR__ . '/../../PROMPT_SYSTEM.md');
    }
}
