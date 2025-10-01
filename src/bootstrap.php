<?php

require_once __DIR__ . '/../vendor/autoload.php';

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'Questionnaire\\')) {
        return;
    }

    $relative = substr($class, strlen('Questionnaire\\'));
    $path = __DIR__ . '/' . str_replace('\\', '/', $relative) . '.php';
    if (file_exists($path)) {
        require $path;
    }
});

use Questionnaire\Support\Env;

$autoload = __DIR__ . '/../vendor/autoload.php';
if (file_exists($autoload)) {
    require $autoload;
}

if (class_exists('\\Dotenv\\Dotenv')) {
    $dotenv = \Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
    $dotenv->safeLoad();
}

Env::init([
    'OPENAI_API_KEY' => $_ENV['OPENAI_API_KEY'] ?? getenv('OPENAI_API_KEY') ?: null,
    'VECTOR_STORE_ID' => $_ENV['VECTOR_STORE_ID'] ?? getenv('VECTOR_STORE_ID') ?: null,
    'PORT' => $_ENV['PORT'] ?? getenv('PORT') ?: '8080'
]);

if (!is_dir(__DIR__ . '/../storage')) {
    mkdir(__DIR__ . '/../storage', 0775, true);
}
