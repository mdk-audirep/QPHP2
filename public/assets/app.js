const DEFAULT_THEMATICS_BLUEPRINT = [
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
];

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
  thematics: [],
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

let assistantJsonBlockCounter = 0;

function normalizeText(value) {
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasAnyThematicSelection() {
  return state.thematics.some((theme) => theme.checked || theme.subs.some((sub) => sub.checked));
}

function countSelectedThematicEntries() {
  return state.thematics.reduce((total, theme) => {
    if (!theme) {
      return total;
    }

    let count = total;
    if (theme.checked) {
      count += 1;
    }

    if (Array.isArray(theme.subs)) {
      theme.subs.forEach((sub) => {
        if (sub && sub.checked) {
          count += 1;
        }
      });
    }

    return count;
  }, 0);
}

function updateValidateThematicsState() {
  const button = elements.validateThematicsButton;
  if (!button) {
    return;
  }

  if (!button.dataset.baseLabel) {
    const initialLabel = button.textContent ? button.textContent.trim() : '';
    button.dataset.baseLabel = initialLabel || 'Valider les thématiques';
  }

  const baseLabel = button.dataset.baseLabel;
  const visible = state.showThemes || state.showSubThemes;
  const selectedCount = countSelectedThematicEntries();
  const hasSelection = selectedCount > 0;

  button.hidden = !visible;
  button.disabled = !visible || !hasSelection;

  if (!visible) {
    if (button.textContent !== baseLabel) {
      button.textContent = baseLabel;
    }
    return;
  }

  const nextLabel = hasSelection ? `${baseLabel} (${selectedCount})` : baseLabel;
  if (button.textContent !== nextLabel) {
    button.textContent = nextLabel;
  }
}

function normalizeSources(raw) {
  const generatedIdPattern = /\\turn\d+file\d+$/i;
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

        if (generatedIdPattern.test(normalized)) {
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
          const candidate = cleanupLabel(entry.id);
          if (candidate && !generatedIdPattern.test(entry.id)) {
            label = candidate;
          }
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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cloneThematicList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((theme) => ({
    ...theme,
    subs: Array.isArray(theme.subs)
      ? theme.subs.map((sub) => ({ ...sub }))
      : []
  }));
}

function computeStableThematicId(label) {
  const normalized = normalizeText(label || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) {
    return normalized;
  }

  return `theme-${Date.now()}`;
}

function extractThematicSuggestions(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return [];
  }

  const lines = markdown.split(/\r?\n/);
  const seen = new Set();
  const suggestions = [];

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    const match = line.match(/^([-*+]\s+|\d+[.)\s]+)(.*)$/);
    if (!match) {
      return;
    }

    let candidate = match[2] || '';
    candidate = candidate.replace(/^[\-*+\d.\)\s]+/, '').trim();
    if (!candidate) {
      return;
    }

    const colonIndex = candidate.indexOf(':');
    const parenIndex = candidate.indexOf('(');
    let cutoff = candidate.length;
    if (colonIndex !== -1) {
      cutoff = Math.min(cutoff, colonIndex);
    }
    if (parenIndex !== -1) {
      cutoff = Math.min(cutoff, parenIndex);
    }

    candidate = candidate.slice(0, cutoff).trim();
    candidate = candidate.replace(/[*_`]/g, '').trim();
    candidate = candidate.replace(/\s*[–—-]\s*$/u, '').trim();

    if (!candidate) {
      return;
    }

    const normalized = normalizeText(candidate);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    suggestions.push(candidate);
  });

  return suggestions;
}

function extractThematicSuggestionsFromJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }

  const attemptParse = (raw) => {
    if (typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const list = Array.isArray(parsed.thematique_suggestions)
      ? parsed.thematique_suggestions
      : [];

    if (list.length === 0) {
      return null;
    }

    const seenLabels = new Set();
    const normalizedSuggestions = [];

    list.forEach((item) => {
      let rawLabel = '';
      let rawSubs = [];

      if (typeof item === 'string') {
        rawLabel = item.trim();
      } else if (item && typeof item === 'object') {
        if (typeof item.label === 'string' && item.label.trim()) {
          rawLabel = item.label.trim();
        } else if (typeof item.theme === 'string' && item.theme.trim()) {
          rawLabel = item.theme.trim();
        } else if (typeof item.thematique === 'string' && item.thematique.trim()) {
          rawLabel = item.thematique.trim();
        } else if (typeof item.libelle === 'string' && item.libelle.trim()) {
          rawLabel = item.libelle.trim();
        } else if (typeof item.name === 'string' && item.name.trim()) {
          rawLabel = item.name.trim();
        }

        if (Array.isArray(item.sous_thematiques)) {
          rawSubs = item.sous_thematiques;
        } else if (Array.isArray(item.sousThematiques)) {
          rawSubs = item.sousThematiques;
        } else if (Array.isArray(item.sub_themes)) {
          rawSubs = item.sub_themes;
        } else if (Array.isArray(item.subThemes)) {
          rawSubs = item.subThemes;
        } else if (Array.isArray(item.subs)) {
          rawSubs = item.subs;
        }
      }

      if (!rawLabel) {
        return;
      }

      const normalizedLabel = normalizeText(rawLabel);
      if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
        return;
      }

      const seenSubs = new Set();
      const subs = [];

      rawSubs.forEach((subItem) => {
        let subLabel = '';
        if (typeof subItem === 'string') {
          subLabel = subItem.trim();
        } else if (subItem && typeof subItem === 'object') {
          if (typeof subItem.label === 'string' && subItem.label.trim()) {
            subLabel = subItem.label.trim();
          } else if (typeof subItem.libelle === 'string' && subItem.libelle.trim()) {
            subLabel = subItem.libelle.trim();
          } else if (typeof subItem.name === 'string' && subItem.name.trim()) {
            subLabel = subItem.name.trim();
          }
        }

        if (!subLabel) {
          return;
        }

        const normalizedSub = normalizeText(subLabel);
        if (!normalizedSub || seenSubs.has(normalizedSub)) {
          return;
        }

        seenSubs.add(normalizedSub);
        subs.push(subLabel);
      });

      seenLabels.add(normalizedLabel);
      normalizedSuggestions.push({ label: rawLabel, subs });
    });

    if (normalizedSuggestions.length === 0) {
      return null;
    }

    return normalizedSuggestions;
  };

  const attemptParseFromDom = () => {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
      return null;
    }

    let candidates = [];
    try {
      candidates = Array.from(
        document.querySelectorAll('code[data-json-marker="thematique_suggestions"]')
      );
    } catch (error) {
      return null;
    }

    if (candidates.length === 0) {
      return null;
    }

    const sortedCandidates = candidates
      .map((block) => ({
        block,
        counter: Number.parseInt(block.getAttribute('data-json-block-counter') || '', 10)
      }))
      .sort((a, b) => {
        const aValid = Number.isFinite(a.counter);
        const bValid = Number.isFinite(b.counter);
        if (aValid && bValid) {
          return a.counter - b.counter;
        }
        if (aValid) {
          return 1;
        }
        if (bValid) {
          return -1;
        }
        return 0;
      });

    for (let index = sortedCandidates.length - 1; index >= 0; index -= 1) {
      const block = sortedCandidates[index].block;
      const raw = (block && (block.textContent || block.innerText)) || '';
      const parsed = attemptParse(raw);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  };

  const domSuggestions = attemptParseFromDom();
  if (domSuggestions) {
    return domSuggestions;
  }

  const codeBlockPattern = /```[ \t]*([a-z0-9_-]+)?\s*([\s\S]*?)```/gi;
  let codeMatch = codeBlockPattern.exec(content);
  while (codeMatch) {
    const lang = typeof codeMatch[1] === 'string' ? codeMatch[1].toLowerCase() : '';
    if (!lang || lang === 'json' || lang === 'jsonc') {
      const parsed = attemptParse(codeMatch[2]);
      if (parsed) {
        return parsed;
      }
    }
    codeMatch = codeBlockPattern.exec(content);
  }

  const lowerContent = content.toLowerCase();
  const marker = 'thematique_suggestions';
  let markerIndex = lowerContent.indexOf(marker);

  while (markerIndex !== -1) {
    let start = markerIndex;
    while (start >= 0 && content[start] !== '{') {
      start -= 1;
    }

    if (start >= 0) {
      let depth = 0;
      for (let position = start; position < content.length; position += 1) {
        const char = content[position];
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            const snippet = content.slice(start, position + 1);
            const parsed = attemptParse(snippet);
            if (parsed) {
              return parsed;
            }
            break;
          }
        }
      }
    }

    markerIndex = lowerContent.indexOf(marker, markerIndex + marker.length);
  }

  return null;
}

function applyThematicSuggestions(suggestions) {
  const labels = Array.isArray(suggestions)
    ? suggestions.map((label) => (typeof label === 'string' ? label.trim() : ''))
    : [];

  const filteredLabels = labels.filter(Boolean);

  if (filteredLabels.length === 0) {
    if (state.thematics.length === 0) {
      state.thematics = cloneThematicList(DEFAULT_THEMATICS_BLUEPRINT);
      return true;
    }
    return false;
  }

  const existingMap = new Map();
  const usedIds = new Set();

  state.thematics.forEach((theme) => {
    if (!theme || typeof theme.label !== 'string') {
      return;
    }
    const key = normalizeText(theme.label);
    if (!key) {
      return;
    }
    if (!existingMap.has(key)) {
      existingMap.set(key, theme);
    }
    if (theme.id) {
      usedIds.add(theme.id);
    }
  });

  const usedKeys = new Set();
  let changed = false;
  const nextThematics = [];

  const ensureUniqueId = (baseId) => {
    let candidate = baseId && baseId.trim() ? baseId.trim() : 'theme';
    let uniqueId = candidate;
    let suffix = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${candidate}-${suffix++}`;
    }
    usedIds.add(uniqueId);
    return uniqueId;
  };

  filteredLabels.forEach((label) => {
    const key = normalizeText(label);
    if (!key) {
      return;
    }

    const existing = existingMap.get(key) || null;
    if (existing) {
      usedKeys.add(key);
      nextThematics.push({
        ...existing,
        label,
        subs: Array.isArray(existing.subs)
          ? existing.subs.map((sub) => ({ ...sub }))
          : []
      });
      if (existing.label !== label) {
        changed = true;
      }
      return;
    }

    const baseId = computeStableThematicId(label);
    const id = ensureUniqueId(baseId);
    nextThematics.push({
      id,
      label,
      checked: false,
      custom: false,
      subs: []
    });
    usedKeys.add(key);
    changed = true;
  });

  state.thematics.forEach((theme) => {
    if (!theme) {
      return;
    }
    const key = typeof theme.label === 'string' ? normalizeText(theme.label) : '';
    if (key && usedKeys.has(key)) {
      return;
    }
    const hasSelection = !!theme.checked || (Array.isArray(theme.subs) && theme.subs.some((sub) => sub && sub.checked));
    if (theme.custom || hasSelection) {
      if (theme.id) {
        usedIds.add(theme.id);
      }
      nextThematics.push({
        ...theme,
        subs: Array.isArray(theme.subs)
          ? theme.subs.map((sub) => ({ ...sub }))
          : []
      });
    }
  });

  if (nextThematics.length !== state.thematics.length) {
    changed = true;
  } else {
    for (let index = 0; index < nextThematics.length; index += 1) {
      if (nextThematics[index].id !== state.thematics[index].id) {
        changed = true;
        break;
      }
      if (nextThematics[index].checked !== state.thematics[index].checked) {
        changed = true;
        break;
      }
    }
  }

  state.thematics = nextThematics;
  return changed;
}

