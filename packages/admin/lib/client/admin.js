/* global document, window, location, confirm */
// The page of the admin: the models, the list of each (search, filters, order, pages) and its forms, over the API of
// the plugin (api/); the health of the app on the first page, and the runs of pipelines with the graph of each. Routes
// in the hash: #/Book, #/Book/new, #/Book/12, #/_runs, #/_runs/7. The DOM is made with textContent: values are never
// HTML.
(function () {
  'use strict';

  var state = { models: [], byName: {}, title: 'Admin', list: {}, runs: false, health: false, runList: { page: 1 } };
  // The refresh of a run that is running (cleared when the route changes).
  var refresh = null;
  var SVG = 'http://www.w3.org/2000/svg';
  var app = document.getElementById('app');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
      else if (key === 'className') node.className = value;
      else node.setAttribute(key, value === true ? '' : value);
    });
    (children || []).forEach(function (child) {
      if (child !== null && child !== undefined)
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || 'GET', headers: { accept: 'application/json' } };
    if (init.method !== 'GET') {
      init.headers['x-xufa-admin'] = '1';
      // The CSRF token of the session, for apps whose sessions ask for it.
      if (state.csrf) init.headers['x-csrf-token'] = state.csrf;
    }
    if (options.body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    return fetch(path.indexOf('/') === 0 ? path.slice(1) : 'api/' + path, init).then(function (response) {
      if (response.status === 204) return { ok: true, status: 204, data: null };
      // Logged out (or the session expired): to the login page.
      if (response.status === 401) {
        location.href = 'login';
        return new Promise(function () {});
      }
      return response.json().then(
        function (data) {
          return { ok: response.ok, status: response.status, data: data };
        },
        function () {
          return { ok: response.ok, status: response.status, data: { error: response.statusText } };
        }
      );
    });
  }

  var toastTimer = null;
  function toast(text) {
    var node = document.querySelector('.toast');
    node.textContent = text;
    node.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('on');
    }, 1800);
  }

  function display(field, value, related) {
    if (value === null || value === undefined) return '—';
    if (field.type === 'foreignKey') return related && related[field.name] ? related[field.name] : String(value);
    if (field.type === 'boolean') return value ? 'Yes' : 'No';
    if (field.type === 'datetime') return new Date(value).toLocaleString();
    if (field.type === 'json') return JSON.stringify(value);
    return String(value);
  }

  function fieldOf(model, name) {
    return model.fields.filter(function (field) {
      return field.name === name;
    })[0];
  }

  function nav(current) {
    return el(
      'nav',
      {},
      [el('h1', { text: state.title })]
        .concat(
          state.models.map(function (model) {
            return el('a', { href: '#/' + model.name, className: model.name === current ? 'current' : '' }, [
              el('span', { text: model.label }),
              el('span', { className: 'count', text: String(model.count) }),
            ]);
          })
        )
        .concat(
          state.user
            ? [
                el('div', { className: 'user' }, [
                  el('span', { text: state.user.name }),
                  el('button', {
                    text: 'Log out',
                    onclick: function () {
                      api('/logout', { method: 'POST', body: {} }).then(function () {
                        location.href = 'login';
                      });
                    },
                  }),
                ]),
              ]
            : []
        )
        .concat(
          state.runs
            ? [
                el('a', { href: '#/_runs', className: 'section' + (current === '_runs' ? ' current' : '') }, [
                  el('span', { text: 'Pipeline runs' }),
                ]),
              ]
            : []
        )
    );
  }

  function render(main, current) {
    app.textContent = '';
    app.appendChild(el('div', { className: 'layout' }, [nav(current), main]));
  }

  function pill(status) {
    return el('span', { className: 'pill s-' + status, text: status });
  }

  // The report of GET /health of the app: its status and its checks.
  function healthCard() {
    var card = el('div', { className: 'card health' }, [
      el('div', { className: 'empty', text: 'Checking the health…' }),
    ]);
    api('_health').then(function (res) {
      card.textContent = '';
      if (!res.ok) {
        card.appendChild(
          el('div', { className: 'all-errors', text: (res.data && res.data.error) || 'Error ' + res.status })
        );
        return;
      }
      var report = res.data;
      var names = Object.keys(report.checks || {});
      card.appendChild(
        el('div', { className: 'health-head' }, [
          el('strong', { text: 'Health ' }),
          pill(report.status),
          el('span', { className: 'muted', text: ' up ' + Math.round((report.uptime || 0) / 60) + ' min' }),
        ])
      );
      if (!names.length) return;
      card.appendChild(
        el('table', {}, [
          el(
            'tbody',
            {},
            names.map(function (name) {
              var check = report.checks[name];
              var about = check.error || (check.details === undefined ? '' : JSON.stringify(check.details));
              return el('tr', {}, [
                el('td', { text: name + (check.critical ? '' : ' (not critical)') }),
                el('td', {}, [pill(check.status)]),
                el('td', { className: 'muted', text: check.duration + ' ms' }),
                el('td', { className: 'muted detail', text: about }),
              ]);
            })
          ),
        ])
      );
    });
    return card;
  }

  function home() {
    render(
      el('main', {}, [
        el('div', { className: 'head' }, [el('h2', { text: state.title })]),
        state.health ? healthCard() : null,
        // The models (none: no card).
        state.models.length
          ? el('div', { className: 'card' }, [
              el('table', {}, [
                el(
                  'tbody',
                  {},
                  state.models.map(function (model) {
                    return el(
                      'tr',
                      {
                        onclick: function () {
                          location.hash = '#/' + model.name;
                        },
                      },
                      [
                        el('td', { text: model.label }),
                        el('td', { className: 'muted', text: model.count + ' objects' }),
                      ]
                    );
                  })
                ),
              ]),
            ])
          : null,
        state.runs ? el('p', {}, [el('a', { href: '#/_runs', text: 'Pipeline runs ›' })]) : null,
      ])
    );
  }

  function listView(model) {
    var opts = state.list[model.name] || (state.list[model.name] = { page: 1, search: '', order: '', filters: {} });
    var query = ['page=' + opts.page];
    if (opts.search) query.push('search=' + encodeURIComponent(opts.search));
    if (opts.order) query.push('order=' + encodeURIComponent(opts.order));
    Object.keys(opts.filters).forEach(function (name) {
      if (opts.filters[name] !== '') query.push('filter.' + name + '=' + encodeURIComponent(opts.filters[name]));
    });
    api(model.name + '?' + query.join('&')).then(function (res) {
      if (!res.ok) return failure(res);
      var data = res.data;
      var tools = el('div', { className: 'tools' });
      if (model.search.length) {
        var box = el('input', { type: 'search', placeholder: 'Search ' + model.search.join(', '), value: opts.search });
        box.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            opts.search = box.value;
            opts.page = 1;
            listView(model);
          }
        });
        tools.appendChild(box);
      }
      model.filters.forEach(function (name) {
        var field = fieldOf(model, name);
        var select = el('select', { 'aria-label': name }, [el('option', { value: '', text: name + ': all' })]);
        var choices =
          field.type === 'boolean'
            ? [
                ['true', 'Yes'],
                ['false', 'No'],
              ]
            : (field.choices || []).map(function (c) {
                return [c, c];
              });
        if (field.null) choices.push(['null', '(none)']);
        var add = function (pairs) {
          pairs.forEach(function (pair) {
            select.appendChild(
              el('option', {
                value: String(pair[0]),
                text: name + ': ' + pair[1],
                selected: String(opts.filters[name]) === String(pair[0]),
              })
            );
          });
        };
        if (field.type === 'foreignKey') {
          api(field.target + '/choices').then(function (r) {
            if (r.ok)
              add(
                r.data.map(function (c) {
                  return [c.pk, c.label];
                })
              );
            add(field.null ? [['null', '(none)']] : []);
          });
        } else add(choices);
        select.addEventListener('change', function () {
          opts.filters[name] = select.value;
          opts.page = 1;
          listView(model);
        });
        tools.appendChild(select);
      });
      var columns = model.list.map(function (name) {
        return fieldOf(model, name);
      });
      var head = el(
        'tr',
        {},
        columns.map(function (field) {
          var mark = opts.order === field.name ? ' ▲' : opts.order === '-' + field.name ? ' ▼' : '';
          return el('th', {
            text: field.name + mark,
            onclick: function () {
              opts.order = opts.order === field.name ? '-' + field.name : field.name;
              listView(model);
            },
          });
        })
      );
      var rows = data.results.map(function (item) {
        return el(
          'tr',
          {
            onclick: function () {
              location.hash = '#/' + model.name + '/' + encodeURIComponent(item.pk);
            },
          },
          columns.map(function (field) {
            return el('td', { text: display(field, item.values[field.attname], item.related) });
          })
        );
      });
      var from = data.count === 0 ? 0 : (data.page - 1) * data.size + 1;
      var to = Math.min(data.count, data.page * data.size);
      var pages = el('div', { className: 'pages' }, [
        el('span', { text: from + '–' + to + ' of ' + data.count }),
        el('button', {
          text: '‹ Previous',
          disabled: data.page <= 1,
          onclick: function () {
            opts.page -= 1;
            listView(model);
          },
        }),
        el('button', {
          text: 'Next ›',
          disabled: to >= data.count,
          onclick: function () {
            opts.page += 1;
            listView(model);
          },
        }),
      ]);
      render(
        el('main', {}, [
          el('div', { className: 'head' }, [
            el('h2', { text: model.label }),
            model.readOnlyModel
              ? null
              : el('button', {
                  className: 'primary',
                  text: 'Add ' + model.label,
                  onclick: function () {
                    location.hash = '#/' + model.name + '/new';
                  },
                }),
          ]),
          tools,
          el('div', { className: 'card' }, [
            rows.length
              ? el('table', {}, [el('thead', {}, [head]), el('tbody', {}, rows)])
              : el('div', { className: 'empty', text: 'Nothing here.' }),
          ]),
          pages,
        ]),
        model.name
      );
    });
  }

  // An input for a field, with a function giving its value.
  function input(field, value) {
    var id = 'f-' + field.name;
    var node;
    var read;
    if (field.input === 'checkbox') {
      node = el('input', { type: 'checkbox', id: id, checked: Boolean(value) });
      read = function () {
        return node.checked;
      };
    } else if (field.input === 'choices') {
      node = el(
        'select',
        { id: id },
        [el('option', { value: '', text: field.null ? '(none)' : '—' })].concat(
          field.choices.map(function (choice) {
            return el('option', { value: String(choice), text: String(choice), selected: value === choice });
          })
        )
      );
      read = function () {
        return node.value === ''
          ? null
          : field.choices.filter(function (c) {
              return String(c) === node.value;
            })[0];
      };
    } else if (field.input === 'select') {
      node = el('select', { id: id }, [el('option', { value: '', text: field.null ? '(none)' : '—' })]);
      api(field.target + '/choices').then(function (res) {
        if (!res.ok) return;
        res.data.forEach(function (choice) {
          node.appendChild(
            el('option', {
              value: String(choice.pk),
              text: choice.label,
              selected: String(choice.pk) === String(value),
            })
          );
        });
        if (
          value !== null &&
          value !== undefined &&
          !res.data.some(function (c) {
            return String(c.pk) === String(value);
          })
        ) {
          node.appendChild(el('option', { value: String(value), text: String(value), selected: true }));
        }
      });
      read = function () {
        if (node.value === '') return null;
        return /^\d+$/.test(node.value) ? Number(node.value) : node.value;
      };
    } else if (field.input === 'textarea' || field.input === 'json') {
      node = el('textarea', { id: id });
      node.value =
        value === null || value === undefined
          ? ''
          : field.input === 'json'
            ? JSON.stringify(value, null, 2)
            : String(value);
      read = function () {
        if (field.input !== 'json') return node.value;
        if (node.value.trim() === '') return null;
        return JSON.parse(node.value);
      };
    } else if (field.input === 'datetime') {
      var local = '';
      if (value) {
        var date = new Date(value);
        local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      node = el('input', { type: 'datetime-local', id: id, value: local });
      read = function () {
        return node.value ? new Date(node.value).toISOString() : null;
      };
    } else {
      var type = field.input === 'number' ? 'number' : field.input === 'date' ? 'date' : 'text';
      node = el('input', {
        type: type,
        id: id,
        value: value === null || value === undefined ? '' : String(value),
        maxlength: field.maxLength || null,
        step: field.input === 'number' ? 'any' : null,
      });
      read = function () {
        if (node.value === '') return field.null ? null : field.type === 'string' ? '' : null;
        return field.input === 'number' ? Number(node.value) : node.value;
      };
    }
    return { node: node, read: read };
  }

  function formView(model, pk) {
    var load =
      pk === 'new' ? Promise.resolve({ ok: true, data: null }) : api(model.name + '/' + encodeURIComponent(pk));
    load.then(function (res) {
      if (!res.ok) return failure(res);
      var item = res.data;
      var inputs = {};
      var errorsOf = {};
      var all = el('div', { className: 'all-errors', hidden: true });
      var fields = model.fields.map(function (field) {
        var value = item ? item.values[field.attname] : field.default;
        var errors = el('div', { className: 'errors' });
        errorsOf[field.name] = errors;
        errorsOf[field.attname] = errors;
        var note = field.required ? ' (required)' : '';
        if (field.readOnly) {
          if (!item) return null;
          return el('div', { className: 'field' }, [
            el('label', {}, [field.name]),
            el('div', { className: 'value', text: display(field, value, item.related) }),
          ]);
        }
        var made = input(field, value);
        inputs[field.attname] = made;
        return el('div', { className: 'field' }, [
          el('label', { for: made.node.id }, [field.name, el('span', { className: 'note', text: note })]),
          made.node,
          errors,
        ]);
      });
      var form = el('form', { className: 'edit' }, [all].concat(fields));
      var save = el('button', { className: 'primary', type: 'submit', text: 'Save' });
      var actions = el('div', { className: 'actions' }, [
        el('div', {}, [
          save,
          ' ',
          el('button', {
            type: 'button',
            text: 'Cancel',
            onclick: function () {
              location.hash = '#/' + model.name;
            },
          }),
        ]),
        item && !model.readOnlyModel
          ? el('button', {
              type: 'button',
              className: 'danger',
              text: 'Delete',
              onclick: function () {
                if (!confirm('Delete ' + item.label + '?')) return;
                api(model.name + '/' + encodeURIComponent(item.pk), { method: 'DELETE' }).then(function (r) {
                  if (!r.ok) return showErrors(r.data);
                  toast('Deleted');
                  refreshCounts().then(function () {
                    location.hash = '#/' + model.name;
                  });
                });
              },
            })
          : null,
      ]);
      if (!model.readOnlyModel) form.appendChild(actions);
      function showErrors(data) {
        Object.keys(errorsOf).forEach(function (name) {
          errorsOf[name].textContent = '';
        });
        var rest = [];
        var errors = (data && data.errors) || {};
        Object.keys(errors).forEach(function (name) {
          var text = [].concat(errors[name]).join(' ');
          if (errorsOf[name]) errorsOf[name].textContent = text;
          else rest.push((name === '__all__' ? '' : name + ': ') + text);
        });
        if (!Object.keys(errors).length && data && data.error) rest.push(data.error);
        all.textContent = rest.join(' ');
        all.hidden = rest.length === 0;
      }
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var body = {};
        try {
          Object.keys(inputs).forEach(function (attname) {
            body[attname] = inputs[attname].read();
          });
        } catch (err) {
          return showErrors({ error: 'Not JSON: ' + err.message });
        }
        save.disabled = true;
        var request = item
          ? api(model.name + '/' + encodeURIComponent(item.pk), { method: 'PATCH', body: body })
          : api(model.name, { method: 'POST', body: body });
        request.then(function (r) {
          save.disabled = false;
          if (!r.ok) return showErrors(r.data);
          toast('Saved');
          refreshCounts().then(function () {
            location.hash = '#/' + model.name;
          });
        });
      });
      render(
        el('main', {}, [
          el('div', { className: 'head' }, [
            el('h2', {}, [el('a', { href: '#/' + model.name, text: model.label }), ' › ', item ? item.label : 'New']),
          ]),
          form,
        ]),
        model.name
      );
    });
  }

  function when(value) {
    return value ? new Date(value).toLocaleString() : '—';
  }

  function runsView() {
    var opts = state.runList;
    var query = ['page=' + opts.page];
    if (opts.status) query.push('status=' + encodeURIComponent(opts.status));
    if (opts.pipeline) query.push('pipeline=' + encodeURIComponent(opts.pipeline));
    api('_runs?' + query.join('&')).then(function (res) {
      if (!res.ok) return failure(res);
      var data = res.data;
      var status = el('select', { 'aria-label': 'status' }, [el('option', { value: '', text: 'status: all' })]);
      ['running', 'done', 'failed', 'cancelled'].forEach(function (name) {
        status.appendChild(
          el('option', { value: name, text: name + ' (' + data.counts[name] + ')', selected: opts.status === name })
        );
      });
      var pipeline = el('select', { 'aria-label': 'pipeline' }, [el('option', { value: '', text: 'pipeline: all' })]);
      data.pipelines.forEach(function (name) {
        pipeline.appendChild(el('option', { value: name, text: name, selected: opts.pipeline === name }));
      });
      [status, pipeline].forEach(function (select) {
        select.addEventListener('change', function () {
          opts.status = status.value;
          opts.pipeline = pipeline.value;
          opts.page = 1;
          runsView();
        });
      });
      var rows = data.results.map(function (run) {
        return el(
          'tr',
          {
            onclick: function () {
              location.hash = '#/_runs/' + encodeURIComponent(run.id);
            },
          },
          [
            el('td', { text: String(run.id) }),
            el('td', { text: run.pipeline }),
            el('td', {}, [pill(run.status)]),
            el('td', { text: when(run.createdAt) }),
            el('td', { text: when(run.finishedAt) }),
            el('td', { className: 'muted detail', text: run.error || '' }),
          ]
        );
      });
      var from = data.count === 0 ? 0 : (data.page - 1) * data.size + 1;
      var to = Math.min(data.count, data.page * data.size);
      render(
        el('main', {}, [
          el('div', { className: 'head' }, [el('h2', { text: 'Pipeline runs' })]),
          el('div', { className: 'tools' }, [status, pipeline]),
          el('div', { className: 'card' }, [
            rows.length
              ? el('table', {}, [
                  el('thead', {}, [
                    el(
                      'tr',
                      {},
                      ['run', 'pipeline', 'status', 'started', 'finished', 'error'].map(function (name) {
                        return el('th', { text: name });
                      })
                    ),
                  ]),
                  el('tbody', {}, rows),
                ])
              : el('div', { className: 'empty', text: 'No runs.' }),
          ]),
          el('div', { className: 'pages' }, [
            el('span', { text: from + '–' + to + ' of ' + data.count }),
            el('button', {
              text: '‹ Previous',
              disabled: data.page <= 1,
              onclick: function () {
                opts.page -= 1;
                runsView();
              },
            }),
            el('button', {
              text: 'Next ›',
              disabled: to >= data.count,
              onclick: function () {
                opts.page += 1;
                runsView();
              },
            }),
          ]),
        ]),
        '_runs'
      );
    });
  }

  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  // The graph of a run: its steps in columns by depth (a step after the steps it follows), colored by status, with
  // arrows from each step to those after it. A click shows a step.
  function graph(run, selected, select) {
    var W = 168;
    var H = 54;
    var GX = 56;
    var GY = 16;
    var PAD = 12;
    var level = {};
    var columns = [];
    run.graph.steps.forEach(function (step) {
      var depth = 0;
      step.after.forEach(function (parent) {
        if (level[parent] !== undefined) depth = Math.max(depth, level[parent] + 1);
      });
      level[step.id] = depth;
      (columns[depth] = columns[depth] || []).push(step);
    });
    var at = {};
    var rows = 0;
    columns.forEach(function (column, x) {
      rows = Math.max(rows, column.length);
      column.forEach(function (step, y) {
        at[step.id] = { x: PAD + x * (W + GX), y: PAD + y * (H + GY) };
      });
    });
    var width = PAD * 2 + columns.length * W + Math.max(0, columns.length - 1) * GX;
    var height = PAD * 2 + rows * H + Math.max(0, rows - 1) * GY;
    var root = svg(
      'svg',
      {
        width: width,
        height: height,
        viewBox: '0 0 ' + width + ' ' + height,
        role: 'img',
        'aria-label': 'The steps of the run',
      },
      [
        svg('defs', {}, [
          svg(
            'marker',
            {
              id: 'arrow',
              viewBox: '0 0 10 10',
              refX: '9',
              refY: '5',
              markerWidth: '7',
              markerHeight: '7',
              orient: 'auto',
            },
            [svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow' })]
          ),
        ]),
      ]
    );
    run.graph.steps.forEach(function (step) {
      step.after.forEach(function (parent) {
        if (!at[parent]) return;
        var x1 = at[parent].x + W;
        var y1 = at[parent].y + H / 2;
        var x2 = at[step.id].x;
        var y2 = at[step.id].y + H / 2;
        var mx = (x1 + x2) / 2;
        root.appendChild(
          svg('path', {
            d: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + (x2 - 2) + ',' + y2,
            class: 'edge',
            'marker-end': 'url(#arrow)',
          })
        );
      });
    });
    run.graph.steps.forEach(function (step) {
      var row = run.steps[step.id] || { status: 'waiting', attempts: 0 };
      var p = at[step.id];
      var second =
        row.status +
        (row.attempts > 1 ? ' · ' + row.attempts + ' attempts' : '') +
        (row.pausedUntil ? ' · until ' + new Date(row.pausedUntil).toLocaleTimeString() : '');
      root.appendChild(
        svg(
          'g',
          {
            class: 'node s-' + row.status + (selected === step.id ? ' selected' : ''),
            tabindex: '0',
            onclick: function () {
              select(step.id);
            },
            onkeydown: function (event) {
              if (event.key === 'Enter') select(step.id);
            },
          },
          [
            svg('title', { text: step.id + ': ' + row.status }),
            svg('rect', { x: p.x, y: p.y, width: W, height: H, rx: 8 }),
            svg('text', {
              x: p.x + 10,
              y: p.y + 21,
              class: 'name',
              text: step.id.length > 20 ? step.id.slice(0, 19) + '…' : step.id,
            }),
            svg('text', {
              x: p.x + 10,
              y: p.y + 40,
              class: 'status',
              text: second.length > 27 ? second.slice(0, 26) + '…' : second,
            }),
          ]
        )
      );
    });
    return el('div', { className: 'card graph' }, [root]);
  }

  function json(value) {
    return el('pre', { text: value === null || value === undefined ? '—' : JSON.stringify(value, null, 2) });
  }

  function runView(id, selected) {
    clearTimeout(refresh);
    api('_runs/' + encodeURIComponent(id)).then(function (res) {
      if (!res.ok) return failure(res);
      var run = res.data;
      var stepIds = run.graph.steps.map(function (step) {
        return step.id;
      });
      if (!selected || stepIds.indexOf(selected) < 0) {
        // The first step paused, failed or running; or the first one.
        selected =
          stepIds.filter(function (stepId) {
            var s = run.steps[stepId] && run.steps[stepId].status;
            return s === 'paused' || s === 'failed' || s === 'running' || s === 'retrying';
          })[0] || stepIds[0];
      }
      var act = function (path, body, done) {
        api('_runs/' + encodeURIComponent(run.id) + '/' + path, { method: 'POST', body: body || {} }).then(
          function (r) {
            if (!r.ok) return toast(r.data && r.data.error ? r.data.error : 'Error ' + r.status);
            toast(done);
            runView(run.id, selected);
          }
        );
      };
      var buttons = el('div', {}, [
        run.status === 'failed' || run.status === 'cancelled'
          ? el('button', {
              className: 'primary',
              text: 'Retry',
              onclick: function () {
                act('retry', {}, 'Tried again');
              },
            })
          : null,
        ' ',
        run.status === 'running'
          ? el('button', {
              className: 'danger',
              text: 'Cancel',
              onclick: function () {
                if (confirm('Cancel the run ' + run.id + '?')) act('cancel', {}, 'Cancelled');
              },
            })
          : null,
      ]);
      var step = run.steps[selected] || {};
      var definition =
        run.graph.steps.filter(function (item) {
          return item.id === selected;
        })[0] || {};
      var panel = el('div', { className: 'card step' }, [
        el('div', { className: 'health-head' }, [
          el('strong', { text: selected + ' ' }),
          pill(step.status || 'waiting'),
        ]),
        el('dl', {}, [
          el('dt', { text: 'block' }),
          el('dd', { text: definition.block || '—' }),
          el('dt', { text: 'after' }),
          el('dd', { text: (definition.after || []).join(', ') || '—' }),
          definition.when ? el('dt', { text: 'when' }) : null,
          definition.when ? el('dd', { text: definition.when }) : null,
          step.child ? el('dt', { text: 'runs' }) : null,
          step.child
            ? el('dd', {}, [
                el('a', { href: '#/_runs/' + encodeURIComponent(step.child), text: 'the run ' + step.child }),
              ])
            : null,
          el('dt', { text: 'attempts' }),
          el('dd', { text: String(step.attempts || 0) }),
          el('dt', { text: 'started' }),
          el('dd', { text: when(step.startedAt) }),
          el('dt', { text: 'finished' }),
          el('dd', { text: when(step.finishedAt) }),
          step.pausedUntil ? el('dt', { text: 'waits until' }) : null,
          step.pausedUntil ? el('dd', { text: when(step.pausedUntil) }) : null,
        ]),
        step.error ? el('div', { className: 'all-errors', text: step.error.split('\n')[0] }) : null,
        el('h3', { text: 'Output' }),
        json(step.output),
      ]);
      if (step.status === 'paused' && run.status === 'running') {
        var output = el('textarea', { 'aria-label': 'output', placeholder: 'The output, as JSON (empty: null)' });
        panel.appendChild(
          el('form', { className: 'resume' }, [
            el('h3', { text: 'Resume' }),
            output,
            el('button', { className: 'primary', type: 'submit', text: 'Resume ' + selected }),
          ])
        );
        panel.querySelector('form').addEventListener('submit', function (event) {
          event.preventDefault();
          var value = null;
          try {
            value = output.value.trim() === '' ? null : JSON.parse(output.value);
          } catch (err) {
            return toast('Not JSON: ' + err.message);
          }
          act('steps/' + encodeURIComponent(selected) + '/resume', { output: value }, 'Resumed');
        });
      }
      render(
        el('main', {}, [
          el('div', { className: 'head' }, [
            el('h2', {}, [
              el('a', { href: '#/_runs', text: 'Runs' }),
              ' › ' + run.pipeline + ' #' + run.id + ' ',
              pill(run.status),
            ]),
            buttons,
          ]),
          run.error ? el('div', { className: 'all-errors', text: run.error }) : null,
          run.parent
            ? el('p', { className: 'muted' }, [
                'Run by the step ' + run.parentStep + ' of ',
                el('a', { href: '#/_runs/' + encodeURIComponent(run.parent), text: 'the run ' + run.parent }),
              ])
            : null,
          el('p', {
            className: 'muted',
            text:
              'Started ' +
              when(run.createdAt) +
              (run.finishedAt ? ' · finished ' + when(run.finishedAt) : '') +
              (run.graph.concurrency ? ' · ' + run.inFlight + ' of ' + run.graph.concurrency + ' steps at once' : ''),
          }),
          graph(run, selected, function (stepId) {
            runView(run.id, stepId);
          }),
          panel,
          el('div', { className: 'card io' }, [
            el('h3', { text: 'Input' }),
            json(run.input),
            el('h3', { text: 'Result' }),
            json(run.result),
          ]),
        ]),
        '_runs'
      );
      // While it runs, it is read again.
      if (run.status === 'running') {
        refresh = setTimeout(function () {
          if (location.hash === '#/_runs/' + encodeURIComponent(run.id)) runView(run.id, selected);
        }, 3000);
      }
    });
  }

  function failure(res) {
    render(
      el('main', {}, [
        el('div', { className: 'all-errors', text: (res.data && res.data.error) || 'Error ' + res.status }),
      ])
    );
  }

  function refreshCounts() {
    return api('models').then(function (res) {
      if (!res.ok) return;
      state.models = res.data.models;
      state.models.forEach(function (model) {
        state.byName[model.name] = model;
      });
    });
  }

  function route() {
    clearTimeout(refresh);
    var parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    if (parts[0] === '_runs' && state.runs) return parts[1] ? runView(parts[1]) : runsView();
    var model = state.byName[parts[0]];
    if (!model) return home();
    if (parts[1]) return formView(model, parts[1]);
    return listView(model);
  }

  api('models').then(function (res) {
    if (!res.ok) return failure(res);
    state.title = res.data.title;
    state.runs = Boolean(res.data.runs);
    state.user = res.data.user || null;
    state.csrf = res.data.csrf || null;
    state.health = Boolean(res.data.health);
    document.title = res.data.title;
    state.models = res.data.models;
    state.models.forEach(function (model) {
      state.byName[model.name] = model;
    });
    window.addEventListener('hashchange', route);
    route();
  });
})();
