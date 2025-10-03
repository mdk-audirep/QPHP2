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

		// Sources (déjà extraites depuis file_search/web_search par ta logique existante)
		$sources = self::extractSources($response);

		// ⬇️ AJOUT 1 : on nettoie les marqueurs internes "filecite … turnXfileY …"
		$markdown = self::stripInternalFileciteMarkers($markdown);

		// ⬇️ AJOUT 2 : si le modèle a imprimé ses sections "Sources …",
		//              on remplace leur contenu par nos listes propres (avec filenames)
		$markdown = self::injectResolvedSources($markdown, $sources);

		return [
			'markdown' => $markdown,
			'sources'  => $sources,
		];
	}

    /**
     * @return array{internal: list<string>, web: list<string>}
     */
 /**
 * Extrait des sources depuis la réponse Responses (file_search + web_search),
 * en gérant plusieurs schémas possibles (file_id/filename imbriqués).
 *
 * @param array $response payload Responses (issu du retrieve de préférence)
 * @return array{internal: array<int,array{filename:?string,file_id:?string,score:?float,snippet:?string}>, web: array<int,array{title:?string,url:?string}>}
 */
public static function extractSources(array $response): array
{
    $internal = [];
    $web      = [];

    $outputs = $response['output'] ?? [];
    if (!is_array($outputs)) $outputs = [];

    foreach ($outputs as $out) {
        // ===== FILE SEARCH =====
        $rslts = [];
        if (!empty($out['file_search_call']['search_results']) && is_array($out['file_search_call']['search_results'])) {
            $rslts = $out['file_search_call']['search_results'];
        } elseif (!empty($out['file_search_call']['results']) && is_array($out['file_search_call']['results'])) {
            $rslts = $out['file_search_call']['results'];
        }

        foreach ($rslts as $r) {
            // Essayons différentes “formes” possibles
            $fileId =
                ($r['file_id'] ?? null) ??
                ($r['file']['id'] ?? null) ??
                ($r['document_id'] ?? null) ??
                ($r['source']['file_id'] ?? null) ??
                ($r['vector_store_file_id'] ?? null);

            $filename =
                ($r['filename'] ?? null) ??
                ($r['file']['filename'] ?? null) ??
                ($r['display_name'] ?? null) ??
                ($r['attributes']['filename'] ?? null) ??
                ($r['source']['filename'] ?? null);

            // Snippet / extrait
            $snippet = $r['content'] ?? ($r['text'] ?? ($r['snippet'] ?? null));
            if (is_array($snippet)) {
                if (isset($snippet[0]['text'])) {
                    $snippet = $snippet[0]['text'];
                } else {
                    $snippet = json_encode($snippet, JSON_UNESCAPED_UNICODE);
                }
            }
            if (is_string($snippet)) $snippet = trim($snippet);

            // Score
            $score = null;
            if (isset($r['score']) && is_numeric($r['score'])) {
                $score = (float)$r['score'];
            } elseif (isset($r['relevance_score']) && is_numeric($r['relevance_score'])) {
                $score = (float)$r['relevance_score'];
            } elseif (isset($r['rank']) && is_numeric($r['rank'])) {
                // fallback: parfois un rang entier
                $score = (float)$r['rank'];
            }

            $internal[] = [
                'filename' => $filename,
                'file_id'  => $fileId,
                'score'    => $score,
                'snippet'  => $snippet,
            ];
        }

        // ===== WEB SEARCH (si tu l’utilises) =====
        $wrs = [];
        if (!empty($out['web_search_call']['search_results']) && is_array($out['web_search_call']['search_results'])) {
            $wrs = $out['web_search_call']['search_results'];
        } elseif (!empty($out['web_search_call']['results']) && is_array($out['web_search_call']['results'])) {
            $wrs = $out['web_search_call']['results'];
        }
        foreach ($wrs as $w) {
            $title = $w['title'] ?? ($w['name'] ?? null);
            $url   = $w['url']   ?? ($w['link'] ?? null);
            $web[] = [
                'title' => is_string($title) ? trim($title) : null,
                'url'   => is_string($url) ? trim($url) : null,
            ];
        }
    }

    // Dédup interne (file_id + snippet)
    $seen = []; $internalUniq = [];
    foreach ($internal as $s) {
        $key = ($s['file_id'] ?? 'null') . '|' . md5((string)($s['snippet'] ?? ''));
        if (!isset($seen[$key])) { $seen[$key] = true; $internalUniq[] = $s; }
    }

    return ['internal' => $internalUniq, 'web' => $web];
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
     * @return array{document_ids: list<string>, urls: list<string>}
     */
    public static function summarizeSourceReferences(array $payload): array
    {
        [$documents, $urls] = self::collectRawSources($payload);

        $documentIds = [];
        foreach (array_keys($documents) as $documentId) {
            if (!is_string($documentId)) {
                continue;
            }

            $normalized = trim($documentId);
            if ($normalized === '') {
                continue;
            }

            $documentIds[] = $normalized;
        }

        $urlList = [];
        foreach (array_keys($urls) as $url) {
            if (!is_string($url)) {
                continue;
            }

            $normalized = trim($url);
            if ($normalized === '') {
                continue;
            }

            $urlList[] = $normalized;
        }

        return [
            'document_ids' => array_values(array_unique($documentIds)),
            'urls' => array_values(array_unique($urlList)),
        ];
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
            return is_string($content) ? self::stripInternalFileciteMarkers($content) : '';
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
            return is_string($entry) ? self::stripInternalFileciteMarkers($entry) : '';
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
            return self::stripInternalFileciteMarkers($text);
        }

        if (is_array($text)) {
            $buffer = '';
            foreach ($text as $piece) {
                $buffer .= self::stringifyText($piece);
            }

            return self::stripInternalFileciteMarkers($buffer);
        }

        return '';
    }

	private static function stripInternalFileciteMarkers(string $text): string
	{
		$patterns = [
			// Variante historique encadrée
			'/∎\s*filecite.*?∎/su',
			// PUA + motif filecite + id "turnXfileY"
			'/[\p{Co}]*filecite[\p{Co}]*(?:turn\d+file\d+)[\p{Co}]*/u',
			// Résidu "turnXfileY" isolé
			'/\bturn\d+file\d+\b/u',
		];
		return preg_replace($patterns, '', $text);
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
/**
 * Collecte brute des sources depuis le payload Responses (file_search + web_search).
 * Retourne [$documents, $urls]
 * - $documents : array<string,array>  // clé = file_id (ou id proche), valeur = morceaux pour construire le label
 * - $urls      : array<string,array>  // clé = url, valeur = morceaux pour construire le label
 */
private static function collectRawSources(array $payload): array
{
    $documents = []; // file_id => parts (pour buildSourceLabel)
    $urls      = []; // url => parts

    $outputs = $payload['output'] ?? [];
    if (!is_array($outputs)) $outputs = [];

    foreach ($outputs as $out) {
        // ===== FILE SEARCH =====
        $fs = $out['file_search_call'] ?? null;
        if (is_array($fs)) {
            $results = [];
            if (!empty($fs['search_results']) && is_array($fs['search_results'])) {
                $results = $fs['search_results'];
            } elseif (!empty($fs['results']) && is_array($fs['results'])) {
                $results = $fs['results'];
            }

            foreach ($results as $r) {
                // ID du fichier : essayer plusieurs schémas
                $fileId =
                    ($r['file_id'] ?? null) ??
                    ($r['file']['id'] ?? null) ??
                    ($r['document_id'] ?? null) ??
                    ($r['source']['file_id'] ?? null) ??
                    ($r['vector_store_file_id'] ?? null);

                if (!$fileId || !is_string($fileId)) {
                    // si on n'a vraiment rien, on skip (sinon on ne saura pas résoudre le nom ensuite)
                    continue;
                }

                // Filename si déjà présent dans le résultat
                $filename =
                    ($r['filename'] ?? null) ??
                    ($r['file']['filename'] ?? null) ??
                    ($r['display_name'] ?? null) ??
                    ($r['attributes']['filename'] ?? null) ??
                    ($r['source']['filename'] ?? null);

                // Snippet (pour dédup + label)
                $snippet = $r['content'] ?? ($r['text'] ?? ($r['snippet'] ?? null));
                if (is_array($snippet)) {
                    $snippet = isset($snippet[0]['text']) ? $snippet[0]['text'] : json_encode($snippet, JSON_UNESCAPED_UNICODE);
                }
                if (is_string($snippet)) $snippet = trim($snippet);

                // Score / rang
                $score = null;
                if (isset($r['score']) && is_numeric($r['score'])) {
                    $score = (float)$r['score'];
                } elseif (isset($r['relevance_score']) && is_numeric($r['relevance_score'])) {
                    $score = (float)$r['relevance_score'];
                } elseif (isset($r['rank']) && is_numeric($r['rank'])) {
                    $score = (float)$r['rank'];
                }

                // Parts pour buildSourceLabel : on place filename si dispo en tête
                $parts = [];
                if ($filename) $parts[] = $filename;
                if ($snippet)  $parts[] = $snippet;
                if ($score !== null) $parts[] = 'score:' . $score;

                // Agrégation par fileId
                if (!isset($documents[$fileId])) {
                    $documents[$fileId] = $parts;
                } else {
                    // merge simple, sans doublon
                    foreach ($parts as $p) {
                        if ($p !== null && !in_array($p, $documents[$fileId], true)) {
                            $documents[$fileId][] = $p;
                        }
                    }
                }
            }
        }

        // ===== WEB SEARCH =====
        $ws = $out['web_search_call'] ?? null;
        if (is_array($ws)) {
            $wresults = [];
            if (!empty($ws['search_results']) && is_array($ws['search_results'])) {
                $wresults = $ws['search_results'];
            } elseif (!empty($ws['results']) && is_array($ws['results'])) {
                $wresults = $ws['results'];
            }

            foreach ($wresults as $w) {
                $title = $w['title'] ?? ($w['name'] ?? null);
                $url   = $w['url']   ?? ($w['link'] ?? null);
                if (!$url || !is_string($url)) continue;

                $parts = [];
                if ($title) $parts[] = $title;

                if (!isset($urls[$url])) {
                    $urls[$url] = $parts;
                } else {
                    foreach ($parts as $p) {
                        if ($p !== null && !in_array($p, $urls[$url], true)) {
                            $urls[$url][] = $p;
                        }
                    }
                }
            }
        }
    }

    return [$documents, $urls];
}


    /**
     * @return array<string, string>
     */
    private static function extractResolvedFileNames(array $payload): array
    {
        if (!isset($payload['resolved_file_names']) || !is_array($payload['resolved_file_names'])) {
            return [];
        }

        $result = [];
        foreach ($payload['resolved_file_names'] as $id => $name) {
            if (!is_string($id) || !is_string($name)) {
                continue;
            }

            $normalizedId = trim($id);
            $normalizedName = trim($name);

            if ($normalizedId === '' || $normalizedName === '') {
                continue;
            }

            $result[$normalizedId] = $normalizedName;
        }

        return $result;
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

    private static function generateInternalPlaceholderLabel(int $index): string
    {
        return sprintf('Document interne %d', $index);
    }

    private static function isGeneratedDocumentId(string $value): bool
    {
        return preg_match('/\\\\turn\d+file\d+$/', $value) === 1;
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
        foreach (self::extractSourceValues($value) as $candidate) {
            $normalized = $isSnippet ? self::normalizeSnippet($candidate) : self::normalizeSourceText($candidate);
            if ($normalized === '') {
                continue;
            }

            if (in_array($normalized, $parts, true)) {
                continue;
            }

            $parts[] = $normalized;
        }
    }

    /**
     * @return list<string>
     */
    private static function extractSourceValues(mixed $value): array
    {
        if (is_string($value)) {
            return [$value];
        }

        if (is_array($value)) {
            $results = [];

            foreach ($value as $entry) {
                foreach (self::extractSourceValues($entry) as $nested) {
                    $results[] = $nested;
                }
            }

            return $results;
        }

        return [];
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
	private static function injectResolvedSources(string $markdown, array $sources): string
	{
		// Normalise la structure attendue
		$internal = [];
		$web      = [];

		if (isset($sources['internal']) && is_array($sources['internal'])) {
			$internal = $sources['internal'];
		} elseif (isset($sources[0]) && is_array($sources[0])) {
			// compat : si la liste est plate
			$internal = $sources;
		}
		if (isset($sources['web']) && is_array($sources['web'])) {
			$web = $sources['web'];
		}

		// Construit les listes formatées
		$internalLines = [];
		foreach ($internal as $s) {
			// on affiche en priorité le filename résolu, sinon le file_id
			$name = $s['filename'] ?? ($s['file_id'] ?? null);
			if (!$name) continue;
			$internalLines[] = '- ' . $name;
		}
		if (!$internalLines) {
			$internalLines[] = 'Aucune';
		}

		$webLines = [];
		foreach ($web as $w) {
			// adapte si ton extracteur utilise d'autres clés ('title', 'url', etc.)
			$label = $w['title'] ?? ($w['url'] ?? null);
			if (!$label) continue;
			$webLines[] = '- ' . $label;
		}
		if (!$webLines) {
			$webLines[] = 'Aucune recherche web effectuée';
		}

		// Remplacement ciblé des blocs si présents
		$markdown = self::replaceSourcesBlock($markdown, 'Sources internes utilisées', $internalLines);
		$markdown = self::replaceSourcesBlock($markdown, 'Sources web utilisées',      $webLines);

		return $markdown;
	}


	/**
	 * Remplace le contenu d’un bloc commençant par un titre "label"
	 * jusqu’au prochain titre (##, ###, ou une autre section "Sources …") ou fin de document.
	 */
/**
 * Remplace le contenu d’un bloc commençant par un titre "label"
 * jusqu’au prochain titre (##, ###, ou une autre section "Sources …") ou fin de document.
 */
	private static function replaceSourcesBlock(string $markdown, string $label, array $lines): string
	{
		if (stripos($markdown, $label) === false) {
			return $markdown;
		}

		// Regex multi-lignes, non-gourmande : capture après "label" jusqu'au prochain titre ou fin
		$pattern = '/(^|\R)([ \t>*_-]*' . preg_quote($label, '/') . '\s*:?)(.*?)(?=(\R\s*#{1,6}\s|\R\s*[ \t>*_-]*Sources\s+(?:internes|web)\s+utilisées\s*:|\z))/isu';

		return preg_replace_callback($pattern, function ($m) use ($label, $lines) {
			$prefix  = $m[1] ?? '';
			$heading = $m[2] ?? $label;
			$list    = implode("\n", $lines);
			// Réécrit proprement le bloc : titre + liste
			return $prefix . $heading . "\n" . $list . "\n";
		}, $markdown, 1);
	}

}