function applyJsonThematicSuggestions(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return false;
  }

  const sanitizedEntries = [];
  const seenLabels = new Set();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!label) {
      return;
    }

    const normalizedLabel = normalizeText(label);
    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      return;
    }

    const rawSubs = Array.isArray(entry.subs)
      ? entry.subs
      : Array.isArray(entry.sous_thematiques)
      ? entry.sous_thematiques
      : [];

    const subs = [];
    const seenSubs = new Set();

    rawSubs.forEach((subItem) => {
      let subLabel = '';
      if (typeof subItem === 'string') {
        subLabel = subItem.trim();
      } else if (subItem && typeof subItem === 'object' && typeof subItem.label === 'string') {
        subLabel = subItem.label.trim();
      }

      if (!subLabel) {
        return;
      }

      const normalizedSub = normalizeText(subLabel);
      if (!normalizedSub || seenSubs.has(normalizedSub)) {
        return;
      }

      seenSubs.add(normalizedSub);
      subs.push(subLabel);
    });

    seenLabels.add(normalizedLabel);
    sanitizedEntries.push({ label, subs });
  });

  if (sanitizedEntries.length === 0) {
    return false;
  }

  const existingMap = new Map();
  state.thematics.forEach((theme) => {
    if (!theme || typeof theme.label !== 'string') {
      return;
    }
    const key = normalizeText(theme.label);
    if (!key || existingMap.has(key)) {
      return;
    }
    existingMap.set(key, theme);
  });

  const usedIds = new Set();
  const ensureUniqueId = (candidate, fallback) => {
    let base = typeof candidate === 'string' ? candidate.trim() : '';
    if (!base) {
      base = typeof fallback === 'string' ? fallback.trim() : '';
    }
    if (!base) {
      base = `id-${Date.now()}`;
    }
    let result = base;
    let suffix = 1;
    while (usedIds.has(result)) {
      result = `${base}-${suffix++}`;
    }
    usedIds.add(result);
    return result;
  };

  const matchedKeys = new Set();
  const nextThematics = [];

  sanitizedEntries.forEach((entry) => {
    const key = normalizeText(entry.label);
    const existing = key ? existingMap.get(key) : null;

    const baseThemeId = existing?.id || computeStableThematicId(entry.label);
    const themeId = ensureUniqueId(baseThemeId, 'theme');

    const subs = [];
    const existingSubMap = new Map();
    if (existing && Array.isArray(existing.subs)) {
      existing.subs.forEach((sub) => {
        if (!sub || typeof sub.label !== 'string') {
          return;
        }
        const subKey = normalizeText(sub.label);
        if (!subKey || existingSubMap.has(subKey)) {
          return;
        }
        existingSubMap.set(subKey, sub);
      });
    }

    const normalizedSubs = Array.isArray(entry.subs) ? entry.subs : [];

    normalizedSubs.forEach((subLabel) => {
      const subKey = normalizeText(subLabel);
      const existingSub = subKey ? existingSubMap.get(subKey) : null;
      const baseSubId = existingSub?.id || `${themeId}-${computeStableThematicId(subLabel)}`;
      const subId = ensureUniqueId(baseSubId, `${themeId}-sub`);
      subs.push({
        id: subId,
        label: subLabel,
        checked: existingSub?.checked ?? true,
        custom: existingSub?.custom ?? false
      });
    });

    matchedKeys.add(key);
    nextThematics.push({
      id: themeId,
      label: entry.label,
      checked: existing?.checked ?? true,
      custom: existing?.custom ?? false,
      subs
    });
  });

  state.thematics.forEach((theme) => {
    if (!theme) {
      return;
    }
    const key = typeof theme.label === 'string' ? normalizeText(theme.label) : '';
    if (key && matchedKeys.has(key)) {
      return;
    }
    const hasSelection = !!theme.checked || (Array.isArray(theme.subs) && theme.subs.some((sub) => sub && sub.checked));
    if (!theme.custom && !hasSelection) {
      return;
    }
    const themeId = ensureUniqueId(theme.id || computeStableThematicId(theme.label), 'theme');
    const subs = Array.isArray(theme.subs)
      ? theme.subs.map((sub) => {
          if (!sub) {
            return null;
          }
          const subId = ensureUniqueId(sub.id || `${themeId}-${computeStableThematicId(sub.label)}`, `${themeId}-sub`);
          return {
            id: subId,
            label: sub.label,
            checked: !!sub.checked,
            custom: !!sub.custom
          };
        }).filter(Boolean)
      : [];
    nextThematics.push({
      id: themeId,
      label: theme.label,
      checked: !!theme.checked,
      custom: !!theme.custom,
      subs
    });
  });

  const previousJson = JSON.stringify(state.thematics);
  const nextJson = JSON.stringify(nextThematics);
  const changed = previousJson !== nextJson;

  state.thematics = nextThematics;
  return changed;
}

