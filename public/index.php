<?php
require __DIR__ . '/../src/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>QuestionnaireMasterPIE</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="assets/styles.css">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" defer></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css">
        <script src="assets/light-highlight.js" defer></script>
    <script>
        window.PROMPT_VERSION = '<?php echo Questionnaire\Support\Prompt::VERSION; ?>';
        window.OPENAI_ENABLED = <?php echo Questionnaire\Support\Env::openAiEnabled() ? 'true' : 'false'; ?>;
    </script>
    <script src="assets/app.js" defer></script>
</head>
<body>
    <div class="app-shell">
        <aside class="sidebar">
            <h1>QuestionnaireMasterPIE</h1>
            <section class="controls">
                <button id="resetButton" type="button">Démarrer / Réinitialiser</button>
                <p class="hint">Ctrl/⌘+Enter pour envoyer</p>
            </section>
            <section class="checkbox-panel is-hidden">
                <h2>Thématiques</h2>
                <p class="thematic-hint">Sélectionnez les thématiques et sous-thématiques pertinentes avant de valider votre choix.</p>
                <div id="thematicContainer"></div>
                <div class="add-thematic">
                    <input type="text" id="newThematicInput" placeholder="Ajouter une thématique" />
                    <button id="addThematicButton" type="button">Ajouter</button>
                </div>
                <button id="validateThematicsButton" type="button" class="validate-thematics">Valider les thématiques</button>
            </section>
        </aside>
        <main class="main-panel">
            <section id="statusBar" class="status-bar"></section>
            <section id="chatWindow" class="chat-window"></section>
            <form id="chatForm" class="chat-form">
                <textarea id="userInput" rows="3" placeholder="Saisissez votre message..."></textarea>
                <div class="form-actions">
                    <button id="sendButton" type="submit">Envoyer</button>
                </div>
            </form>
        </main>
    </div>
    <input type="hidden" id="finalMarkdown" />
</body>
</html>
