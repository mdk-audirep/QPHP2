const initialThematics = () => ([
  {
    id: 'satisfaction',
    label: 'Satisfaction client',
    checked: false,
    custom: false,
    subs: [
      { id: 'accueil', label: 'Accueil / relationnel', checked: false, custom: false },
      { id: 'delais', label: 'Délais de traitement', checked: false, custom: false },
      { id: 'digital', label: 'Expérience digitale', checked: false, custom: false }
    ]
  },
  {
    id: 'notoriete',
    label: 'Notoriété & image',
    checked: false,
    custom: false,
    subs: [
      { id: 'spontanee', label: 'Notoriété spontanée', checked: false, custom: false },
      { id: 'assistee', label: 'Notoriété assistée', checked: false, custom: false },
      { id: 'perception', label: 'Attributs d’image', checked: false, custom: false }
    ]
  },
  {
    id: 'offre',
    label: 'Offre & prix',
    checked: false,
    custom: false,
    subs: [
      { id: 'concept', label: 'Test de concept', checked: false, custom: false },
      { id: 'prix', label: 'Sensibilité prix', checked: false, custom: false },
      { id: 'pack', label: 'Packaging & merchandising', checked: false, custom: false }
    ]
  }
]);

const state = {
  sessionId: null,
  promptVersion: window.PROMPT_VERSION,
  phase: 'collecte',
  memory: {},
  messages: [],
  thematics: initialThematics(),
  currentQuestionStep: null,
  showThemes: false,
  showSubThemes: false,
  activeThematicId: null,
  activeThematicLabel: null
};

const elements = {
  chatWindow: document.getElementById('chatWindow'),
  chatForm: document.getElementById('chatForm'),
  userInput: document.getElementById('userInput'),
  sendButton: document.getElementById('sendButton'),
  resetButton: document.getElementById('resetButton'),
  statusBar: document.getElementById('statusBar'),
  thematicContainer: document.getElementById('thematicContainer'),
  checkboxPanel: document.querySelector('.checkbox-panel'),
  addThematicButton: document.getElementById('addThematicButton'),
  newThematicInput: document.getElementById('newThematicInput'),
  finalMarkdown: document.getElementById('finalMarkdown')
};