function normalizeSources(raw) {
  const generatedIdPattern = /\\turn\d+file\d+$/i;
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

        if (generatedIdPattern.test(normalized)) {
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
          const candidate = cleanupLabel(entry.id);
          if (candidate && !generatedIdPattern.test(entry.id)) {
            label = candidate;
          }
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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cloneThematicList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((theme) => ({
    ...theme,
    subs: Array.isArray(theme.subs)
      ? theme.subs.map((sub) => ({ ...sub }))
      : []
  }));
}

function computeStableThematicId(label) {
  const normalized = normalizeText(label || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) {
    return normalized;
  }

  return `theme-${Date.now()}`;
}

function extractThematicSuggestions(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    return [];
  }

  const lines = markdown.split(/\r?\n/);
  const seen = new Set();
  const suggestions = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = typeof rawLine === 'string' ? rawLine.trim() : '';
    if (!line) {
      continue;
    }

    const match = line.match(/^([-*+]\s+|\d+[.)\s]+)(.*)$/);
    if (!match) {
      continue;
    }

    let candidate = match[2] || '';
    candidate = candidate.replace(/^[\-*+\d.\)\s]+/, '').trim();
    if (!candidate) {
      continue;
    }

    const colonIndex = candidate.indexOf(':');
    const parenIndex = candidate.indexOf('(');
    let cutoff = candidate.length;
    if (colonIndex !== -1) {
      cutoff = Math.min(cutoff, colonIndex);
    }
    if (parenIndex !== -1) {
      cutoff = Math.min(cutoff, parenIndex);
    }

    candidate = candidate.slice(0, cutoff).trim();
    candidate = candidate.replace(/[*_`]/g, '').trim();
    candidate = candidate.replace(/\s*[–—-]\s*$/u, '').trim();

    if (!candidate) {
      continue;
    }

    const normalized = normalizeText(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    suggestions.push(candidate);
  }

  return suggestions;
}

function extractThematicSuggestionsFromJson(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return null;
  }

  const attemptParse = (raw) => {
    if (typeof raw !== 'string') {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return null;
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const list = Array.isArray(parsed.thematique_suggestions)
      ? parsed.thematique_suggestions
      : [];

    if (list.length === 0) {
      return null;
    }

    const seenLabels = new Set();
    const normalizedSuggestions = [];

    list.forEach((item) => {
      let rawLabel = '';
      let rawSubs = [];

      if (typeof item === 'string') {
        rawLabel = item.trim();
      } else if (item && typeof item === 'object') {
        if (typeof item.label === 'string' && item.label.trim()) {
          rawLabel = item.label.trim();
        } else if (typeof item.theme === 'string' && item.theme.trim()) {
          rawLabel = item.theme.trim();
        } else if (typeof item.thematique === 'string' && item.thematique.trim()) {
          rawLabel = item.thematique.trim();
        } else if (typeof item.libelle === 'string' && item.libelle.trim()) {
          rawLabel = item.libelle.trim();
        } else if (typeof item.name === 'string' && item.name.trim()) {
          rawLabel = item.name.trim();
        }

        if (Array.isArray(item.sous_thematiques)) {
          rawSubs = item.sous_thematiques;
        } else if (Array.isArray(item.sousThematiques)) {
          rawSubs = item.sousThematiques;
        } else if (Array.isArray(item.sub_themes)) {
          rawSubs = item.sub_themes;
        } else if (Array.isArray(item.subThemes)) {
          rawSubs = item.subThemes;
        } else if (Array.isArray(item.subs)) {
          rawSubs = item.subs;
        }
      }

      if (!rawLabel) {
        return;
      }

      const normalizedLabel = normalizeText(rawLabel);
      if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
        return;
      }

      const seenSubs = new Set();
      const subs = [];

      rawSubs.forEach((subItem) => {
        let subLabel = '';
        if (typeof subItem === 'string') {
          subLabel = subItem.trim();
        } else if (subItem && typeof subItem === 'object') {
          if (typeof subItem.label === 'string' && subItem.label.trim()) {
            subLabel = subItem.label.trim();
          } else if (typeof subItem.libelle === 'string' && subItem.libelle.trim()) {
            subLabel = subItem.libelle.trim();
          } else if (typeof subItem.name === 'string' && subItem.name.trim()) {
            subLabel = subItem.name.trim();
          }
        }

        if (!subLabel) {
          return;
        }

        const normalizedSub = normalizeText(subLabel);
        if (!normalizedSub || seenSubs.has(normalizedSub)) {
          return;
        }

        seenSubs.add(normalizedSub);
        subs.push(subLabel);
      });

      seenLabels.add(normalizedLabel);
      normalizedSuggestions.push({ label: rawLabel, subs });
    });

    if (normalizedSuggestions.length === 0) {
      return null;
    }

    return normalizedSuggestions;
  };

  const attemptParseFromDom = () => {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') {
      return null;
    }

    let candidates = [];
    try {
      candidates = Array.from(
        document.querySelectorAll('code[data-json-marker="thematique_suggestions"]')
      );
    } catch (error) {
      return null;
    }

    if (candidates.length === 0) {
      return null;
    }

    const sortedCandidates = candidates
      .map((block) => ({
        block,
        counter: Number.parseInt(block.getAttribute('data-json-block-counter') || '', 10)
      }))
      .sort((a, b) => {
        const aValid = Number.isFinite(a.counter);
        const bValid = Number.isFinite(b.counter);
        if (aValid && bValid) {
          return a.counter - b.counter;
        }
        if (aValid) {
          return 1;
        }
        if (bValid) {
          return -1;
        }
        return 0;
      });

    for (let index = sortedCandidates.length - 1; index >= 0; index -= 1) {
      const block = sortedCandidates[index].block;
      const raw = (block && (block.textContent || block.innerText)) || '';
      const parsed = attemptParse(raw);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  };

  const domSuggestions = attemptParseFromDom();
  if (domSuggestions) {
    return domSuggestions;
  }

  const codeBlockPattern = /```[ \t]*([a-z0-9_-]+)?\s*([\s\S]*?)```/gi;
  let codeMatch = codeBlockPattern.exec(content);
  while (codeMatch) {
    const lang = typeof codeMatch[1] === 'string' ? codeMatch[1].toLowerCase() : '';
    if (!lang || lang === 'json' || lang === 'jsonc') {
      const parsed = attemptParse(codeMatch[2]);
      if (parsed) {
        return parsed;
      }
    }
    codeMatch = codeBlockPattern.exec(content);
  }

  const lowerContent = content.toLowerCase();
  const marker = 'thematique_suggestions';
  let markerIndex = lowerContent.indexOf(marker);

  while (markerIndex !== -1) {
    let start = markerIndex;
    while (start >= 0 && content[start] !== '{') {
      start -= 1;
    }

    if (start >= 0) {
      let depth = 0;
      for (let position = start; position < content.length; position += 1) {
        const char = content[position];
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            const snippet = content.slice(start, position + 1);
            const parsed = attemptParse(snippet);
            if (parsed) {
              return parsed;
            }
            break;
          }
        }
      }
    }

    markerIndex = lowerContent.indexOf(marker, markerIndex + marker.length);
  }

  return null;
}

function applyThematicSuggestions(suggestions) {
  const labels = Array.isArray(suggestions)
    ? suggestions.map((label) => (typeof label === 'string' ? label.trim() : ''))
    : [];

  const filteredLabels = labels.filter(Boolean);

  if (filteredLabels.length === 0) {
    if (state.thematics.length === 0) {
      state.thematics = cloneThematicList(DEFAULT_THEMATICS_BLUEPRINT);
      return true;
    }
    return false;
  }

  const existingMap = new Map();
  const usedIds = new Set();

  state.thematics.forEach((theme) => {
    if (!theme || typeof theme.label !== 'string') {
      return;
    }
    const key = normalizeText(theme.label);
    if (!key) {
      return;
    }
    if (!existingMap.has(key)) {
      existingMap.set(key, theme);
    }
    if (theme.id) {
      usedIds.add(theme.id);
    }
  });

  const usedKeys = new Set();
  let changed = false;
  const nextThematics = [];

  const ensureUniqueId = (baseId) => {
    let candidate = baseId && baseId.trim() ? baseId.trim() : 'theme';
    let uniqueId = candidate;
    let suffix = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${candidate}-${suffix++}`;
    }
    usedIds.add(uniqueId);
    return uniqueId;
  };

  filteredLabels.forEach((label) => {
    const key = normalizeText(label);
    if (!key) {
      return;
    }

    const existing = existingMap.get(key) || null;
    if (existing) {
      usedKeys.add(key);
      nextThematics.push({
        ...existing,
        label,
        subs: Array.isArray(existing.subs)
          ? existing.subs.map((sub) => ({ ...sub }))
          : []
      });
      if (existing.label !== label) {
        changed = true;
      }
      return;
    }

    const baseId = computeStableThematicId(label);
    const id = ensureUniqueId(baseId);
    nextThematics.push({
      id,
      label,
      checked: false,
      custom: false,
      subs: []
    });
    usedKeys.add(key);
    changed = true;
  });

  state.thematics.forEach((theme) => {
    if (!theme) {
      return;
    }
    const key = typeof theme.label === 'string' ? normalizeText(theme.label) : '';
    if (key && usedKeys.has(key)) {
      return;
    }
    const hasSelection = !!theme.checked || (Array.isArray(theme.subs) && theme.subs.some((sub) => sub && sub.checked));
    if (theme.custom || hasSelection) {
      if (theme.id) {
        usedIds.add(theme.id);
      }
      nextThematics.push({
        ...theme,
        subs: Array.isArray(theme.subs)
          ? theme.subs.map((sub) => ({ ...sub }))
          : []
      });
    }
  });

  if (nextThematics.length !== state.thematics.length) {
    changed = true;
  } else {
    for (let index = 0; index < nextThematics.length; index += 1) {
      if (nextThematics[index].id !== state.thematics[index].id) {
        changed = true;
        break;
      }
      if (nextThematics[index].checked !== state.thematics[index].checked) {
        changed = true;
        break;
      }
    }
  }

  state.thematics = nextThematics;
  return changed;
}

