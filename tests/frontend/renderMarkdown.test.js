const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');

class ClassList {
  constructor(element) {
    this.element = element;
    this._items = new Set();
    this._sync();
  }

  _sync() {
    this.element.className = Array.from(this._items).join(' ');
  }

  add(...tokens) {
    tokens.forEach((token) => {
      if (token) {
        this._items.add(token);
      }
    });
    this._sync();
  }

  toggle(token, force) {
    if (typeof force === 'boolean') {
      if (force) {
        this._items.add(token);
      } else {
        this._items.delete(token);
      }
      this._sync();
      return this._items.has(token);
    }

    if (this._items.has(token)) {
      this._items.delete(token);
      this._sync();
      return false;
    }

    this._items.add(token);
    this._sync();
    return true;
  }

  contains(token) {
    return this._items.has(token);
  }

  toString() {
    return Array.from(this._items).join(' ');
  }
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class MarkupNode {
  constructor(tagName, parentElement = null) {
    this.tagName = tagName ? tagName.toLowerCase() : null;
    this.parentElement = parentElement;
    this.children = [];
    this._textContent = '';
    this.classList = new ClassList(this);
    this.className = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._textContent;
    }
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  closest(selectorList) {
    if (!selectorList) {
      return null;
    }
    const selectors = selectorList
      .split(',')
      .map((selector) => selector.trim().toLowerCase())
      .filter(Boolean);
    let current = this;
    while (current) {
      if (current.tagName && selectors.includes(current.tagName)) {
        return current;
      }
      current = current.parentElement || null;
    }
    return null;
  }

  toHTML() {
    const inner = this.children.length === 0
      ? this._textContent
      : this.children.map((child) => child.toHTML()).join('');
    if (!this.tagName) {
      return inner;
    }
    const classAttribute = this.className ? ` class="${this.className}"` : '';
    return `<${this.tagName}${classAttribute}>${inner}</${this.tagName}>`;
  }
}

class MarkupContainer extends MarkupNode {
  constructor() {
    super(null, null);
  }

  set innerHTML(html) {
    this._textContent = '';
    this.children = [];
    if (!html) {
      return;
    }
    parseHTML(html, this);
  }

  get innerHTML() {
    return this.children.map((child) => child.toHTML()).join('');
  }

  querySelectorAll(selector) {
    if (selector === '*') {
      return collectDescendants(this);
    }
    if (selector === 'pre code') {
      return collectDescendants(this).filter((node) => node.tagName === 'code' && node.closest('pre'));
    }
    return [];
  }
}

function collectDescendants(node) {
  const results = [];
  node.children.forEach((child) => {
    results.push(child);
    results.push(...collectDescendants(child));
  });
  return results;
}

function parseHTML(html, root) {
  const stack = [root];
  const tokenRegex = /<[^>]+>|[^<]+/g;
  let match;
  while ((match = tokenRegex.exec(html)) !== null) {
    const token = match[0];
    if (token.startsWith('</')) {
      stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const tagMatch = /^<\s*([a-zA-Z0-9]+)/.exec(token);
      if (!tagMatch) {
        continue;
      }
      const element = new MarkupNode(tagMatch[1], stack[stack.length - 1]);
      stack[stack.length - 1].appendChild(element);
      if (!token.endsWith('/>')) {
        stack.push(element);
      }
      continue;
    }
    const text = decodeHtml(token);
    const current = stack[stack.length - 1];
    current._textContent += text;
  }
}

const uiElementFactory = () => ({
  addEventListener() {},
  appendChild() {},
  className: '',
  classList: {
    add() {},
    toggle() {},
    contains() { return false; }
  },
  set textContent(value) {
    this._textContent = value;
  },
  get textContent() {
    return this._textContent || '';
  },
  style: {},
  value: '',
  disabled: false
});

function buildContext() {
  const context = {
    DOMPurify: {
      sanitize: (value) => value
    },
    marked: {
      parse: (value) => `<p>${value}</p>`
    },
    document: {
      createElement: () => new MarkupContainer()
    },
    module: { exports: {} },
    exports: {},
    console
  };
  context.document.getElementById = () => uiElementFactory();
  context.document.querySelector = () => uiElementFactory();
  context.window = context;
  return context;
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start === -1) {
    throw new Error(`Unable to locate function ${name}`);
  }
  let index = start;
  let depth = 0;
  let end = -1;
  while (index < source.length) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
      if (depth === 1) {
        // nothing
      }
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
    index += 1;
  }
  if (end === -1) {
    throw new Error(`Unable to extract function ${name}`);
  }
  return source.slice(start, end);
}

const scriptPath = path.resolve(__dirname, '../../public/assets/app.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');
const normalizeTextSource = extractFunction(scriptContent, 'normalizeText');
const renderMarkdownSource = extractFunction(scriptContent, 'renderMarkdown');

const context = buildContext();
const combinedSource = `${normalizeTextSource}\n${renderMarkdownSource}\nmodule.exports = { normalizeText, renderMarkdown };`;

vm.runInNewContext(combinedSource, context);

const { renderMarkdown } = context.module.exports;
assert.equal(typeof renderMarkdown, 'function', 'renderMarkdown should be a function');

const html = renderMarkdown('Q5 — Mode');
assert.ok(/<p[^>]*class=\"[^\"]*question-heading[^\"]*\">Q5 — Mode<\/p>/.test(html), 'Expected question-heading class on paragraph');

const determinerHtml = renderMarkdown("1 — L'entreprise");
assert.ok(/<p[^>]*class=\"[^\"]*question-heading[^\"]*\">1 — L'entreprise<\/p>/.test(determinerHtml), 'Expected question-heading class with determiner');

const questionLabelHtml = renderMarkdown('Q1 — Confirmez-vous la réception…');
assert.ok(/<p[^>]*class=\"[^\"]*question-heading[^\"]*\">Q1 — Confirmez-vous la réception…<\/p>/.test(questionLabelHtml), 'Expected question-heading class with full question text');

console.log('renderMarkdown applies question-heading class for numbered headings, determiners, and full question labels.');
