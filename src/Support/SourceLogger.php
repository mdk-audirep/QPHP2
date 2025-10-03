<?php
namespace Questionnaire\Support;

final class SourceLogger
{
    /**
     * Append sources to a .txt log (1 block per response).
     *
     * @param string $logPath   Absolute or relative path to the .txt file
     * @param string|null $responseId
     * @param string|null $sessionId
     * @param array $sources    Array like ['internal' => [...], 'web' => [...]]
     * @return void
     */
    public static function append(string $logPath, ?string $responseId, ?string $sessionId, array $sources): void
    {
        try {
            // Ensure directory exists
            $dir = dirname($logPath);
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }

            $ts = (new \DateTimeImmutable('now'))->format('Y-m-d H:i:s');

            // Build lines
            $lines   = [];
            $lines[] = str_repeat('=', 80);
            $lines[] = "time={$ts}  response_id=" . ($responseId ?? 'n/a') . "  session_id=" . ($sessionId ?? 'n/a');

            // Internal (vector store) sources
            $internal = $sources['internal'] ?? [];
            if (!empty($internal)) {
                $lines[] = "internal_sources:";
                foreach ($internal as $s) {
                    $name  = $s['filename'] ?? ($s['file_id'] ?? '[unknown]');
                    $fid   = $s['file_id'] ?? '-';
                    $score = isset($s['score']) ? (string)$s['score'] : 'n/a';
                    $lines[] = "  - filename=\"{$name}\"  file_id={$fid}  score={$score}";
                }
            } else {
                $lines[] = "internal_sources: none";
            }

            // Web sources (if you log them)
            $web = $sources['web'] ?? [];
            if (!empty($web)) {
                $lines[] = "web_sources:";
                foreach ($web as $w) {
                    $title = isset($w['title']) ? trim((string)$w['title']) : '';
                    $url   = isset($w['url'])   ? trim((string)$w['url'])   : '';
                    $lines[] = "  - title=\"" . ($title !== '' ? $title : '[untitled]') . "\"  url=" . ($url ?: '-');
                }
            } else {
                $lines[] = "web_sources: none";
            }

            $lines[] = ''; // trailing newline

            // Append with basic locking
            $fh = @fopen($logPath, 'ab');
            if ($fh) {
                if (@flock($fh, LOCK_EX)) {
                    fwrite($fh, implode(PHP_EOL, $lines));
                    fflush($fh);
                    @flock($fh, LOCK_UN);
                }
                fclose($fh);
            }
        } catch (\Throwable $e) {
            // Silent failure (don’t break the app for logging)
            error_log('[SourceLogger] ' . $e->getMessage());
        }
    }
}
