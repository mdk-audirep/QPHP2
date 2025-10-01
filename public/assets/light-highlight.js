(function () {
  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createStash() {
    const entries = [];
    return {
      push(match, className) {
        const key = `__HLJS_TOKEN_${entries.length}__`;
        entries.push({ key, html: `<span class="hljs-${className}">${escapeHtml(match)}</span>` });
        return key;
      },
      restore(content) {
        return entries.reduce((acc, entry) => acc.split(entry.key).join(entry.html), content);
      }
    };
  }

  function highlightJson(source) {
    const stash = createStash();
    let working = source;

    const propertyRegex = /"(?:\\.|[^"\\])*"(?=\s*:)/g;
    const stringRegex = /"(?:\\.|[^"\\])*"/g;
    const numberRegex = /-?\b\d+(?:\.\d+)?(?:e[+\-]?\d+)?\b/gi;
    const booleanRegex = /\b(?:true|false)\b/gi;
    const nullRegex = /\bnull\b/gi;

    working = working.replace(propertyRegex, (match) => stash.push(match, 'attr'));
    working = working.replace(stringRegex, (match) => stash.push(match, 'string'));
    working = working.replace(booleanRegex, (match) => stash.push(match, 'boolean'));
    working = working.replace(nullRegex, (match) => stash.push(match, 'null'));
    working = working.replace(numberRegex, (match) => stash.push(match, 'number'));

    const escaped = escapeHtml(working);
    return stash.restore(escaped);
  }

  function highlightGeneric(source) {
    const stash = createStash();
    let working = source;

    const commentRegex = /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
    const stringRegex = /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g;
    const numberRegex = /\b\d+(?:\.\d+)?\b/g;
    const booleanRegex = /\b(?:true|false)\b/gi;

    working = working.replace(commentRegex, (match) => stash.push(match, 'comment'));
    working = working.replace(stringRegex, (match) => stash.push(match, 'string'));
    working = working.replace(booleanRegex, (match) => stash.push(match, 'boolean'));
    working = working.replace(numberRegex, (match) => stash.push(match, 'number'));

    let escaped = escapeHtml(working);

    const keywordRegex = /\b(abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/g;
    const constantRegex = /\b[A-Z_][A-Z0-9_]*\b/g;

    escaped = escaped.replace(keywordRegex, (match) => `<span class="hljs-keyword">${match}</span>`);
    escaped = escaped.replace(constantRegex, (match) => `<span class="hljs-constant">${match}</span>`);

    return stash.restore(escaped);
  }

  function detectLanguage(element, content) {
    const declared = (element.getAttribute('data-language') || element.getAttribute('data-lang') || element.className || '').toLowerCase();
    if (declared.includes('json')) {
      return 'json';
    }
    if (declared.includes('javascript') || declared.includes('js') || declared.includes('ts')) {
      return 'generic';
    }
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return 'json';
    }
    return 'generic';
  }

  function highlightElement(element) {
    const original = element.textContent || '';
    if (!original.trim()) {
      return;
    }
    const language = detectLanguage(element, original);
    const html = language === 'json' ? highlightJson(original) : highlightGeneric(original);
    element.innerHTML = html;
    element.classList.add('hljs');
  }

  window.hljs = {
    highlightElement
  };
})();
