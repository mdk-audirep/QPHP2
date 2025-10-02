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

const defaultCollecteState = () => ({
  nextIndex: 0,
  total: 9,
  completed: false,
  pendingQuestion: null,
  answers: {}
});

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
  activeThematicLabel: null,
  collecteState: defaultCollecteState()
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
  finalMarkdown: document.getElementById('finalMarkdown'),
  validateThematicsButton: document.getElementById('validateThematicsButton')
};

function hasAnyThematicSelection() {
  return state.thematics.some((theme) => theme.checked || theme.subs.some((sub) => sub.checked));
}

function collectSelectedThematics() {
  return state.thematics.reduce((acc, theme) => {
    const selectedSubs = theme.subs.filter((sub) => sub.checked).map((sub) => sub.label);
    if (theme.checked || selectedSubs.length > 0) {
      acc.push({
        label: theme.label,
        subs: selectedSubs,
        themeSelected: theme.checked
      });
    }
    return acc;
  }, []);
}

function formatSelectedThematicsMessage() {
  const selections = collectSelectedThematics();
  if (selections.length === 0) {
    return '';
  }

  const parts = selections.map((entry) => {
    if (entry.subs.length > 0) {
      const subList = entry.subs.join(', ');
      if (entry.themeSelected) {
        return `${entry.label} – sous-thématiques : ${subList}`;
      }
      return `${entry.label} (sous-thématiques : ${subList})`;
    }
    return entry.label;
  });

  return `Thématiques sélectionnées : ${parts.join(' ; ')}.`;
}

function updateValidateThematicsState() {
  if (!elements.validateThematicsButton) {
    return;
  }
  elements.validateThematicsButton.disabled = !hasAnyThematicSelection();
}

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

function normalizeSources(raw) {
  const sanitizeUrl = (value) => {
    if (typeof value !== 'string') {
      return '';
    }

    let candidate = value.trim();
    if (!candidate) {
      return '';
    }

    candidate = candidate.replace(/[),.;]+$/u, '');

    const urlPattern = /^https?:\/\/[^\s]+$/i;
    if (!urlPattern.test(candidate)) {
      return '';
    }

    return candidate;
  };

  const cleanupLabel = (value) => {
    if (typeof value !== 'string') {
      return '';
    }

    let normalized = value.replace(/\s+/gu, ' ').trim();
    if (!normalized) {
      return '';
    }

    normalized = normalized.replace(/[\s–—\-:;,]+$/u, '').trim();
    return normalized;
  };

  const sanitizeList = (list, isWeb = false) => {
    if (!Array.isArray(list)) {
      return [];
    }

    const seen = new Set();
    const result = [];

    list.forEach((entry) => {
      let label = '';
      let href = null;

      if (typeof entry === 'string') {
        const normalized = entry.replace(/\s+/gu, ' ').trim();
        if (!normalized) {
          return;
        }

        if (isWeb) {
          const matches = normalized.match(/https?:\/\/\S+/g);
          if (matches && matches.length > 0) {
            const candidate = matches[matches.length - 1];
            const sanitized = sanitizeUrl(candidate);
            if (sanitized) {
              href = sanitized;
              const prefix = cleanupLabel(normalized.slice(0, normalized.lastIndexOf(candidate)));
              label = prefix || sanitized;
            }
          }
        }

        if (!label) {
          label = cleanupLabel(normalized);
        }
      } else if (entry && typeof entry === 'object') {
        const possibleLabel = cleanupLabel(
          entry.label ?? entry.name ?? entry.title ?? entry.value ?? entry.text ?? ''
        );
        if (possibleLabel) {
          label = possibleLabel;
        }

        if (isWeb) {
          const possibleUrl = entry.url ?? entry.href ?? entry.link ?? null;
          if (typeof possibleUrl === 'string') {
            const sanitized = sanitizeUrl(possibleUrl);
            if (sanitized) {
              href = sanitized;
            }
          }
        }

        if (!label && typeof entry.id === 'string') {
          label = cleanupLabel(entry.id);
        }

        if (!label && isWeb && href) {
          label = href;
        }
      } else {
        return;
      }

      if (!label) {
        return;
      }

      const key = isWeb ? (href || label) : label;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      result.push({ label, href: href || null });
    });

    return result;
  };

  if (!raw || typeof raw !== 'object') {
    return { internal: [], web: [] };
  }

  return {
    internal: sanitizeList(raw.internal, false),
    web: sanitizeList(raw.web, true)
  };
}

