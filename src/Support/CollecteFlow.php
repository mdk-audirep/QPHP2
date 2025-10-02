<?php

namespace Questionnaire\Support;

final class CollecteFlow
{
    private const SOURCE_TRACEABILITY_INSTRUCTION = "Ajoute uniquement en fin de réponse les lignes «Sources internes utilisées : …» et «Sources web utilisées : …». Priorise toujours le vector store ; n'utilise la recherche web qu'en secours si l'information manque. N'ajoute aucun autre paragraphe.";

    /**
     * @var array<int, array{
     *     id: string,
     *     order: int,
     *     label: string,
     *     prompt: string,
     *     instructions: list<string>
     * }>
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
            'instructions' => [
                "Utilise l’Outil Recherche Auto pour analyser le dernier message utilisateur et détecter une entreprise ou une enseigne.",
                "Si tu en identifies une, réponds au format : «J’ai détecté [Nom] dans votre demande. Recherche auto : Secteur [secteur], Positionnement [positionnement], Concurrents [concurrents]. Correct ? Sinon, précisez.»",
                "Si aucune enseigne n'est détectée, pose la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'cible',
            'order' => 2,
            'label' => 'Cible',
            'prompt' => "Veuillez répondre à la question suivante : «Qui est votre public cible ? Décrivez les caractéristiques démographiques et psychographiques (âge, sexe, localisation, CSP, clients vs prospects) et précisez les quotas ou segments d'analyse souhaités.»",
            'instructions' => [
                "Analyse la réponse précédente pour suggérer des quotas types (âge, genre, localisation) si cela peut aider la réflexion.",
                "Pose ensuite la question suivante : {{prompt}}",
            ],
        ],
        [
            'id' => 'echantillon',
            'order' => 3,
            'label' => 'Échantillon',
            'prompt' => "Quelle est la taille de l'échantillon prévue et la durée cible du questionnaire (<10 min, 10-20 questions) ?",
            'instructions' => [
                "Rappelle les durées usuelles (moins de 10 min, 10-20 questions) si l'utilisateur n'a pas encore précisé ce point.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'nombre_questions',
            'order' => 4,
            'label' => 'Nombre de questions souhaitées',
            'prompt' => "Combien de questions voulez-vous exactement dans le questionnaire ?",
            'instructions' => [
                "Reformule la demande pour confirmer le volume de questions attendu.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'mode',
            'order' => 5,
            'label' => 'Mode',
            'prompt' => 'Quel est le mode de collecte prévu (téléphone, online/email, face-à-face, papier, panel, observation) ?',
            'instructions' => [
                "Présente les principaux modes de collecte possibles et invite l'utilisateur à confirmer ou compléter son choix.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'contexte',
            'order' => 6,
            'label' => 'Contexte',
            'prompt' => "Quel est le contexte stratégique de cette étude (suivi annuel, définition de segments, choix d'offre, analyse de prix, test d'offre, etc.) ?",
            'instructions' => [
                "Reformule brièvement le contexte stratégique déjà partagé pour montrer que tu l'as bien compris.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'thematiques',
            'order' => 7,
            'label' => 'Thématiques',
            'prompt' => 'Quelles sont les thématiques prioritaires à couvrir (satisfaction, notoriété, intention d\'achat, prix, etc.) ? Listez-les par ordre de priorité.',
            'instructions' => [
                "Suggère quelques thématiques classiques si l'utilisateur ne sait pas par où commencer.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'sensibilites',
            'order' => 8,
            'label' => 'Sensibilités',
            'prompt' => "Y a-t-il des thèmes sensibles (santé, argent, religion, etc.) ou des contraintes culturelles/linguistiques à prendre en compte ?",
            'instructions' => [
                "Précise l'importance de respecter les contraintes légales et culturelles associées aux thèmes sensibles.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
        [
            'id' => 'introduction',
            'order' => 9,
            'label' => 'Introduction',
            'prompt' => "Dois-je écrire un mail d'invitation ou une introduction pour l'enquêteur (ou les deux) ?",
            'instructions' => [
                "Invite l'utilisateur à préciser s'il souhaite un mail d'invitation, une introduction enquêteur ou les deux.",
                "Pose ensuite la question suivante : «{{prompt}}».",
            ],
        ],
    ];

    /**
     * @return array<int, array{id: string, order: int, label: string, prompt: string, instructions: list<string>, index: int}>
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
     * @return array{id: string, order: int, label: string, prompt: string, instructions: list<string>, index: int}|null
     */
    public static function getQuestion(int $index): ?array
    {
        if ($index < 0 || $index >= count(self::QUESTIONS)) {
            return null;
        }

        return self::withIndex(self::QUESTIONS[$index], $index);
    }

    /**
     * @return array{id: string, order: int, label: string, prompt: string, instructions: list<string>, index: int}|null
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
     * @return list<string>
     */
    public static function instructions(string $id): array
    {
        $question = self::getById($id);
        if ($question === null || !isset($question['instructions']) || !is_array($question['instructions'])) {
            return [];
        }

        $instructions = [];
        foreach ($question['instructions'] as $line) {
            if (is_string($line) && $line !== '') {
                $instructions[] = $line;
            }
        }

        return $instructions;
    }

    /**
     * @param list<string> $instructions
     * @return list<string>
     */
    public static function withSourceTraceability(array $instructions): array
    {
        if (!in_array(self::SOURCE_TRACEABILITY_INSTRUCTION, $instructions, true)) {
            array_unshift($instructions, self::SOURCE_TRACEABILITY_INSTRUCTION);
        }

        return $instructions;
    }

    public static function sourceTraceabilityInstruction(): string
    {
        return self::SOURCE_TRACEABILITY_INSTRUCTION;
    }

    /**
     * @param array{id: string, order: int, label: string, prompt: string, instructions: list<string>} $question
     * @return array{id: string, order: int, label: string, prompt: string, instructions: list<string>, index: int}
     */
    private static function withIndex(array $question, int $index): array
    {
        $question['index'] = $index;
        $question['order'] = $question['order'] ?? ($index + 1);

        return $question;
    }
}