function applyJsonThematicSuggestions(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return false;
  }

  const sanitizedEntries = [];
  const seenLabels = new Set();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!label) {
      return;
    }

    const normalizedLabel = normalizeText(label);
    if (!normalizedLabel || seenLabels.has(normalizedLabel)) {
      return;
    }

    const rawSubs = Array.isArray(entry.subs)
      ? entry.subs
      : Array.isArray(entry.sous_thematiques)
      ? entry.sous_thematiques
      : [];

    const subs = [];
    const seenSubs = new Set();

    rawSubs.forEach((subItem) => {
      let subLabel = '';
      if (typeof subItem === 'string') {
        subLabel = subItem.trim();
      } else if (subItem && typeof subItem === 'object' && typeof subItem.label === 'string') {
        subLabel = subItem.label.trim();
      }

      if (!subLabel) {
        return;
      }

      const normalizedSub = normalizeText(subLabel);
      if (!normalizedSub || seenSubs.has(normalizedSub)) {
        return;
      }

      seenSubs.add(normalizedSub);
      subs.push(subLabel);
    });

    seenLabels.add(normalizedLabel);
    sanitizedEntries.push({ label, subs });
  });

  if (sanitizedEntries.length === 0) {
    return false;
  }

  const existingMap = new Map();
  state.thematics.forEach((theme) => {
    if (!theme || typeof theme.label !== 'string') {
      return;
    }
    const key = normalizeText(theme.label);
    if (!key || existingMap.has(key)) {
      return;
    }
    existingMap.set(key, theme);
  });

  const usedIds = new Set();
  const ensureUniqueId = (candidate, fallback) => {
    let base = typeof candidate === 'string' ? candidate.trim() : '';
    if (!base) {
      base = typeof fallback === 'string' ? fallback.trim() : '';
    }
    if (!base) {
      base = `id-${Date.now()}`;
    }
    let result = base;
    let suffix = 1;
    while (usedIds.has(result)) {
      result = `${base}-${suffix++}`;
    }
    usedIds.add(result);
    return result;
  };

  const matchedKeys = new Set();
  const nextThematics = [];

  sanitizedEntries.forEach((entry) => {
    const key = normalizeText(entry.label);
    const existing = key ? existingMap.get(key) : null;

    const baseThemeId = existing?.id || computeStableThematicId(entry.label);
    const themeId = ensureUniqueId(baseThemeId, 'theme');

    const subs = [];
    const existingSubMap = new Map();
    if (existing && Array.isArray(existing.subs)) {
      existing.subs.forEach((sub) => {
        if (!sub || typeof sub.label !== 'string') {
          return;
        }
        const subKey = normalizeText(sub.label);
        if (!subKey || existingSubMap.has(subKey)) {
          return;
        }
        existingSubMap.set(subKey, sub);
      });
    }

    const normalizedSubs = Array.isArray(entry.subs) ? entry.subs : [];

    normalizedSubs.forEach((subLabel) => {
      const subKey = normalizeText(subLabel);
      const existingSub = subKey ? existingSubMap.get(subKey) : null;
      const baseSubId = existingSub?.id || `${themeId}-${computeStableThematicId(subLabel)}`;
      const subId = ensureUniqueId(baseSubId, `${themeId}-sub`);
      subs.push({
        id: subId,
        label: subLabel,
        checked: existingSub?.checked ?? true,
        custom: existingSub?.custom ?? false
      });
    });

    matchedKeys.add(key);
    nextThematics.push({
      id: themeId,
      label: entry.label,
      checked: existing?.checked ?? true,
      custom: existing?.custom ?? false,
      subs
    });
  });

  state.thematics.forEach((theme) => {
    if (!theme) {
      return;
    }
    const key = typeof theme.label === 'string' ? normalizeText(theme.label) : '';
    if (key && matchedKeys.has(key)) {
      return;
    }
    const hasSelection = !!theme.checked || (Array.isArray(theme.subs) && theme.subs.some((sub) => sub && sub.checked));
    if (!theme.custom && !hasSelection) {
      return;
    }
    const themeId = ensureUniqueId(theme.id || computeStableThematicId(theme.label), 'theme');
    const subs = Array.isArray(theme.subs)
      ? theme.subs.map((sub) => {
          if (!sub) {
            return null;
          }
          const subId = ensureUniqueId(sub.id || `${themeId}-${computeStableThematicId(sub.label)}`, `${themeId}-sub`);
          return {
            id: subId,
            label: sub.label,
            checked: !!sub.checked,
            custom: !!sub.custom
          };
        }).filter(Boolean)
      : [];
    nextThematics.push({
      id: themeId,
      label: theme.label,
      checked: !!theme.checked,
      custom: !!theme.custom,
      subs
    });
  });

  const previousJson = JSON.stringify(state.thematics);
  const nextJson = JSON.stringify(nextThematics);
  const changed = previousJson !== nextJson;

  state.thematics = nextThematics;
  return changed;
}