function renderMarkdown(markdown) {
  const raw = marked.parse(markdown, { mangle: false, headerIds: false });
  const sanitized = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitized;

  const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
  const normalizeForSource = (value) => {
    const trimmed = normalizeWhitespace(value).replace(/[:\s]+$/, '');
    return normalizeText(trimmed);
  };
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markClosestBlock = (element, className) => {
    const target = element.closest('p, h1, h2, h3, h4, h5, h6') || element;
    target.classList.add(className);
    return target;
  };

  const sourceLabels = ['Sources internes utilisées', 'Sources web utilisées'];
  const questionHeadingLabels = [
    'Entreprise',
    'Cible',
    "Échantillon",
    'Nombre de questions souhaitées',
    'Mode',
    'Contexte',
    'Thématiques',
    'Sensibilités',
    'Introduction',
    'Sous-thématiques'
  ].map((label) => normalizeText(label));
  const questionHeadingDeterminerPatterns = [
    /^l['’]\s*/,
    /^les\s+/, 
    /^la\s+/, 
    /^le\s+/, 
    /^une\s+/, 
    /^un\s+/, 
    /^des\s+/, 
    /^du\s+/, 
    /^de\s+la\s+/, 
    /^de\s+l['’]\s*/, 
    /^d['’]\s*/
  ];
  const stripQuestionHeadingDeterminer = (value) => {
    let result = value;
    for (const pattern of questionHeadingDeterminerPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, '');
        break;
      }
    }
    return result.trimStart();
  };
  const looksLikeQuestionText = (value) => /(?:\?|…|\.\.\.)\s*$/.test(value.trim());
  const questionHeadingPattern = /^(?:(?:Q\.?|Question)\s*)?(\d+)\s*[-–—]\s*(.+)$/i;
  let hasSourceSection = false;
  wrapper.querySelectorAll('*').forEach((node) => {
    if (!node.textContent) {
      return;
    }

    if (node.classList && typeof node.classList.contains === 'function' && node.classList.contains('source-section')) {
      hasSourceSection = true;
    }
    const whitespaceText = normalizeWhitespace(node.textContent);

    const normalizedText = normalizeForSource(node.textContent);
    const matchesSourceLabel = sourceLabels.some((label) => {
      const normalizedLabel = normalizeForSource(label);
      if (!normalizedLabel) {
        return false;
      }

      if (normalizedText === normalizedLabel) {
        return true;
      }

      const pattern = new RegExp(`^${escapeRegex(normalizedLabel)}(?:\\b|\n|\r|\s|[:;,.\\-–—])`);
      return pattern.test(normalizedText);
    });
    if (matchesSourceLabel) {
      markClosestBlock(node, 'source-section');
      hasSourceSection = true;
    }

    const headingMatch = whitespaceText.match(questionHeadingPattern);
    if (headingMatch) {
      const [, , headingLabel] = headingMatch;
      const normalizedHeadingLabel = normalizeText(headingLabel.replace(/[:\s]+$/, ''));
      const normalizedHeadingWithoutDeterminer = stripQuestionHeadingDeterminer(normalizedHeadingLabel);
      const matchesKnownLabel = questionHeadingLabels.some((label) =>
        normalizedHeadingWithoutDeterminer.startsWith(label)
      );
      if (matchesKnownLabel || looksLikeQuestionText(headingLabel)) {
        markClosestBlock(node, 'question-heading');
      }
    }

    if (normalizedText === normalizeForSource('⚠️ Attente réponse utilisateur')) {
      markClosestBlock(node, 'awaiting-section');
    }
  });
  wrapper.querySelectorAll('pre code').forEach((block) => {
    if (window.hljs) {
      window.hljs.highlightElement(block);
    }
  });
  return { html: wrapper.innerHTML, hasSourceSection };
}

function renderSourcesSections(rawSources) {
  const sources = normalizeSources(rawSources);
  const { internal, web } = sources;
  if (internal.length === 0 && web.length === 0) {
    return '';
  }

  const renderList = (items, isWeb = false) => {
    if (items.length === 0) {
      return '';
    }
    const entries = items
      .map((item) => {
        if (!item || typeof item !== 'object' || typeof item.label !== 'string') {
          return '';
        }

        const escapedLabel = escapeHtml(item.label);
        if (!escapedLabel) {
          return '';
        }

        if (isWeb && item.href) {
          const escapedUrl = escapeHtml(item.href);
          return `<li><a href="${escapedUrl}" target="_blank" rel="noopener">${escapedLabel}</a></li>`;
        }

        return `<li>${escapedLabel}</li>`;
      })
      .filter(Boolean)
      .join('');
    return `<ul>${entries}</ul>`;
  };

  let html = '<div class="assistant-sources">';
  if (internal.length > 0) {
    html += `<section class="assistant-sources__section"><h4>Sources internes utilisées</h4>${renderList(internal)}</section>`;
  }
  if (web.length > 0) {
    html += `<section class="assistant-sources__section"><h4>Sources web utilisées</h4>${renderList(web, true)}</section>`;
  }
  html += '</div>';
  return html;
}

function renderAssistantHtml(content, sources) {
  const { html: markdownHtml, hasSourceSection } = renderMarkdown(content);
  if (hasSourceSection) {
    return { html: markdownHtml, hasSourceSection };
  }
  const sourcesHtml = renderSourcesSections(sources);
  const html = sourcesHtml ? `${markdownHtml}${sourcesHtml}` : markdownHtml;
  return { html, hasSourceSection: false };
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

  updateValidateThematicsState();
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
      updateValidateThematicsState();
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
        updateValidateThematicsState();
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
      updateValidateThematicsState();
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
  state.collecteState = defaultCollecteState();
  elements.userInput.value = '';
  elements.finalMarkdown.value = '';
  renderMessages();
  renderThematics();
  const message = 'Session réinitialisée. Sélectionnez vos thématiques puis envoyez un message pour démarrer. Tapez /final pour assembler la version complète.';
  if (!window.OPENAI_ENABLED) {
    updateStatus('OPENAI désactivé : configurez OPENAI_API_KEY et VECTOR_STORE_ID.', true);
  } else {
    const progress = describeCollecteProgress();
    updateStatus(progress ? `${message} (${progress})` : message);
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

function describeCollecteProgress() {
  const collecte = state.collecteState;
  if (!collecte || !Number.isFinite(collecte.total) || collecte.total <= 0) {
    return '';
  }

  const answered = Math.min(Math.max(collecte.nextIndex ?? 0, 0), collecte.total);
  const base = `Collecte ${answered}/${collecte.total}`;

  if (collecte.completed) {
    return `${base} – terminé`;
  }

  if (collecte.pendingQuestion?.label) {
    return `${base} – prochaine : ${collecte.pendingQuestion.label}`;
  }

  return base;
}

function pushMessage(role, content, options = {}) {
  let html;
  let hasSourceSection = false;
  let sources = null;
  if (role === 'assistant') {
    sources = normalizeSources(options.sources);
    const rendered = renderAssistantHtml(content, sources);
    html = rendered.html;
    hasSourceSection = rendered.hasSourceSection;
  } else {
    const escaped = escapeHtml(content);
    const withLineBreaks = escaped.replace(/\r?\n/g, '<br>');
    html = `<p>${withLineBreaks}</p>`;
  }
  const message = {
    role,
    content,
    html,
    hasSourceSection,
    sources
  };
  state.messages.push(message);
  renderMessages();

  if (role === 'assistant') {
    handleAssistantState(content);
  }
}

const QUESTION_STEPS = {
  THEMES: 7,
  SUBTHEMES: 10
};

const FALLBACK_SUBTHEMES_PENDING_ID = 'collecte-subthemes-fallback';

function syncQuestionStepFromCollecteState() {
  const pending = state.collecteState?.pendingQuestion || null;
  const previous = {
    currentQuestionStep: state.currentQuestionStep,
    showThemes: state.showThemes,
    showSubThemes: state.showSubThemes,
    activeThematicId: state.activeThematicId,
    activeThematicLabel: state.activeThematicLabel
  };

  let nextCurrentStep = null;
  let nextShowThemes = false;
  let nextShowSubThemes = false;
  let nextActiveThematicId = null;
  let nextActiveThematicLabel = null;

  if (pending) {
    const normalizedId = typeof pending.id === 'string' ? normalizeText(pending.id) : '';

    if (normalizedId === 'thematiques') {
      nextCurrentStep = QUESTION_STEPS.THEMES;
      nextShowThemes = true;
      nextShowSubThemes = false;
    } else if (
      normalizedId.includes('subtheme') ||
      normalizedId.includes('sous_thematique') ||
      normalizedId.includes('sousthematique') ||
      normalizedId.includes('sous-thematique')
    ) {
      nextCurrentStep = QUESTION_STEPS.SUBTHEMES;
      nextShowThemes = false;
      nextShowSubThemes = true;

      let thematicMatch = null;
      if (pending.thematicId) {
        thematicMatch = state.thematics.find((theme) => theme.id === pending.thematicId);
      }

      if (!thematicMatch && pending.thematicLabel) {
        const normalizedLabel = normalizeText(pending.thematicLabel);
        thematicMatch = state.thematics.find((theme) => normalizeText(theme.label) === normalizedLabel);
      }

      if (!thematicMatch && typeof pending.label === 'string') {
        const normalizedLabel = normalizeText(pending.label);
        thematicMatch = state.thematics.find((theme) => normalizedLabel.includes(normalizeText(theme.label)));
      }

      if (thematicMatch) {
        nextActiveThematicId = thematicMatch.id;
        nextActiveThematicLabel = thematicMatch.label;
      } else {
        nextActiveThematicId = previous.activeThematicId;
        if (typeof pending.thematicLabel === 'string' && pending.thematicLabel) {
          nextActiveThematicLabel = pending.thematicLabel;
        } else if (typeof pending.label === 'string' && pending.label) {
          nextActiveThematicLabel = pending.label;
        } else {
          nextActiveThematicLabel = previous.activeThematicLabel;
        }
      }
    } else {
      const order = typeof pending.order === 'number' ? pending.order : null;
      const index = typeof pending.index === 'number' ? pending.index + 1 : null;
      nextCurrentStep = order ?? index ?? null;
    }
  }

  state.currentQuestionStep = nextCurrentStep;
  state.showThemes = nextShowThemes;
  state.showSubThemes = nextShowSubThemes;
  state.activeThematicId = nextActiveThematicId;
  state.activeThematicLabel = nextActiveThematicLabel;

  const hasStateChange = (
    previous.currentQuestionStep !== state.currentQuestionStep ||
    previous.showThemes !== state.showThemes ||
    previous.showSubThemes !== state.showSubThemes ||
    previous.activeThematicId !== state.activeThematicId ||
    previous.activeThematicLabel !== state.activeThematicLabel
  );

  renderThematics();

  return hasStateChange;
}

function handleAssistantState(content) {
  syncQuestionStepFromCollecteState();

  if (state.collecteState?.pendingQuestion) {
    return;
  }

  const normalizedContent = normalizeText(content);

  if (normalizedContent.includes(`question ${QUESTION_STEPS.THEMES}`)) {
    state.collecteState.pendingQuestion = {
      id: 'thematiques',
      order: QUESTION_STEPS.THEMES,
      label: 'Thématiques',
      prompt: '',
      index: QUESTION_STEPS.THEMES - 1
    };
    syncQuestionStepFromCollecteState();
    return;
  }

  if (normalizedContent.includes(`question ${QUESTION_STEPS.SUBTHEMES}`)) {
    const thematicMatch = state.thematics.find((theme) =>
      normalizedContent.includes(normalizeText(theme.label))
    );

    state.collecteState.pendingQuestion = {
      id: FALLBACK_SUBTHEMES_PENDING_ID,
      order: QUESTION_STEPS.SUBTHEMES,
      label: 'Sous-thématiques',
      prompt: '',
      index: QUESTION_STEPS.SUBTHEMES - 1,
      thematicId: thematicMatch?.id ?? null,
      thematicLabel: thematicMatch?.label ?? state.activeThematicLabel ?? null
    };

    syncQuestionStepFromCollecteState();
    return;
  }

  if (normalizedContent.includes('question') && state.collecteState?.pendingQuestion) {
    state.collecteState.pendingQuestion = null;
    syncQuestionStepFromCollecteState();
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

function createStreamingAssistantMessage() {
  const message = {
    role: 'assistant',
    content: '',
    html: '<p><em>…</em></p>',
    hasSourceSection: false,
    sources: { internal: [], web: [] }
  };
  state.messages.push(message);
  renderMessages();
  return message;
}

function updateStreamingAssistantMessage(message, delta) {
  if (!delta) {
    return;
  }

  message.content += delta;
  const rendered = renderAssistantHtml(message.content, message.sources);
  message.html = rendered.html;
  message.hasSourceSection = rendered.hasSourceSection;
  renderMessages();
}

function finalizeStreamingAssistantMessage(message, content, rawSources) {
  const finalContent = content || message.content;
  message.content = finalContent;
  message.sources = normalizeSources(rawSources);
  const rendered = renderAssistantHtml(finalContent, message.sources);
  message.html = rendered.html;
  message.hasSourceSection = rendered.hasSourceSection;
  renderMessages();
  handleAssistantState(finalContent);
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split('\n');
  const dataLines = [];
  lines.forEach((line) => {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  if (dataLines.length === 0) {
    return null;
  }

  const jsonString = dataLines.join('\n').trim();
  if (!jsonString || jsonString === '[DONE]') {
    return null;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Impossible de décoder un événement SSE', error, jsonString);
    return null;
  }
}

async function streamApi(endpoint, body) {
  const response = await fetch(`api.php?action=${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get('Content-Type') || '';

  if (!contentType.includes('text/event-stream')) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message || 'Erreur réseau';
      throw new Error(message);
    }

    return {
      envelope: payload,
      assistantMarkdown: payload?.assistantMarkdown || '',
      streamed: false
    };
  }

  if (!response.body) {
    throw new Error("Le streaming n'est pas supporté par ce navigateur.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const message = createStreamingAssistantMessage();
  let buffer = '';
  let finalEnvelope = null;
  let shouldStop = false;

  const processBuffer = () => {
    let delimiterIndex;
    while ((delimiterIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      const event = parseSseEvent(rawEvent);
      if (!event) {
        continue;
      }

      if (event.type === 'delta') {
        updateStreamingAssistantMessage(message, event.text || '');
      } else if (event.type === 'result') {
        finalEnvelope = event.payload || null;
        shouldStop = true;
      } else if (event.type === 'error') {
        throw new Error(event.message || 'Erreur OpenAI');
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
      if (shouldStop) {
        await reader.cancel().catch(() => {});
        break;
      }
    }

    buffer += decoder.decode(new Uint8Array(), { stream: false });
    processBuffer();
  } catch (error) {
    if (state.messages[state.messages.length - 1] === message) {
      state.messages.pop();
      renderMessages();
    }
    throw error;
  }

  if (!finalEnvelope) {
    if (state.messages[state.messages.length - 1] === message) {
      state.messages.pop();
      renderMessages();
    }
    throw new Error('Réponse incomplète reçue depuis le serveur.');
  }

  finalizeStreamingAssistantMessage(
    message,
    finalEnvelope.assistantMarkdown || message.content,
    finalEnvelope.sources
  );

  return {
    envelope: finalEnvelope,
    assistantMarkdown: finalEnvelope.assistantMarkdown || message.content,
    streamed: true
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

async function sendMessageFlow({
  displayText,
  payloadMessage,
  endpointOverride,
  extraDisabledElements = []
} = {}) {
  if (!window.OPENAI_ENABLED) {
    updateStatus('OPENAI désactivé : configurez OPENAI_API_KEY et VECTOR_STORE_ID.', true);
    return false;
  }

  const baseText = typeof displayText === 'string' ? displayText : '';
  const text = baseText.trim();
  if (!text) {
    return false;
  }

  const finalCommand = text.toLowerCase() === '/final';
  if (finalCommand && !state.collecteState?.completed) {
    updateStatus('Terminez d’abord les 9 questions obligatoires avant d’utiliser /final.', true);
    return false;
  }

  const messageForApi =
    typeof payloadMessage === 'string' && payloadMessage.trim()
      ? payloadMessage
      : finalCommand
        ? 'Assembler le questionnaire complet validé.'
        : text;

  const endpoint = endpointOverride
    ? endpointOverride
    : !state.sessionId
      ? 'start'
      : finalCommand
        ? 'final'
        : 'continue';

  const requestBody = {
    promptVersion: state.promptVersion,
    userMessage: messageForApi,
    memoryDelta: buildMemoryDelta(),
    phaseHint: state.phase
  };

  if (state.sessionId) {
    requestBody.sessionId = state.sessionId;
  }

  pushMessage('user', text);

  const toDisable = [elements.sendButton, ...extraDisabledElements].filter(Boolean);
  toDisable.forEach((element) => {
    element.disabled = true;
  });

  updateStatus('Génération en cours…');

  try {
    let envelope;

    if (!state.sessionId) {
      envelope = await callApi(endpoint, requestBody);
      pushMessage('assistant', envelope.assistantMarkdown, { sources: envelope.sources });
    } else {
      const result = await streamApi(endpoint, requestBody);
      envelope = result.envelope;
      if (!result.streamed) {
        pushMessage('assistant', envelope.assistantMarkdown, { sources: envelope.sources });
      }
    }

    state.sessionId = envelope.sessionId;
    state.phase = envelope.phase;
    state.memory = envelope.memorySnapshot || {};
    state.collecteState = envelope.collecteState || defaultCollecteState();
    syncQuestionStepFromCollecteState();
    if (Array.isArray(state.memory.collecte?.thematiques)) {
      syncThematics(state.memory.collecte.thematiques);
      syncQuestionStepFromCollecteState();
    }
    if (envelope.phase === 'final' && envelope.finalMarkdownPresent) {
      elements.finalMarkdown.value = envelope.assistantMarkdown;
    }
    const progress = describeCollecteProgress();
    const status = `Phase actuelle : ${envelope.phase}. Prochaine action : ${envelope.nextAction}`;
    updateStatus(progress ? `${status} · ${progress}` : status);
  } catch (error) {
    updateStatus(error.message, true);
    return false;
  } finally {
    toDisable.forEach((element) => {
      element.disabled = false;
    });
    updateValidateThematicsState();
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  const userText = elements.userInput.value;
  const sent = await sendMessageFlow({ displayText: userText });
  if (sent) {
    elements.userInput.value = '';
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

async function handleValidateThematics() {
  if (!hasAnyThematicSelection()) {
    return;
  }

  const message = formatSelectedThematicsMessage();
  if (!message) {
    return;
  }

  await sendMessageFlow({
    displayText: message,
    extraDisabledElements: [elements.validateThematicsButton]
  });
}

elements.chatForm.addEventListener('submit', handleSubmit);
elements.resetButton.addEventListener('click', resetState);
elements.addThematicButton.addEventListener('click', handleAddThematic);
if (elements.validateThematicsButton) {
  elements.validateThematicsButton.addEventListener('click', handleValidateThematics);
}
elements.userInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    handleSubmit(event);
  }
});

updateValidateThematicsState();
resetState();
