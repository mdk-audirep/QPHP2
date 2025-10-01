# QuestionnaireMasterPIE (version PHP)

Application web full-stack en PHP permettant de générer des questionnaires d'études de marché conformément au protocole QuestionnaireMasterPIE. Elle expose une API REST légère en PHP natif, consomme l'API OpenAI `/v1/responses` et propose une interface dynamique (vanilla JS) avec cases à cocher hiérarchiques, flux de chat et stockage du Markdown final.

## Structure du projet

```
.
├── composer.json            # Dépendances PHP (Guzzle + Dotenv)
├── public/
│   ├── index.php            # Page unique de l'application
│   ├── api.php              # End-point REST (start/continue/final)
│   └── assets/
│       ├── app.js           # Logique front (chat + UI)
│       └── styles.css       # Styles globaux
├── src/
│   ├── bootstrap.php        # Initialisation de l'environnement
│   └── Support/             # Utilitaires (env, session, OpenAI, etc.)
├── storage/                 # Persistance des sessions (JSON, ignoré par Git)
├── PROMPT_SYSTEM.md         # Prompt système réorganisé (envoyé au /start)
├── PROMPT_FEEDBACK.md       # Notes fonctionnelles
└── README.md
```

## Prérequis

- PHP 8.1+
- [Composer](https://getcomposer.org/)
- Compte OpenAI avec accès au modèle `gpt-5-mini`

## Configuration des variables d'environnement

Créer un fichier `.env` à la racine (non versionné) :

```
OPENAI_API_KEY=sk-********************************
VECTOR_STORE_ID=vs-********************************
PORT=8080
```

Ordre de résolution :
1. Variables d'environnement système
2. Fichier `.env`

Si `OPENAI_API_KEY` ou `VECTOR_STORE_ID` est manquant ou vide, l'API renverra une erreur 503 et désactivera tout appel OpenAI.

## Installation

1. Installer les dépendances PHP :
   ```bash
   composer install
   ```
2. Placer le fichier `.env` comme décrit ci-dessus.

## Lancer l'application

### Serveur interne PHP

```bash
php -S localhost:8080 -t public
```

- `public/index.php` sert l’UI.
- `public/api.php` gère les routes `?action=start|continue|final|health`.

### Avec un serveur web (Apache/Nginx)

Pointer le document root vers `public/` et rediriger les requêtes `api.php?action=...`.

## Fonctionnalités principales

- **Protocoles `/start`, `/continue`, `/final`** : validation de la `promptVersion`, appel du prompt système une seule fois, fusion des `memoryDelta`, override `verbosity='high'` + `max_output_tokens=20000` uniquement à l’assemblage final.
- **Mémoire persistante** : stockage JSON des sessions (résumé compact + 5 derniers tours) dans `storage/sessions.json`.
- **UI spécialisée** :
  - cases à cocher thématiques/sous-thématiques avec ajout libre,
  - bouton unique `Envoyer` + raccourci Ctrl/⌘+Enter,
  - bouton `Démarrer / Réinitialiser` façon ChatGPT,
  - rendu Markdown sécurisé (Marked + DOMPurify + highlight.js),
  - stockage du Markdown final dans `<input type="hidden" id="finalMarkdown">`.
- **Sécurité des secrets** : `.env` ignoré par Git, aucune fuite côté client.

## API

Toutes les requêtes sont faites en `POST` sur `public/api.php?action=...` avec un corps JSON :

- `/api.php?action=start`
  ```json
  {
    "promptVersion": "qmpie_v3_2025-09-30",
    "userMessage": "<message initial>",
    "memoryDelta": { ... },
    "phaseHint": "collecte"
  }
  ```
- `/api.php?action=continue` identique + `sessionId`.
- `/api.php?action=final` identique + `sessionId`, déclenché depuis l'UI avec la commande `/final`.

La réponse suit l’enveloppe :

```json
{
  "sessionId": "sess_xxx",
  "promptVersion": "qmpie_v3_2025-09-30",
  "phase": "collecte|plan|sections|final",
  "assistantMarkdown": "...",
  "memorySnapshot": { ... },
  "finalMarkdownPresent": true|false,
  "nextAction": "ask_user"|"persist_and_render"
}
```

## Commande `/final`

Depuis l’interface, saisir `/final` pour déclencher l’appel d’assemblage. Le Markdown complet retourné est copié dans l’élément `<input type="hidden" id="finalMarkdown">`.

## Tests

Pas de suite automatisée. Utiliser la check-list d’acceptation du prompt (phases collectées, respect de la mémoire, final Markdown unique, etc.).