function normalizeText(value) {
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(markdown) {
  const raw = marked.parse(markdown, { mangle: false, headerIds: false });
  const sanitized = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitized;
  wrapper.querySelectorAll('pre code').forEach((block) => {
    if (window.hljs) {
      window.hljs.highlightElement(block);
    }
  });
  return wrapper.innerHTML;
}

function cloneThematics() {
  return state.thematics.map((theme) => ({
    ...theme,
    subs: theme.subs.map((sub) => ({ ...sub }))
  }));
}

function renderThematics() {
  const visible = state.showThemes || state.showSubThemes;
  if (elements.checkboxPanel) {
    elements.checkboxPanel.classList.toggle('is-hidden', !visible);
    elements.checkboxPanel.classList.toggle('showing-thematics', state.showThemes && visible);
    elements.checkboxPanel.classList.toggle('showing-subthemes', state.showSubThemes && visible);
  }

  elements.thematicContainer.innerHTML = '';
  if (!visible) {
    return;
  }

  let thematicsToRender = cloneThematics();
  if (state.showSubThemes) {
    let target = thematicsToRender.find((theme) => theme.id === state.activeThematicId);
    if (!target && state.activeThematicLabel) {
      const normalizedLabel = normalizeText(state.activeThematicLabel);
      target = thematicsToRender.find((theme) => normalizeText(theme.label) === normalizedLabel);
      if (target) {
        state.activeThematicId = target.id;
      }
    }
    thematicsToRender = target ? [target] : [];
  }

  thematicsToRender.forEach((theme) => {
    const card = document.createElement('div');
    card.className = 'thematic';
    if (state.showSubThemes && state.activeThematicId === theme.id) {
      card.classList.add('thematic--focused');
    }

    const header = document.createElement('div');
    header.className = 'thematic-header';

    const title = document.createElement('label');
    title.className = 'thematic-title';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = theme.checked;
    checkbox.addEventListener('change', () => {
      theme.checked = checkbox.checked;
      const target = state.thematics.find((item) => item.id === theme.id);
      if (target) target.checked = checkbox.checked;
    });
    const span = document.createElement('span');
    span.textContent = theme.label;

    title.appendChild(checkbox);
    title.appendChild(span);
    header.appendChild(title);
    card.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'thematic-sublist';

    theme.subs.forEach((sub) => {
      const item = document.createElement('li');
      const subCheckbox = document.createElement('input');
      subCheckbox.type = 'checkbox';
      subCheckbox.checked = sub.checked;
      subCheckbox.addEventListener('change', () => {
        sub.checked = subCheckbox.checked;
        const targetTheme = state.thematics.find((item) => item.id === theme.id);
        if (!targetTheme) return;
        const targetSub = targetTheme.subs.find((entry) => entry.id === sub.id);
        if (targetSub) {
          targetSub.checked = subCheckbox.checked;
        }
      });
      const label = document.createElement('span');
      label.textContent = sub.label;
      item.appendChild(subCheckbox);
      item.appendChild(label);
      list.appendChild(item);
    });

    const addWrapper = document.createElement('div');
    addWrapper.className = 'add-sub';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ajouter une sous-thématique';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Ajouter';
    button.addEventListener('click', () => {
      const value = input.value.trim();
      if (!value) return;
      const id = 'custom-' + Date.now();
      const newSub = { id, label: value, checked: true, custom: true };
      const targetTheme = state.thematics.find((item) => item.id === theme.id);
      if (!targetTheme) return;
      targetTheme.subs.push(newSub);
      input.value = '';
      renderThematics();
    });

    addWrapper.appendChild(input);
    addWrapper.appendChild(button);
    card.appendChild(list);
    card.appendChild(addWrapper);
    elements.thematicContainer.appendChild(card);
  });
}

function resetState() {
  state.sessionId = null;
  state.phase = 'collecte';
  state.memory = {};
  state.messages = [];
  state.thematics = initialThematics();
  state.currentQuestionStep = null;
  state.showThemes = false;
  state.showSubThemes = false;
  state.activeThematicId = null;
  state.activeThematicLabel = null;
  elements.userInput.value = '';
  elements.finalMarkdown.value = '';
  renderMessages();
  renderThematics();
  const message = 'Session réinitialisée. Sélectionnez vos thématiques puis envoyez un message pour démarrer. Tapez /final pour assembler la version complète.';
  if (!window.OPENAI_ENABLED) {
    updateStatus('OPENAI désactivé : configurez OPENAI_API_KEY et VECTOR_STORE_ID.', true);
  } else {
    updateStatus(message);
  }
}

function renderMessages() {
  elements.chatWindow.innerHTML = '';
  state.messages.forEach((message) => {
    const bubble = document.createElement('article');
    bubble.className = `chat-message ${message.role}`;
    bubble.innerHTML = message.html;
    elements.chatWindow.appendChild(bubble);
  });
  elements.chatWindow.scrollTop = elements.chatWindow.scrollHeight;
}

function updateStatus(text, isError = false) {
  elements.statusBar.textContent = text;
  elements.statusBar.classList.toggle('status-error', isError);
}

function pushMessage(role, content) {
  const html = role === 'assistant'
    ? renderMarkdown(content)
    : `<p>${escapeHtml(content)}</p>`;
  state.messages.push({ role, content, html });
  renderMessages();

  if (role === 'assistant') {
    const normalizedContent = normalizeText(content);
    let hasStateChange = false;

    if (normalizedContent.includes('question 7')) {
      state.currentQuestionStep = 7;
      state.showThemes = true;
      state.showSubThemes = false;
      state.activeThematicId = null;
      state.activeThematicLabel = null;
      hasStateChange = true;
    } else if (normalizedContent.includes('question 11')) {
      const thematicMatch = state.thematics.find((theme) =>
        normalizedContent.includes(normalizeText(theme.label))
      );
      state.currentQuestionStep = 11;
      if (thematicMatch) {
        state.activeThematicId = thematicMatch.id;
        state.activeThematicLabel = thematicMatch.label;
        state.showThemes = false;
        state.showSubThemes = true;
      } else {
        state.activeThematicId = null;
        state.activeThematicLabel = null;
        state.showThemes = true;
        state.showSubThemes = false;
      }
      hasStateChange = true;
    } else if (normalizedContent.includes('question')) {
      state.currentQuestionStep = null;
      state.showThemes = false;
      state.showSubThemes = false;
      state.activeThematicId = null;
      state.activeThematicLabel = null;
      hasStateChange = true;
    }

    if (hasStateChange) {
      renderThematics();
    }
  }
}

function buildMemoryDelta() {
  return {
    collecte: {
      thematiques: state.thematics.map((theme) => ({
        label: theme.label,
        checked: !!theme.checked,
        custom: !!theme.custom,
        sous_thematiques: theme.subs.map((sub) => ({
          label: sub.label,
          checked: !!sub.checked,
          custom: !!sub.custom
        }))
      }))
    }
  };
}

async function callApi(endpoint, body) {
  const response = await fetch(`api.php?action=${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Erreur réseau' }));
    throw new Error(error.message || 'Erreur inconnue');
  }
  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!window.OPENAI_ENABLED) {
    updateStatus('OPENAI désactivé : configurez OPENAI_API_KEY et VECTOR_STORE_ID.', true);
    return;
  }

  const text = elements.userInput.value.trim();
  if (!text) return;

  const finalCommand = text.trim().toLowerCase() === '/final';
  const payloadMessage = finalCommand ? 'Assembler le questionnaire complet validé.' : text;
  const endpoint = !state.sessionId ? 'start' : finalCommand ? 'final' : 'continue';

  const requestBody = {
    promptVersion: state.promptVersion,
    userMessage: payloadMessage,
    memoryDelta: buildMemoryDelta(),
    phaseHint: state.phase
  };

  if (state.sessionId) {
    requestBody.sessionId = state.sessionId;
  }

  pushMessage('user', text);
  elements.userInput.value = '';
  elements.sendButton.disabled = true;
  updateStatus('Génération en cours…');

  try {
    const envelope = await callApi(endpoint, requestBody);
    state.sessionId = envelope.sessionId;
    state.phase = envelope.phase;
    state.memory = envelope.memorySnapshot || {};
    if (Array.isArray(state.memory.collecte?.thematiques)) {
      syncThematics(state.memory.collecte.thematiques);
    }
    pushMessage('assistant', envelope.assistantMarkdown);
    if (envelope.phase === 'final' && envelope.finalMarkdownPresent) {
      elements.finalMarkdown.value = envelope.assistantMarkdown;
    }
    updateStatus(`Phase actuelle : ${envelope.phase}. Prochaine action : ${envelope.nextAction}`);
  } catch (error) {
    updateStatus(error.message, true);
  } finally {
    elements.sendButton.disabled = false;
  }
}

function syncThematics(snapshot) {
  state.thematics = snapshot.map((theme, index) => {
    const id = theme.custom ? `snapshot-${index}` : theme.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
      id,
      label: theme.label,
      checked: !!theme.checked,
      custom: !!theme.custom,
      subs: (theme.sous_thematiques || []).map((sub, subIndex) => ({
        id: sub.custom ? `snapshot-${index}-${subIndex}` : sub.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: sub.label,
        checked: !!sub.checked,
        custom: !!sub.custom
      }))
    };
  });
  if (state.activeThematicLabel) {
    const normalizedLabel = normalizeText(state.activeThematicLabel);
    const match = state.thematics.find((theme) => normalizeText(theme.label) === normalizedLabel);
    if (match) {
      state.activeThematicId = match.id;
    } else {
      state.activeThematicId = null;
      state.activeThematicLabel = null;
      state.showSubThemes = false;
    }
  }
  renderThematics();
}

function handleAddThematic() {
  const value = elements.newThematicInput.value.trim();
  if (!value) return;
  const id = 'custom-' + Date.now();
  state.thematics.push({
    id,
    label: value,
    checked: true,
    custom: true,
    subs: []
  });
  elements.newThematicInput.value = '';
  renderThematics();
}

elements.chatForm.addEventListener('submit', handleSubmit);
elements.resetButton.addEventListener('click', resetState);
elements.addThematicButton.addEventListener('click', handleAddThematic);
elements.userInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    handleSubmit(event);
  }
});

resetState();
