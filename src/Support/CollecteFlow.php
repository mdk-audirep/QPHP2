<?php

namespace Questionnaire\Support;

final class CollecteFlow
{
    /**
     * @var array<int, array{id: string, order: int, label: string, prompt: string}>
     */
    private const QUESTIONS = [
        [
            'id' => 'entreprise',
            'order' => 1,
            'label' => 'Entreprise',
            // Utilisé comme question de repli lorsque l'Outil Recherche Auto ne détecte
            // aucune enseigne dans la requête utilisateur. La formulation exacte n'est
            // plus imposée par le système, mais ce texte sert de base pour relancer
            // l'utilisateur si nécessaire.
            'prompt' => "Quel est le nom de l'entreprise, son secteur d'activité, son positionnement et ses principaux concurrents ?",
        ],
        [
            'id' => 'cible',
            'order' => 2,
            'label' => 'Cible',
            'prompt' => "Qui est votre public cible ? Décrivez les caractéristiques démographiques et psychographiques (âge, sexe, localisation, CSP, clients vs prospects) et précisez les quotas ou segments d'analyse souhaités.",
        ],
        [
            'id' => 'echantillon',
            'order' => 3,
            'label' => 'Échantillon',
            'prompt' => "Quelle est la taille de l'échantillon prévue et la durée cible du questionnaire (<10 min, 10-20 questions) ?",
        ],
        [
            'id' => 'nombre_questions',
            'order' => 4,
            'label' => 'Nombre de questions souhaitées',
            'prompt' => "Combien de questions voulez-vous exactement dans le questionnaire ?",
        ],
        [
            'id' => 'mode',
            'order' => 5,
            'label' => 'Mode',
            'prompt' => 'Quel est le mode de collecte prévu (téléphone, online/email, face-à-face, papier, panel, observation) ?',
        ],
        [
            'id' => 'contexte',
            'order' => 6,
            'label' => 'Contexte',
            'prompt' => "Quel est le contexte stratégique de cette étude (suivi annuel, définition de segments, choix d'offre, analyse de prix, test d'offre, etc.) ?",
        ],
        [
            'id' => 'thematiques',
            'order' => 7,
            'label' => 'Thématiques',
            'prompt' => 'Quelles sont les thématiques prioritaires à couvrir (satisfaction, notoriété, intention d\'achat, prix, etc.) ? Listez-les par ordre de priorité.',
        ],
        [
            'id' => 'sensibilites',
            'order' => 8,
            'label' => 'Sensibilités',
            'prompt' => "Y a-t-il des thèmes sensibles (santé, argent, religion, etc.) ou des contraintes culturelles/linguistiques à prendre en compte ?",
        ],
        [
            'id' => 'introduction',
            'order' => 9,
            'label' => 'Introduction',
            'prompt' => "Dois-je écrire un mail d'invitation ou une introduction pour l'enquêteur (ou les deux) ?",
        ],
    ];

    /**
     * @return array<int, array{id: string, order: int, label: string, prompt: string, index: int}>
     */
    public static function questions(): array
    {
        $questions = [];
        foreach (self::QUESTIONS as $index => $question) {
            $questions[] = self::withIndex($question, $index);
        }

        return $questions;
    }

    public static function count(): int
    {
        return count(self::QUESTIONS);
    }

    /**
     * @return array{id: string, order: int, label: string, prompt: string, index: int}|null
     */
    public static function getQuestion(int $index): ?array
    {
        if ($index < 0 || $index >= count(self::QUESTIONS)) {
            return null;
        }

        return self::withIndex(self::QUESTIONS[$index], $index);
    }

    /**
     * @return array{id: string, order: int, label: string, prompt: string, index: int}|null
     */
    public static function getById(string $id): ?array
    {
        foreach (self::QUESTIONS as $index => $question) {
            if ($question['id'] === $id) {
                return self::withIndex($question, $index);
            }
        }

        return null;
    }

    /**
     * @param array{id: string, order: int, label: string, prompt: string} $question
     * @return array{id: string, order: int, label: string, prompt: string, index: int}
     */
    private static function withIndex(array $question, int $index): array
    {
        $question['index'] = $index;
        $question['order'] = $question['order'] ?? ($index + 1);

        return $question;
    }
}