function normalizeSources(raw) {
  const generatedIdPattern = /\\turn\d+file\d+$/i;
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

        if (generatedIdPattern.test(normalized)) {
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
          const candidate = cleanupLabel(entry.id);
          if (candidate && !generatedIdPattern.test(entry.id)) {
            label = candidate;
          }
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
    const leadingTrimmed = normalizeWhitespace(value).replace(
      /^(?:[|∣•·▪◦●○‣⁃*\-–—]+\s*)+/u,
      ''
    );
    const trimmed = leadingTrimmed.replace(/[:\s]+$/u, '');
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
    const rawText = block.textContent || '';
    if (rawText && rawText.includes('thematique_suggestions')) {
      assistantJsonBlockCounter += 1;
      const counter = assistantJsonBlockCounter;
      const blockId = `assistant-thematique-suggestions-${counter}`;
      block.id = blockId;
      block.setAttribute('data-json-marker', 'thematique_suggestions');
      block.setAttribute('data-json-block-counter', String(counter));
    }
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
  return cloneThematicList(state.thematics);
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

    if (state.showSubThemes) {
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
    }

    elements.thematicContainer.appendChild(card);
  });
}

function resetState() {
  state.sessionId = null;
  state.phase = 'collecte';
  state.memory = {};
  state.messages = [];
  state.thematics = [];
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
  const message = `Session réinitialisée. Sélectionnez vos thématiques puis envoyez un message pour démarrer. Tapez /final pour assembler la version complète.`;
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

    let bubbleHtml = message.html;
    const questionTitle = typeof message.questionTitle === 'string' ? message.questionTitle : '';
    if (questionTitle) {
      const hasHeadingClass = /class\s*=\s*['"][^'"]*\bquestion-heading\b[^'"]*['"]/i.test(bubbleHtml);
      if (!hasHeadingClass) {
        const escapedTitle = escapeHtml(questionTitle);
        bubbleHtml = `<p class="question-heading">${escapedTitle}</p>${bubbleHtml}`;
      }
    }

    bubble.innerHTML = bubbleHtml;
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

  if (collecte.pendingQuestion) {
    const title = formatCollecteQuestionTitle(collecte.pendingQuestion);
    if (title) {
      return `${base} – prochaine : ${title}`;
    }
  }

  return base;
}

function formatCollecteQuestionTitle(question) {
  if (!question || typeof question !== 'object') {
    return '';
  }

  const parts = [];
  let orderValue = null;

  if (typeof question.order === 'number' && Number.isFinite(question.order)) {
    orderValue = Math.trunc(question.order);
  } else if (typeof question.order === 'string') {
    const parsed = Number.parseInt(question.order, 10);
    if (!Number.isNaN(parsed)) {
      orderValue = parsed;
    }
  } else if (typeof question.index === 'number' && Number.isFinite(question.index)) {
    orderValue = Math.trunc(question.index) + 1;
  }

  if (orderValue !== null && Number.isFinite(orderValue)) {
    parts.push(String(orderValue));
  }

  const label = typeof question.label === 'string' ? question.label.trim() : '';
  const prompt = typeof question.prompt === 'string' ? question.prompt.trim() : '';

  if (label) {
    parts.push(label);
  } else if (prompt) {
    parts.push(prompt);
  }

  return parts.join(' - ');
}

function pushMessage(role, content, options = {}) {
  let html;
  let hasSourceSection = false;
  let sources = null;
  let questionTitle = null;
  if (role === 'assistant') {
    sources = normalizeSources(options.sources);
    const rendered = renderAssistantHtml(content, sources);
    html = rendered.html;
    hasSourceSection = rendered.hasSourceSection;
    if (typeof options.questionTitle === 'string' && options.questionTitle.trim()) {
      questionTitle = options.questionTitle.trim();
    }
  } else {
    const escaped = escapeHtml(content);
    const normalizedNewlines = escaped.replace(/\r\n?/g, '\n');
    html = `<p class="chat-text">${normalizedNewlines}</p>`;
  }
  const message = {
    role,
    content,
    html,
    hasSourceSection,
    sources,
    questionTitle
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

function isPendingQuestionMatch(expectedIds = []) {
  if (!Array.isArray(expectedIds) || expectedIds.length === 0) {
    return false;
  }

  const pendingId = state.collecteState?.pendingQuestion?.id;
  if (typeof pendingId !== 'string' || !pendingId) {
    return false;
  }

  const normalizedPendingId = normalizeText(pendingId);
  return expectedIds.some((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    return (
      normalizedPendingId === normalizedCandidate ||
      normalizedPendingId.includes(normalizedCandidate)
    );
  });
}

function isCollecteQuestionStep(content, step, expectedPendingIds = []) {
  if (isPendingQuestionMatch(expectedPendingIds)) {
    return true;
  }

  if (typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] || '';
  let candidate = firstLine.trim();
  if (!candidate) {
    return false;
  }

  candidate = candidate.replace(/^[#>\s]+/, '');
  candidate = candidate.replace(/^\*\*\s*/, '');
  candidate = candidate.replace(/[*_`~]/g, '');
  candidate = candidate.trim();

  const normalized = normalizeText(candidate);
  if (!normalized) {
    return false;
  }

  const stepString = String(step);
  const stepPatterns = [
    new RegExp(`^q\s*${stepString}\b`),
    new RegExp(`^${stepString}\s*[\-–—]`),
    new RegExp(`^${stepString}\s*[:.]`)
  ];

  return stepPatterns.some((pattern) => pattern.test(normalized));
}

function handleAssistantState(content) {
  const normalizedContent = normalizeText(content);
  const hadPendingQuestion = !!state.collecteState?.pendingQuestion;

  let handledStateUpdate = false;

  if (isCollecteQuestionStep(content, QUESTION_STEPS.THEMES, ['thematiques'])) {
    const jsonSuggestions = extractThematicSuggestionsFromJson(content);
    let appliedJson = false;
    if (Array.isArray(jsonSuggestions) && jsonSuggestions.length > 0) {
      appliedJson = applyJsonThematicSuggestions(jsonSuggestions);
    }
    if (!appliedJson) {
      const suggestions = extractThematicSuggestions(content);
      applyThematicSuggestions(suggestions);
    }
    state.collecteState.pendingQuestion = {
      id: 'thematiques',
      order: QUESTION_STEPS.THEMES,
      label: 'Thématiques',
      prompt: '',
      index: QUESTION_STEPS.THEMES - 1
    };
    handledStateUpdate = true;
  }

  if (
    !handledStateUpdate &&
    isCollecteQuestionStep(content, QUESTION_STEPS.SUBTHEMES, [
      'sous-thematiques',
      'sous thematiques',
      'sousthematiques',
      FALLBACK_SUBTHEMES_PENDING_ID
    ])
  ) {
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

    handledStateUpdate = true;
  }

  if (
    !handledStateUpdate &&
    normalizedContent.includes('question') &&
    state.collecteState?.pendingQuestion
  ) {
    state.collecteState.pendingQuestion = null;
    handledStateUpdate = true;
  }

  if (handledStateUpdate || hadPendingQuestion) {
    syncQuestionStepFromCollecteState();
  }

  renderThematics();
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
    sources: { internal: [], web: [] },
    questionTitle: null
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
    if (state.phase === 'collecte') {
      const pendingQuestion = state.collecteState?.pendingQuestion || null;
      const derivedTitle = formatCollecteQuestionTitle(pendingQuestion);
      if (derivedTitle) {
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
          const candidate = state.messages[index];
          if (candidate.role === 'assistant') {
            if (candidate.questionTitle !== derivedTitle) {
              candidate.questionTitle = derivedTitle;
              renderMessages();
            }
            break;
          }
        }
      }
    }
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
