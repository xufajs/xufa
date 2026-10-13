// What runs in the page: the selector engine and the checks and steps of actions. install() is sent as its source
// (Function.prototype.toString) and run in each document, where it makes globalThis.__xufaBrowser once.
//
// Selectors are those of Playwright that xufa's tests use: CSS, with :has-text("x") (the text anywhere inside, any
// case), :text("x") (the smallest elements with it) and :visible; text=x (the smallest elements with the text; quoted:
// all of it, as written); role=button[name="Save"] (by ARIA role, implicit or not, and accessible name); and >> to
// look for the next part inside the elements of the one before it.

function install() {
  if (globalThis.__xufaBrowser) return globalThis.__xufaBrowser;

  const normalize = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
  const textOf = (element) => normalize(element.textContent);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);

  // A text to match: quoted, as written ("x" all of it, 'x' too); else part of it, any case. A RegExp of {source, flags}.
  function textMatcher(value) {
    if (value && typeof value === 'object') {
      const regex = new RegExp(value.source, value.flags);
      return (text) => regex.test(text);
    }
    const raw = String(value).trim();
    const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
    if (quoted) {
      const exact = normalize(quoted[2]);
      return (text) => text === exact;
    }
    const lower = normalize(raw).toLowerCase();
    return (text) => text.toLowerCase().includes(lower);
  }

  // The top-level pieces of a string split by a separator outside quotes, brackets and parentheses.
  function splitTop(source, separator) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (char === '\\') i += 1;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '(' || char === '[') depth += 1;
      else if (char === ')' || char === ']') depth -= 1;
      else if (depth === 0 && source.startsWith(separator, i)) {
        parts.push(source.slice(start, i));
        start = i + separator.length;
        i += separator.length - 1;
      }
    }
    parts.push(source.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
  }

  // A complex CSS selector as [{ combinator, compound }]: compounds and the combinators before them.
  function complexParts(source) {
    const steps = [];
    let depth = 0;
    let quote = null;
    let current = '';
    let combinator = ' ';
    const flush = () => {
      if (current.trim()) steps.push({ combinator, compound: current.trim() });
      current = '';
    };
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        current += char;
        if (char === '\\') {
          current += source[i + 1] ?? '';
          i += 1;
        } else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth -= 1;
      if (depth === 0 && /[\s>+~]/.test(char)) {
        if (current.trim()) {
          flush();
          combinator = ' ';
        }
        if (char !== ' ' && char !== '\n' && char !== '\t') combinator = char;
        continue;
      }
      current += char;
    }
    flush();
    return steps;
  }

  // The index of what closes the bracket or parenthesis at start (quotes inside it skipped).
  function closing(source, start) {
    const open = source[start];
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    let quote = null;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (quote) {
        if (char === '\\') i += 1;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return source.length - 1;
  }

  const OWN = ['has-text', 'text', 'visible'];
  const OWN_INSIDE = /:(has-text|text|visible)\b/;

  // A compound's own pseudo-classes taken out of it: { css, filters }. :has-text, :text and :visible, and :not, :is,
  // :where and :has whose selector has them (the browser does not know them): the rest is CSS for the browser.
  function compoundParts(compound) {
    const filters = [];
    let css = '';
    let i = 0;
    while (i < compound.length) {
      const char = compound[i];
      if (char === '"' || char === "'") {
        let end = i + 1;
        while (end < compound.length && compound[end] !== char) end += compound[end] === '\\' ? 2 : 1;
        css += compound.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      if (char === '[') {
        const end = closing(compound, i);
        css += compound.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      const pseudo = char === ':' ? /^:([a-z-]+)(\()?/i.exec(compound.slice(i)) : null;
      if (pseudo) {
        const name = pseudo[1].toLowerCase();
        let argument;
        let end = i + pseudo[0].length;
        if (pseudo[2]) {
          const close = closing(compound, end - 1);
          argument = compound.slice(end, close).trim();
          end = close + 1;
        }
        const nested = ['not', 'is', 'where', 'has'].includes(name) && argument && OWN_INSIDE.test(argument);
        if (OWN.includes(name) || nested) filters.push({ name, argument });
        else css += compound.slice(i, end);
        i = end;
        continue;
      }
      css += char;
      i += 1;
    }
    return { css: css.trim() || '*', filters };
  }

  // Whether an element matches a selector that may have the pseudo-classes of Playwright (a list: any of it).
  function matchesSelector(element, selector) {
    return splitTop(selector, ',').some((one) => {
      const steps = complexParts(one);
      if (steps.length === 1) {
        const { css, filters } = compoundParts(steps[0].compound);
        return element.matches(css) && filters.every((filter) => applyFilter([element], filter).length === 1);
      }
      return queryCss(one, element.ownerDocument).includes(element);
    });
  }

  const unquote = (value) => {
    const quoted = /^(["'])([\s\S]*)\1$/.exec(value.trim());
    return quoted ? quoted[2].replace(/\\(.)/g, '$1') : value.trim();
  };

  // The elements a filter keeps.
  function applyFilter(elements, { name, argument }) {
    if (name === 'visible') return elements.filter(isVisible);
    if (name === 'not') return elements.filter((element) => !matchesSelector(element, argument));
    if (name === 'is' || name === 'where') return elements.filter((element) => matchesSelector(element, argument));
    // (:has(x): an element inside it is x; :has(> x): a child.)
    if (name === 'has') return elements.filter((element) => queryCss(argument, element).length > 0);
    // (Part of the text, in any case, as Playwright's :has-text("x") and :text("x").)
    const matches = textMatcher(unquote(argument ?? ''));
    if (name === 'has-text')
      return elements.filter((element) => !SKIP.has(element.tagName) && matches(textOf(element)));
    // :text: the elements with the text none of whose children has it.
    return elements.filter(
      (element) =>
        !SKIP.has(element.tagName) &&
        matches(textOf(element)) &&
        ![...element.children].some((child) => matches(textOf(child)))
    );
  }

  // The elements of a CSS selector (with the pseudo-classes of Playwright) inside a root; a list (a, b) gives those
  // of each.
  function queryCss(selector, root) {
    const list = splitTop(selector, ',');
    if (list.length > 1) {
      const all = new Set();
      for (const one of list) queryCss(one, root).forEach((element) => all.add(element));
      return [...all];
    }
    let found = [root];
    for (const { combinator, compound } of complexParts(selector)) {
      const { css, filters } = compoundParts(compound);
      const next = new Set();
      for (const scope of found) {
        let candidates;
        if (combinator === ' ') candidates = [...scope.querySelectorAll(css)];
        else if (combinator === '>') candidates = [...scope.children].filter((child) => child.matches(css));
        else if (combinator === '+') {
          const sibling = scope.nextElementSibling;
          candidates = sibling && sibling.matches(css) ? [sibling] : [];
        } else {
          candidates = [];
          for (let sibling = scope.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
            if (sibling.matches(css)) candidates.push(sibling);
          }
        }
        for (const filter of filters) candidates = applyFilter(candidates, filter);
        candidates.forEach((candidate) => next.add(candidate));
      }
      found = [...next];
    }
    return found;
  }

  // text=: the smallest elements with the text.
  function queryText(value, root) {
    const matches = textMatcher(value);
    const all = [...(root.querySelectorAll ? root.querySelectorAll('*') : [])].filter(
      (element) => !SKIP.has(element.tagName) && matches(textOf(element))
    );
    return all.filter((element) => ![...element.children].some((child) => matches(textOf(child))));
  }

  // ARIA roles: explicit, else those of the element.
  function roleOf(element) {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit.split(/\s+/)[0];
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))) return 'button';
    if (tag === 'a' && element.hasAttribute('href')) return 'link';
    if (tag === 'input' && type === 'checkbox') return 'checkbox';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'input' && type === 'range') return 'slider';
    if (tag === 'input' && ['number'].includes(type)) return 'spinbutton';
    if (tag === 'input' && type === 'search') return 'searchbox';
    if (tag === 'textarea' || (tag === 'input' && ['', 'text', 'email', 'tel', 'url', 'password'].includes(type))) {
      return 'textbox';
    }
    if (tag === 'select') return element.multiple || element.size > 1 ? 'listbox' : 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    const ROLES = {
      ul: 'list',
      ol: 'list',
      li: 'listitem',
      table: 'table',
      tr: 'row',
      td: 'cell',
      th: 'columnheader',
      thead: 'rowgroup',
      tbody: 'rowgroup',
      nav: 'navigation',
      main: 'main',
      dialog: 'dialog',
      img: 'img',
      form: 'form',
      option: 'option',
      article: 'article',
      aside: 'complementary',
      header: 'banner',
      footer: 'contentinfo',
      progress: 'progressbar',
    };
    return ROLES[tag] ?? null;
  }

  // The accessible name: aria-labelledby, aria-label, the labels of a field, alt, the text, the title.
  function nameOf(element) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      return normalize(
        labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
      );
    }
    const label = element.getAttribute('aria-label');
    if (label) return normalize(label);
    if (element.labels && element.labels.length) return normalize([...element.labels].map(textOf).join(' '));
    if (element.tagName === 'IMG') return normalize(element.getAttribute('alt'));
    if (element.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(element.type))
      return normalize(element.value);
    const text = textOf(element);
    return text || normalize(element.getAttribute('title'));
  }

  // role=name[name="x"][checked=true]...
  function queryRole(value, root) {
    const match = /^([a-z]+)((?:\[[^\]]*\])*)$/i.exec(value.trim());
    if (!match) throw new Error(`Bad role selector: role=${value}`);
    const [, role, attributes] = match;
    const conditions = [
      ...attributes.matchAll(/\[\s*([a-z-]+)\s*(?:=\s*((?:"[^"]*"|'[^']*'|[^\]\s]+))\s*([is])?)?\s*\]/gi),
    ];
    return [...root.querySelectorAll('*')].filter((element) => {
      if (roleOf(element) !== role) return false;
      return conditions.every(([, name, raw, flag]) => {
        if (name === 'name') {
          const expected = unquote(raw ?? '');
          const actual = nameOf(element);
          return flag === 's' ? actual === expected : actual.toLowerCase().includes(expected.toLowerCase());
        }
        if (name === 'checked')
          return String(element.checked ?? element.getAttribute('aria-checked')) === unquote(raw ?? 'true');
        if (name === 'disabled') return isDisabled(element) === (unquote(raw ?? 'true') === 'true');
        if (name === 'level') return element.tagName === `H${unquote(raw)}`;
        return true;
      });
    });
  }

  function querySelectorPart(part, root) {
    if (/^text=/.test(part)) return queryText(part.slice(5), root);
    if (/^role=/.test(part)) return queryRole(part.slice(5), root);
    if (/^css=/.test(part)) return queryCss(part.slice(4), root);
    // A part that is only quoted text is text= (as Playwright reads "Save").
    if (/^(["']).*\1$/.test(part)) return queryText(part, root);
    return queryCss(part, root);
  }

  // The elements of a selector of Playwright, in the order of the document.
  const inOrder = (elements) =>
    elements.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  // The elements of a selector of Playwright, in the order of the document. nth=i takes the i-th of those found so
  // far (nth=-1 the last).
  function query(selector, root = document) {
    let found = [root];
    for (const part of splitTop(selector, '>>')) {
      const nth = /^nth=(-?\d+)$/.exec(part);
      if (nth) {
        const index = Number(nth[1]);
        const picked = found[index < 0 ? found.length + index : index];
        found = picked && picked !== root ? [picked] : [];
        continue;
      }
      const next = new Set();
      for (const scope of found) querySelectorPart(part, scope).forEach((element) => next.add(element));
      found = inOrder([...next]);
    }
    return found;
  }

  // The elements of a target: { selector } (the first one, unless all) or { chain: [{ selector, hasText, nth }] }.
  function resolve(target) {
    if (target.selector !== undefined) return query(target.selector);
    let found = [document];
    for (const step of target.chain) {
      let next = [];
      const seen = new Set();
      // (:scope: the elements found so far, narrowed again.)
      for (const scope of found) {
        for (const element of step.selector === ':scope' ? [scope] : query(step.selector, scope)) {
          if (!seen.has(element)) {
            seen.add(element);
            next.push(element);
          }
        }
      }
      if (step.hasText !== undefined) {
        const matches = textMatcher(step.hasText);
        next = next.filter((element) => matches(textOf(element)));
      }
      if (step.nth !== undefined) {
        const index = step.nth < 0 ? next.length + step.nth : step.nth;
        next = next[index] ? [next[index]] : [];
      }
      found = next;
    }
    return found;
  }

  function isVisible(element) {
    if (!element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'OPTGROUP'].includes(element.tagName)) {
      if (element.disabled) return true;
      const fieldset = element.closest('fieldset[disabled]');
      if (fieldset && !fieldset.querySelector(':scope > legend')?.contains(element)) return true;
    }
    return element.getAttribute('aria-disabled') === 'true';
  }

  const frame = () => new Promise((done) => requestAnimationFrame(() => done()));

  // One element of a target: { element } or { error } (none; more than one when strict).
  function single(target, strict) {
    const found = resolve(target);
    if (found.length === 0) return { error: 'missing' };
    if (strict && found.length > 1) return { error: `strict: ${found.length} elements` };
    return { element: found[0] };
  }

  // Where a click goes: the center of the element, once it is visible, enabled, still for a frame, and the element
  // at that point is it (or inside it). { x, y } or { wait: why }.
  async function clickPoint(target, strict, { force = false, position } = {}) {
    const { element, error } = single(target, strict);
    if (error) return { wait: error };
    if (!isVisible(element)) return { wait: 'not visible' };
    if (!force && isDisabled(element)) return { wait: 'disabled' };
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const before = element.getBoundingClientRect();
    await frame();
    await frame();
    const rect = element.getBoundingClientRect();
    if (before.x !== rect.x || before.y !== rect.y || before.width !== rect.width || before.height !== rect.height) {
      return { wait: 'not stable' };
    }
    const x = rect.x + (position ? position.x : rect.width / 2);
    const y = rect.y + (position ? position.y : rect.height / 2);
    if (!force) {
      const hit = document.elementFromPoint(x, y);
      const label = element.labels?.[0];
      if (hit && hit !== element && !element.contains(hit) && !(label && label.contains(hit))) {
        return { wait: `another element would receive the click: ${describe(hit)}` };
      }
    }
    return { x, y };
  }

  function describe(element) {
    const id = element.id ? `#${element.id}` : '';
    const classes =
      typeof element.className === 'string' && element.className
        ? `.${element.className.trim().split(/\s+/).join('.')}`
        : '';
    return `<${element.tagName.toLowerCase()}${id}${classes}>`;
  }

  // The state of a target: attached, visible, hidden, detached (as waitForSelector's states).
  function state(target) {
    const found = resolve(target);
    const element = found[0];
    return { attached: !!element, visible: !!element && isVisible(element), count: found.length };
  }

  const VALUE_TYPES = new Set(['date', 'datetime-local', 'month', 'time', 'week', 'color', 'range']);

  // Ready to fill: { set: true } when the value was set (inputs of dates, colors...), { type: true } when focused
  // with its text selected, for the keyboard to replace; else { wait }.
  function prepareFill(target, strict, value) {
    const { element, error } = single(target, strict);
    if (error) return { wait: error };
    if (!isVisible(element)) return { wait: 'not visible' };
    if (isDisabled(element)) return { wait: 'disabled' };
    if (element.readOnly) return { wait: 'readonly' };
    const tag = element.tagName;
    if (tag === 'INPUT' && VALUE_TYPES.has(element.type)) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { set: true };
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      element.focus();
      element.select();
      return { type: true };
    }
    if (element.isContentEditable) {
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return { type: true };
    }
    return { error: `${describe(element)} is not an input, a textarea or contenteditable` };
  }

  // Options chosen by value or label ({ value }, { label }, { index }, or a string: either).
  function selectOption(target, strict, wanted) {
    const { element, error } = single(target, strict);
    if (error) return { wait: error };
    if (element.tagName !== 'SELECT') return { error: `${describe(element)} is not a <select>` };
    if (isDisabled(element)) return { wait: 'disabled' };
    const options = [...element.options];
    const chosen = wanted.map((want) =>
      options.find((option, index) => {
        if (typeof want === 'string') return option.value === want || normalize(option.label) === want;
        if (want.value !== undefined) return option.value === want.value;
        if (want.label !== undefined) return normalize(option.label) === want.label;
        return index === want.index;
      })
    );
    if (chosen.some((option) => !option)) return { wait: 'no such option' };
    options.forEach((option) => {
      option.selected = chosen.includes(option);
    });
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { values: chosen.map((option) => option.value) };
  }

  function focus(target, strict) {
    const { element, error } = single(target, strict);
    if (error) return { wait: error };
    element.focus();
    return { ok: true };
  }

  // What reading gives: text, an attribute, the value, checked, the box.
  function read(target, strict, what, name) {
    const { element, error } = single(target, strict);
    if (error) return { wait: error };
    switch (what) {
      case 'textContent':
        return { value: element.textContent };
      case 'innerText':
        return { value: element.innerText };
      case 'innerHTML':
        return { value: element.innerHTML };
      case 'attribute':
        return { value: element.getAttribute(name) };
      case 'inputValue':
        return { value: element.value };
      case 'checked':
        return { value: !!(element.checked ?? element.getAttribute('aria-checked') === 'true') };
      case 'box': {
        if (!isVisible(element)) return { value: null };
        const rect = element.getBoundingClientRect();
        return { value: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      }
      default:
        return { error: `unknown ${what}` };
    }
  }

  globalThis.__xufaBrowser = { query, resolve, state, clickPoint, prepareFill, selectOption, focus, read, isVisible };
  return globalThis.__xufaBrowser;
}

export { install };
