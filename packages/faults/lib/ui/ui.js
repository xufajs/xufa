'use strict';

/* global document, window, sessionStorage, localStorage, Node */

// The page of the faults plugin: the targets and their rules (refreshed every 2 seconds), a form for new rules, the
// buttons of the routes (remove, release, up, clear), and the scenarios (started, stopped, written as JSON). Values
// from the server are always set as text.
(function main() {
  const base = document.body.dataset.base;
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = `xufa-faults-token:${base}`;
  let state = null;
  let needsToken = false;

  const storage = {
    get() {
      try {
        return sessionStorage.getItem(TOKEN_KEY);
      } catch (err) {
        return null;
      }
    },
    set(value) {
      try {
        if (value === null) sessionStorage.removeItem(TOKEN_KEY);
        else sessionStorage.setItem(TOKEN_KEY, value);
      } catch (err) {
        // Without storage, the token lasts until the page is reloaded.
      }
    },
  };
  let token = storage.get();

  // An element: el('td', { className: 'x' }, 'text', child...).
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function setStatus(text, error = false) {
    const status = $('status');
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  async function api(method, path, body) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    if (response.status === 401) {
      needsToken = /bearer/i.test(response.headers.get('www-authenticate') || '');
      if (token) storage.set(null);
      token = null;
      throw Object.assign(new Error('Not allowed to change faults'), { unauthorized: true });
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error((data && data.message) || `${response.status} ${response.statusText}`);
    return data;
  }

  // ------------------------------------------------------------------------------------------------ the rules
  const filtersText = (filters) =>
    Object.entries(filters)
      .map(([name, value]) => {
        const one = (item) => (item && typeof item === 'object' ? `/${item.regex}/${item.flags || ''}` : item);
        return `${name}: ${[].concat(value).map(one).join(', ')}`;
      })
      .join('; ');

  // A duration as 1h 5m, 4m 30s or 12s.
  function duration(ms) {
    const s = Math.ceil(ms / 1000);
    const two = (big, unit, small, smallUnit) => (small ? `${big}${unit} ${small}${smallUnit}` : `${big}${unit}`);
    if (s >= 3600) return two(Math.floor(s / 3600), 'h', Math.floor((s % 3600) / 60), 'm');
    return s >= 60 ? two(Math.floor(s / 60), 'm', s % 60, 's') : `${s}s`;
  }

  function left(expiresAt) {
    if (!expiresAt) return '';
    const ms = Date.parse(expiresAt) - Date.now();
    return ms <= 0 ? 'now' : duration(ms);
  }

  function ruleRow(name, rule) {
    const stateName = rule.active ? 'active' : 'holding';
    const actions = el('td');
    if (rule.kind === 'hang') {
      actions.append(
        el(
          'button',
          {
            type: 'button',
            className: 'small secondary',
            onclick: () => act('POST', `/${enc(name)}/rules/${enc(rule.id)}/release`),
          },
          'Release'
        ),
        ' '
      );
    }
    actions.append(
      el(
        'button',
        {
          type: 'button',
          className: 'small danger',
          onclick: () => act('DELETE', `/${enc(name)}/rules/${enc(rule.id)}`),
        },
        'Remove'
      )
    );
    const expires = el('td', { className: 'expires' }, left(rule.expiresAt));
    expires.dataset.expiresAt = rule.expiresAt || '';
    return el(
      'tr',
      null,
      el('td', null, rule.id),
      el(
        'td',
        null,
        rule.kind,
        rule.ms ? ` ${rule.ms} ms${rule.jitter ? ` ±${rule.jitter}` : ''}` : '',
        rule.scenario ? el('span', { className: 'scenario-tag', title: 'Made by this scenario' }, rule.scenario) : null
      ),
      el('td', null, rule.operations.join(', ')),
      el('td', { className: 'filters' }, filtersText(rule.filters) || '—'),
      el('td', null, rule.rate === 1 ? '' : rule.rate),
      el('td', null, rule.after || ''),
      el('td', null, rule.times === null ? '∞' : rule.times),
      el('td', null, rule.hits),
      el('td', null, el('span', { className: `badge ${stateName}` }, stateName)),
      expires,
      actions
    );
  }

  function targetCard(name, target) {
    const head = el(
      'div',
      { className: 'target-head' },
      el('h2', null, name),
      el('span', { className: 'meta' }, `${target.kinds.join(', ')} · ${target.operations.join(', ')}`),
      el(
        'span',
        { className: 'actions' },
        target.kinds.includes('down')
          ? el(
              'button',
              { type: 'button', className: 'small secondary', onclick: () => act('POST', `/${enc(name)}/up`) },
              'Up'
            )
          : null,
        el(
          'button',
          { type: 'button', className: 'small secondary', onclick: () => act('DELETE', `/${enc(name)}`) },
          'Clear'
        )
      )
    );
    if (target.rules.length === 0)
      return el('section', { className: 'card' }, head, el('p', { className: 'none' }, 'No rules.'));
    const headers = ['Id', 'Kind', 'Operations', 'Filters', 'Rate', 'After', 'Times', 'Hits', 'State', 'Expires', ''];
    const table = el(
      'table',
      null,
      el('thead', null, el('tr', null, ...headers.map((h) => el('th', null, h)))),
      el('tbody', null, ...target.rules.map((rule) => ruleRow(name, rule)))
    );
    return el('section', { className: 'card' }, head, el('div', { className: 'table-wrap' }, table));
  }

  const enc = encodeURIComponent;

  function render() {
    const targets = $('targets');
    targets.replaceChildren(...Object.entries(state.targets).map(([name, target]) => targetCard(name, target)));
    const count = Object.values(state.targets).reduce((n, t) => n + t.rules.length, 0);
    $('clear-all').hidden = count === 0;
    setStatus(`${count} rule${count === 1 ? '' : 's'} · updated ${new Date().toLocaleTimeString()}`);
  }

  // ------------------------------------------------------------------------------------------------ scenarios
  const at = (ms) => (ms === 0 ? '0s' : duration(ms));

  function stepsText(steps) {
    return steps
      .map((step) => `${at(step.at)} ${step.target} ${step.kind}${step.for ? ` for ${at(step.for)}` : ''}`)
      .join(' · ');
  }

  // A scenario written here, as JSON ({ name, steps, duration }), started with POST /scenarios (the server checks it).
  // Made once, so the refreshes keep what is written; the text is kept in this browser.
  const SCENARIO_KEY = `xufa-faults-scenario:${base}`;
  let editor = null;
  function scenarioEditor() {
    if (editor) return editor;
    const target = Object.keys(state.targets)[0] || 'db';
    const example = {
      name: 'slow then failing',
      steps: [
        { at: 0, target, kind: 'delay', options: { ms: 500 }, for: '10s' },
        { at: '10s', target, kind: 'fail', options: { rate: 0.5 }, for: '10s' },
      ],
      duration: '30s',
    };
    const text = el('textarea', { id: 'scenario-json', rows: 10, spellcheck: false });
    text.value = local.get(SCENARIO_KEY, null) || JSON.stringify(example, null, 2);
    text.addEventListener('input', () => local.set(SCENARIO_KEY, text.value));
    const error = el('p', { id: 'scenario-error', className: 'error', role: 'alert', hidden: true });
    const start = async () => {
      error.hidden = true;
      let spec;
      try {
        spec = JSON.parse(text.value);
      } catch (err) {
        error.textContent = `Not JSON: ${err.message}`;
        error.hidden = false;
        return;
      }
      try {
        await api('POST', '/scenarios', spec);
        await refresh();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    };
    editor = el(
      'details',
      { className: 'scenario-editor' },
      el('summary', null, 'Write a scenario'),
      el(
        'p',
        { className: 'meta' },
        'Steps of { at, target, kind, options, for }: each makes its rule at `at` and removes it after `for`. Durations in ms or as 30s, 2m.'
      ),
      text,
      error,
      el('button', { type: 'button', id: 'scenario-start', onclick: start }, 'Run it')
    );
    return editor;
  }

  function renderScenarios(scenarios) {
    const section = $('scenarios');
    const defined = Object.entries(scenarios.defined);
    section.hidden = false;
    const running = new Set(scenarios.runs.filter((run) => run.state === 'running').map((run) => run.name));
    const definedList = defined.map(([name, spec]) =>
      el(
        'div',
        { className: 'scenario' },
        el(
          'div',
          { className: 'scenario-head' },
          el('strong', null, name),
          el('span', { className: 'meta' }, duration(spec.duration)),
          el(
            'button',
            {
              type: 'button',
              className: 'small',
              disabled: running.has(name),
              onclick: () => act('POST', `/scenarios/${enc(name)}`),
            },
            running.has(name) ? 'Running' : 'Start'
          )
        ),
        el('div', { className: 'meta' }, stepsText(spec.steps))
      )
    );
    const runs = scenarios.runs
      .slice()
      .reverse()
      .map((run) => {
        const percent = Math.min(100, (100 * run.elapsed) / run.duration);
        const bar = el('div', { className: 'progress' }, el('div', { className: 'fill' }));
        bar.firstChild.style.width = `${percent.toFixed(1)}%`;
        return el(
          'div',
          { className: `scenario run ${run.state}` },
          el(
            'div',
            { className: 'scenario-head' },
            el('strong', null, run.name),
            el('span', { className: 'meta' }, run.id),
            el('span', { className: `badge ${run.state === 'running' ? 'active' : 'done'}` }, run.state),
            el('span', { className: 'meta' }, `${duration(run.elapsed)} of ${duration(run.duration)}`),
            run.state === 'running'
              ? el(
                  'button',
                  {
                    type: 'button',
                    className: 'small danger',
                    onclick: () => act('DELETE', `/scenarios/${enc(run.id)}`),
                  },
                  'Stop'
                )
              : null
          ),
          bar,
          el(
            'ol',
            { className: 'steps' },
            ...run.steps.map((step) =>
              el(
                'li',
                { className: `step ${step.state}` },
                `${at(step.at)} ${step.target} ${step.kind}${step.for ? ` for ${at(step.for)}` : ''}`,
                el('span', { className: 'meta' }, ` ${step.state}${step.hits ? `, ${step.hits} hits` : ''}`)
              )
            )
          )
        );
      });
    section.replaceChildren(
      el('h2', null, 'Scenarios'),
      definedList.length ? el('div', { className: 'scenarios-defined' }, ...definedList) : null,
      runs.length ? el('h3', null, 'Runs') : null,
      ...runs,
      scenarioEditor()
    );
  }

  // ------------------------------------------------------------------------------------------------ the form
  function fillTargets() {
    // Without a value, a rule stays as long as the plugin lets it (maxDuration).
    $('for').placeholder = `${duration(state.maxDuration)} (at most)`;
    const select = $('target');
    const current = select.value;
    const names = Object.keys(state.targets);
    if ([...select.options].map((o) => o.value).join() !== names.join()) {
      select.replaceChildren(...names.map((name) => el('option', { value: name }, name)));
      if (names.includes(current)) select.value = current;
      fillTarget();
    }
  }

  function fillTarget() {
    const target = state.targets[$('target').value];
    if (!target) return;
    const kind = $('kind');
    const previous = kind.value;
    kind.replaceChildren(...target.kinds.map((name) => el('option', { value: name }, name)));
    if (target.kinds.includes(previous)) kind.value = previous;
    const checks = [
      ...Object.keys(target.groups || {}).map((group) => [group, true]),
      ...target.operations.map((operation) => [operation, false]),
    ];
    $('operations').replaceChildren(
      ...checks.map(([name, group]) =>
        el('label', { className: group ? 'group' : '' }, el('input', { type: 'checkbox', value: name }), name)
      )
    );
    $('filters').replaceChildren(
      ...target.filters.map((name) => {
        const input = el('input', { placeholder: 'names, comma separated; /regex/' });
        input.dataset.filter = name;
        return el('label', { className: 'wide' }, name, input);
      })
    );
    showKind();
  }

  function showKind() {
    const kind = $('kind').value;
    document.querySelectorAll('[data-kinds]').forEach((node) => {
      node.hidden = !node.dataset.kinds.split(' ').includes(kind);
    });
  }

  // A filter as the plugin takes it: names, or { regex } (written /.../flags).
  function filterValue(text) {
    const items = [];
    const regex = /^\/(.+)\/([a-z]*)$/;
    for (const part of text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)) {
      const found = regex.exec(part);
      items.push(found ? { regex: found[1], flags: found[2] } : part);
    }
    return items.length === 1 ? items[0] : items;
  }

  function ruleBody() {
    const body = {};
    const kind = $('kind').value;
    const operations = [...$('operations').querySelectorAll('input:checked')].map((input) => input.value);
    if (operations.length) body.operations = operations;
    $('filters')
      .querySelectorAll('input')
      .forEach((input) => {
        if (input.value.trim()) body[input.dataset.filter] = filterValue(input.value);
      });
    const number = (id) => ($(id).value === '' ? undefined : Number($(id).value));
    const set = (key, value) => {
      if (value !== undefined && value !== '') body[key] = value;
    };
    set('rate', number('rate'));
    set('after', number('after'));
    set('times', number('times'));
    set('for', $('for').value.trim() || undefined);
    if (kind === 'delay') {
      set('ms', number('ms') === undefined ? 500 : number('ms'));
      set('jitter', number('jitter'));
    }
    if (kind === 'fail' || kind === 'down') set('message', $('message').value.trim());
    if (kind === 'respond') {
      set('status', number('status-code') === undefined ? 503 : number('status-code'));
      const json = $('json').value.trim();
      if (json) {
        try {
          body.json = JSON.parse(json);
        } catch (err) {
          throw new Error(`The JSON body is not JSON: ${err.message}`);
        }
      }
    }
    return body;
  }

  async function addRule(event) {
    event.preventDefault();
    const error = $('form-error');
    error.hidden = true;
    try {
      const target = $('target').value;
      await api('POST', `/${enc(target)}/${enc($('kind').value)}`, ruleBody());
      await refresh();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  }

  // ------------------------------------------------------------------------------------------------ loading
  async function act(method, path) {
    try {
      await api(method, path);
      await refresh();
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  async function refresh() {
    try {
      const [faults, scenarios] = await Promise.all([api('GET', ''), api('GET', '/scenarios')]);
      state = faults;
      $('token-form').hidden = true;
      $('main').hidden = false;
      fillTargets();
      render();
      renderScenarios(scenarios);
    } catch (err) {
      if (err.unauthorized) {
        $('main').hidden = true;
        $('clear-all').hidden = true;
        $('token-form').hidden = !needsToken;
        setStatus(needsToken ? 'A token is needed' : 'Not allowed to change faults', true);
      } else setStatus(err.message, true);
    }
  }

  function tick() {
    document.querySelectorAll('td.expires').forEach((cell) => {
      cell.textContent = left(cell.dataset.expiresAt);
    });
  }

  // ------------------------------------------------------------------------------------------------ in the browser
  // The theme and the presets of the form are kept in this browser (localStorage); without it, they last until the
  // page is reloaded.
  const local = {
    get(key, fallback) {
      try {
        const text = localStorage.getItem(key);
        return text === null ? fallback : JSON.parse(text);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        // Kept for this page only.
      }
    },
  };

  const THEME_KEY = 'xufa-faults-theme';
  function setTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  setTheme(local.get(THEME_KEY, null));
  $('theme').addEventListener('click', () => {
    const now =
      document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = now === 'dark' ? 'light' : 'dark';
    setTheme(next);
    local.set(THEME_KEY, next);
  });

  // Presets: the form as it is (target, kind, operations, filters and values), by name.
  const PRESETS_KEY = `xufa-faults-presets:${base}`;
  let presets = local.get(PRESETS_KEY, {});
  const FIELDS = ['for', 'rate', 'after', 'times', 'ms', 'jitter', 'message', 'status-code', 'json'];

  function formState() {
    const filters = {};
    $('filters')
      .querySelectorAll('input')
      .forEach((input) => {
        if (input.value) filters[input.dataset.filter] = input.value;
      });
    return {
      target: $('target').value,
      kind: $('kind').value,
      operations: [...$('operations').querySelectorAll('input:checked')].map((input) => input.value),
      filters,
      values: Object.fromEntries(FIELDS.map((id) => [id, $(id).value])),
    };
  }

  function applyState(saved) {
    // A preset of a target this app does not have (any more) is left alone.
    if (!saved || !saved.target || !(saved.target in current())) return;
    $('target').value = saved.target;
    fillTarget();
    if ([...$('kind').options].some((option) => option.value === saved.kind)) $('kind').value = saved.kind;
    showKind();
    $('operations')
      .querySelectorAll('input')
      .forEach((input) => {
        input.checked = saved.operations.includes(input.value);
      });
    $('filters')
      .querySelectorAll('input')
      .forEach((input) => {
        input.value = saved.filters[input.dataset.filter] || '';
      });
    for (const id of FIELDS) $(id).value = saved.values[id] || '';
  }
  const current = () => (state ? state.targets : {});

  function fillPresets(selected = '') {
    $('preset').replaceChildren(
      el('option', { value: '' }, '—'),
      ...Object.keys(presets)
        .sort()
        .map((name) => el('option', { value: name }, name))
    );
    $('preset').value = selected;
    $('delete-preset').hidden = selected === '';
  }

  $('save-preset').addEventListener('click', () => {
    const name = (window.prompt('A name for this preset (the form as it is):') || '').trim();
    if (!name) return;
    presets = { ...presets, [name]: formState() };
    local.set(PRESETS_KEY, presets);
    fillPresets(name);
  });
  $('preset').addEventListener('change', () => {
    const name = $('preset').value;
    $('delete-preset').hidden = name === '';
    if (name) applyState(presets[name]);
  });
  $('delete-preset').addEventListener('click', () => {
    const name = $('preset').value;
    if (!name) return;
    const { [name]: gone, ...rest } = presets;
    presets = rest;
    local.set(PRESETS_KEY, presets);
    fillPresets();
  });
  fillPresets();

  $('token-form').addEventListener('submit', (event) => {
    event.preventDefault();
    token = $('token').value;
    storage.set(token);
    $('token').value = '';
    refresh();
  });
  $('rule-form').addEventListener('submit', addRule);
  $('target').addEventListener('change', fillTarget);
  $('kind').addEventListener('change', showKind);
  $('clear-all').addEventListener('click', () => {
    if (window.confirm('Remove every rule of every target?')) act('DELETE', '');
  });

  refresh();
  setInterval(() => {
    if (!document.hidden && !$('main').hidden) refresh();
  }, 2000);
  setInterval(tick, 1000);
})();
