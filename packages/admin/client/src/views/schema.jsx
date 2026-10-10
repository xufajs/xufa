// The data model: the models of the admin as a diagram of entities (their fields, keys and relations) and the lines
// between them (foreign keys, many-to-many), those of the database of the project apart from those of each tenant. A
// click on a model shows its details; models can be moved (kept in this browser) and put back. With the designer of
// the server (in development), the models of the apps' models.yaml are edited here too (views/schema-editor.jsx).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  Controls,
  ControlButton,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useApi, useInterval } from '../api.js';
import { useConfirm } from '../feedback.jsx';
import {
  connect,
  designedModels,
  edits,
  freeName,
  ModelEditor,
  requestOf,
  Review,
  useDraft,
} from './schema-editor.jsx';
import { href } from '../router.js';
import { Icon } from '../icons.jsx';
import { Alert, Button, Dropdown, ErrorText, Facts, Failure, Loading, PageHead } from '../ui.jsx';
import { t, tn } from '../i18n.js';

// The sizes of the boxes (px): width, header, a row of a field; the gaps between columns and boxes, and areas.
const W = 248;
const HEAD = 46;
const ROW = 24;
const GX = 120;
const GY = 36;
const AREA_GAP = 90;
const AREA_PAD = 28;
const PLACES_KEY = 'xufa-admin-schema-places';

const RELATIONS = new Set(['foreignKey', 'manyToMany']);
// The model a relation points to by its name alone (that of another app is app.Model).
const targetOf = (field, model) => (field.to === 'self' ? model : String(field.to).split('.').pop());

function readPlaces() {
  try {
    return JSON.parse(window.localStorage.getItem(PLACES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function writePlaces(places) {
  try {
    window.localStorage.setItem(PLACES_KEY, JSON.stringify(places));
  } catch {
    // (A browser that keeps nothing: the boxes go back to their places next time.)
  }
}

// The fields of a model as rows: its key first (the ORM's id when it has no field of its own).
function rowsOf(model) {
  const fields = Object.entries(model.spec.fields || {}).map(([name, spec]) => ({ name, ...spec }));
  const own = new Set(fields.map((field) => field.name));
  const implicit = model.pk.filter((name) => !own.has(name)).map((name) => ({ name, type: 'id', implicit: true }));
  return [...implicit, ...fields];
}

// The text of the type of a field: its model for relations, what it holds for arrays.
function typeText(field) {
  if (field.type === 'foreignKey') return `→ ${field.to === 'self' ? t('itself') : targetOf(field)}`;
  if (field.type === 'manyToMany') return `⇉ ${field.to === 'self' ? t('itself') : targetOf(field)}`;
  if ((field.type === 'array' || field.type === 'encrypted') && field.of) {
    return `${field.type}<${typeof field.of === 'string' ? field.of : field.of.type}>`;
  }
  return field.maxLength ? `${field.type}(${field.maxLength})` : field.type;
}

// Columns by relations, as a reading order: the models others point to on the left, those that point to them on
// their right (a cycle stops where it closes).
function columnsOf(models) {
  const names = new Set(models.map((model) => model.name));
  const byName = new Map(models.map((model) => [model.name, model]));
  const column = new Map();
  const visiting = new Set();
  const place = (name) => {
    if (column.has(name)) return column.get(name);
    if (visiting.has(name)) return 0;
    visiting.add(name);
    let at = 0;
    for (const field of Object.values(byName.get(name).spec.fields || {})) {
      const target = field.type === 'foreignKey' ? targetOf(field, name) : null;
      if (!target || target === name || !names.has(target)) continue;
      at = Math.max(at, place(target) + 1);
    }
    visiting.delete(name);
    column.set(name, at);
    return at;
  };
  models.forEach((model) => place(model.name));
  return column;
}

// The boxes of the models of a place (project or tenant) from a top: in columns, each column a pile in the order of
// its apps and names. Gives the boxes and the height they take.
function layOut(models, top) {
  const column = columnsOf(models);
  const piles = new Map();
  for (const model of [...models].sort(
    (a, b) => (a.app || '').localeCompare(b.app || '') || a.name.localeCompare(b.name)
  )) {
    const at = column.get(model.name);
    if (!piles.has(at)) piles.set(at, []);
    piles.get(at).push(model);
  }
  const places = {};
  let bottom = top;
  for (const [at, pile] of piles) {
    let y = top + AREA_PAD + 18;
    for (const model of pile) {
      places[model.name] = { x: AREA_PAD + at * (W + GX), y };
      y += HEAD + rowsOf(model).length * ROW + GY;
    }
    bottom = Math.max(bottom, y - GY + AREA_PAD);
  }
  const width = AREA_PAD * 2 + Math.max(1, piles.size) * (W + GX) - GX;
  return { places, height: bottom - top, width };
}

// A model: its name, app and table, then a row for each field (key, type, and whether it may be empty or is unique);
// a relation leaves from its row.
function EntityNode({ data }) {
  const { model, selected, dimmed, onSelect, editing } = data;
  const drawable = editing && model.editable;
  const rows = rowsOf(model);
  return (
    <div
      className={`entity ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''} ${model.place} ${
        editing ? (model.editable ? 'editable' : 'locked') : ''
      } ${model.isNew ? 'new' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t('The model {model}', { model: model.name })}
      onClick={() => onSelect(model.name)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(model.name);
        }
      }}
    >
      <Handle type="target" position={Position.Left} id="in" isConnectable={Boolean(editing)} />
      {/* (Lines from models on its right come in on that side.) */}
      <Handle type="target" position={Position.Right} id="in-r" isConnectable={false} />
      {drawable ? (
        <Handle
          type="source"
          position={Position.Right}
          id="new"
          className="entity-link"
          isConnectable
          title={t('Draw a line to another model: a foreign key')}
        />
      ) : null}
      <div className="entity-head">
        <span className="entity-name">
          {editing && !model.editable ? <Icon name="lock" className="muted" /> : null}
          {model.name}
        </span>
        {model.app ? <span className="entity-app">{model.app}</span> : null}
        <span className="entity-table">{model.table}</span>
      </div>
      <ul className="entity-fields">
        {rows.map((field) => {
          const key = model.pk.includes(field.name);
          return (
            <li key={field.name} className={`entity-field ${RELATIONS.has(field.type) ? 'relation' : ''}`}>
              <span className="entity-mark" title={key ? t('Primary key') : undefined}>
                {key ? 'PK' : field.type === 'foreignKey' ? 'FK' : ''}
              </span>
              <span className="field-name">
                {field.name}
                {field.null ? <span className="muted">?</span> : null}
              </span>
              <span className="field-type">
                {typeText(field)}
                {field.unique ? (
                  <span className="unique" title={t('Unique')}>
                    U
                  </span>
                ) : null}
              </span>
              {RELATIONS.has(field.type) ? (
                <>
                  <Handle type="source" position={Position.Right} id={`f-${field.name}`} isConnectable={false} />
                  <Handle type="source" position={Position.Left} id={`f-${field.name}-l`} isConnectable={false} />
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The box of a place: the database of the project, or that of each tenant.
function AreaNode({ data }) {
  return (
    <div className="erd-area" style={{ width: data.width, height: data.height }}>
      <span className="erd-area-label">
        <Icon name={data.place === 'tenant' ? 'building' : 'database'} />
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { entity: EntityNode, area: AreaNode };

// What a model is: its table, app and place, its options, and its fields with all their options.
function ModelPanel({ model, onClose, locked }) {
  // (Options of the model: all but its fields and those of code.)
  const options = Object.fromEntries(Object.entries(model.spec).filter(([key]) => key !== 'fields' && key !== 'code'));
  const { code } = model.spec;
  const shown = (value) => (typeof value === 'string' ? value : JSON.stringify(value));
  return (
    <aside className="card erd-panel" aria-label={t('The model {model}', { model: model.name })}>
      <div className="card-head">
        <h2>{model.name}</h2>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose} aria-label={t('Close')} />
      </div>
      <div className="card-body">
        <Facts
          items={[
            [t('Table'), <code key="table">{model.table}</code>],
            [t('App'), model.app || '—'],
            [t('Database'), model.place === 'tenant' ? t("Each tenant's") : t("The project's")],
            ...Object.entries(options).map(([name, value]) => [name, <code key={name}>{shown(value)}</code>]),
            code && code.length ? [t('In code'), code.join(', ')] : null,
          ].filter(Boolean)}
        />
        {model.error ? <ErrorText text={model.error} /> : null}
        {locked ? (
          <p className="muted">{t('A model of code (models.js): it is read here, and relations can point to it.')}</p>
        ) : null}
        <h3>{tn(rowsOf(model).length, '{count} field', '{count} fields')}</h3>
        <ul className="erd-panel-fields">
          {rowsOf(model).map((field) => {
            const { name, implicit } = field;
            const SHOWN = ['name', 'type', 'implicit', 'to', 'of'];
            const rest = Object.fromEntries(Object.entries(field).filter(([key]) => !SHOWN.includes(key)));
            return (
              <li key={name}>
                <strong>{name}</strong> <code>{typeText(field)}</code>
                {implicit ? <span className="muted"> · {t('made by the ORM')}</span> : null}
                {Object.keys(rest).length ? (
                  <div className="muted">
                    {Object.entries(rest)
                      .map(([option, value]) => `${option}: ${shown(value)}`)
                      .join(' · ')}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {model.listed ? (
          <a className="btn" href={href([model.name])}>
            {t('Open its list')}
          </a>
        ) : null}
      </div>
    </aside>
  );
}

export function Schema() {
  const { data, error, reload } = useApi('_schema');
  const confirm = useConfirm();
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [moved, setMoved] = useState(readPlaces);
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(null);
  const design = data && data.design;
  const pending = Boolean(design && design.pending);
  // After a publish: asked again until the server, started again, has the models written.
  useInterval(() => reload({ quiet: true }), 2000, pending);
  const { draft, base, setDraft, discard, changed } = useDraft(design && !pending ? design : null);
  const designing = editing && Boolean(draft) && !pending;
  const models = useMemo(
    () => (data ? (designing ? designedModels(data.models, draft) : data.models) : []),
    [data, designing, draft, design]
  );

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const typed = search.trim().toLowerCase();
    const matches = (model) =>
      !typed ||
      model.name.toLowerCase().includes(typed) ||
      (model.app || '').toLowerCase().includes(typed) ||
      Object.keys(model.spec.fields || {}).some((name) => name.toLowerCase().includes(typed));
    const groups = [
      ['project', data.tenants ? t("The project's database") : t('The database')],
      ['tenant', t("Each tenant's database")],
    ]
      .map(([place, label]) => ({ place, label, models: models.filter((model) => model.place === place) }))
      .filter((group) => group.models.length);
    const nodes = [];
    let top = 0;
    for (const group of groups) {
      const { places, height, width } = layOut(group.models, top);
      // Areas only when there are two of them (with tenants).
      if (groups.length > 1 || data.tenants) {
        nodes.push({
          id: `area-${group.place}`,
          type: 'area',
          position: { x: 0, y: top },
          data: { place: group.place, label: group.label, width, height },
          draggable: false,
          selectable: false,
          zIndex: -1,
        });
      }
      for (const model of group.models) {
        nodes.push({
          id: model.name,
          type: 'entity',
          position: moved[model.name] || places[model.name],
          width: W,
          data: {
            model,
            selected: selected === model.name,
            dimmed: !matches(model),
            onSelect: setSelected,
            editing: designing,
          },
        });
      }
      top += height + AREA_GAP;
    }
    const names = new Set(models.map((model) => model.name));
    // Where each box is: a line to a model on the left leaves its field on the left, and comes in on that model's right.
    const at = new Map(nodes.filter((node) => node.type === 'entity').map((node) => [node.id, node.position]));
    const leftward = (from, to) => from !== to && at.has(from) && at.has(to) && at.get(to).x + W / 2 < at.get(from).x;
    const edges = models.flatMap((model) =>
      Object.entries(model.spec.fields || {})
        .filter(([, field]) => RELATIONS.has(field.type))
        .map(([name, field]) => {
          const target = targetOf(field, model.name);
          if (!names.has(target)) return null;
          const many = field.type === 'manyToMany';
          const near = selected === model.name || selected === target;
          return {
            id: `${model.name}.${name}`,
            source: model.name,
            sourceHandle: leftward(model.name, target) ? `f-${name}-l` : `f-${name}`,
            target,
            // (A relation to its own model loops on its right side.)
            targetHandle: leftward(model.name, target) || target === model.name ? 'in-r' : 'in',
            className: `${many ? 'many' : ''} ${near ? 'near' : ''}`,
            label: many ? 'n:m' : field.unique ? '1:1' : 'n:1',
            labelBgPadding: [4, 2],
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--line-strong)' },
          };
        })
        .filter(Boolean)
    );
    return { nodes, edges };
  }, [data, models, search, moved, selected, designing]);

  // A line drawn from a model of the draft to another: a foreign key to it.
  const onConnect = useCallback(
    ({ source, target }) => {
      const from = models.find((model) => model.name === source);
      if (!from || !from.editable || !target) return;
      setDraft(connect(from.app, source, target));
      setSelected(source);
    },
    [models, setDraft]
  );
  const addModel = (app) => {
    const name = freeName(
      'Model',
      models.map((model) => model.name)
    );
    setDraft(edits.addModel(app, name));
    setSelected(name);
  };
  const discardDraft = async () => {
    const yes = await confirm({
      title: t('Discard the changes?'),
      message: t('The draft goes; the models stay as the files have them.'),
      confirm: t('Discard'),
    });
    if (yes) discard();
  };

  // The nodes React Flow draws: its own state while a box is dragged (moves, sizes measured), made again from the
  // models when they change, keeping what React Flow measured (a node not measured is hidden until it is: the flicker
  // of rebuilding them at every move).
  const [flowNodes, setFlowNodes] = useState([]);
  useEffect(() => {
    setFlowNodes((before) => {
      const kept = new Map(before.map((node) => [node.id, node]));
      return nodes.map((node) => {
        const was = kept.get(node.id);
        return was && was.measured ? { ...node, measured: was.measured } : node;
      });
    });
  }, [nodes]);
  const onNodesChange = useCallback((changes) => setFlowNodes((current) => applyNodeChanges(changes, current)), []);
  // Where a box was left: kept once the drag ends (in this browser).
  const onNodeDragStop = useCallback((event, node, dragged) => {
    const places = (dragged && dragged.length ? dragged : [node]).filter((one) => one.type === 'entity');
    setMoved((before) => {
      const next = { ...before, ...Object.fromEntries(places.map((one) => [one.id, one.position])) };
      writePlaces(next);
      return next;
    });
  }, []);
  const putBack = () => {
    setMoved({});
    writePlaces({});
  };
  const labels = useMemo(
    () => ({
      'controls.ariaLabel': t('Graph controls'),
      'controls.zoomIn.ariaLabel': t('Zoom in'),
      'controls.zoomOut.ariaLabel': t('Zoom out'),
      'controls.fitView.ariaLabel': t('Fit the graph'),
      'minimap.ariaLabel': t('Overview of the graph'),
    }),
    []
  );

  if (error && !data) return <Failure error={error} retry={reload} />;
  if (!data) return <Loading />;
  const chosen = models.find((model) => model.name === selected) || null;
  const apps = design ? design.apps.map((item) => item.app) : [];
  const relations = edges.length;

  return (
    <>
      <PageHead
        title={t('Data model')}
        sub={`${tn(models.length, '{count} model', '{count} models')} · ${tn(relations, '{count} relation', '{count} relations')}`}
        actions={
          <>
            <input
              className="input erd-search"
              type="search"
              value={search}
              placeholder={t('Find a model or a field')}
              aria-label={t('Find a model or a field')}
              onChange={(event) => setSearch(event.target.value)}
            />
            {designing && apps.length > 1 ? (
              <Dropdown
                label={t('The app of the new model')}
                button={({ open, toggle }) => (
                  <Button icon="plus" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
                    {t('New model')}
                  </Button>
                )}
              >
                {(close) =>
                  apps.map((app) => (
                    <button
                      key={app}
                      type="button"
                      role="menuitem"
                      className="option"
                      onClick={() => {
                        close();
                        addModel(app);
                      }}
                    >
                      {t('In {app}', { app })}
                    </button>
                  ))
                }
              </Dropdown>
            ) : designing && apps.length === 1 ? (
              <Button icon="plus" onClick={() => addModel(apps[0])}>
                {t('New model')}
              </Button>
            ) : null}
            {designing && changed ? <Button onClick={discardDraft}>{t('Discard')}</Button> : null}
            {designing && changed ? (
              <Button variant="primary" onClick={() => setReview(requestOf(draft, base))}>
                {t('Review the changes')}
              </Button>
            ) : null}
            {design && !pending ? (
              <Button
                variant={editing ? '' : 'primary'}
                icon={editing ? 'eye' : 'edit'}
                aria-pressed={editing}
                onClick={() => setEditing(!editing)}
              >
                {editing ? t('Stop editing') : changed ? t('Edit (a draft is kept)') : t('Edit')}
              </Button>
            ) : null}
          </>
        }
      />
      {pending ? (
        <Alert tone="info">
          {design.pending.files
            ? t('Published: {files}. The server starts again with them (xufa dev does it); this page follows.', {
                files: design.pending.files.join(', '),
              })
            : t('Version {version} of the models is published. The servers start again with it; this page follows.', {
                version: design.pending.version,
              })}
        </Alert>
      ) : null}
      {designing ? (
        <p className="muted design-hint">
          {t(
            'The models of models.yaml are edited here; those of code have a lock. Draw a line from a model to another for a foreign key.'
          )}
        </p>
      ) : null}
      <div className={`erd ${chosen ? 'with-panel' : ''}`}>
        <section className="card graph erd-graph" aria-label={t('Diagram of the models')}>
          <ReactFlow
            nodes={flowNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => setSelected(null)}
            nodesDraggable
            nodesConnectable={designing}
            onConnect={onConnect}
            edgesFocusable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
            ariaLabelConfig={labels}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="var(--line)" />
            <Controls showInteractive={false}>
              {Object.keys(moved).length ? (
                <ControlButton onClick={putBack} title={t('Put the boxes back')} aria-label={t('Put the boxes back')}>
                  <Icon name="refresh" />
                </ControlButton>
              ) : null}
            </Controls>
            {models.length > 8 ? <MiniMap pannable zoomable nodeStrokeWidth={2} /> : null}
          </ReactFlow>
        </section>
        {chosen && designing && chosen.editable ? (
          <ModelEditor
            key={chosen.name}
            model={chosen}
            draft={draft}
            change={setDraft}
            onRenamed={setSelected}
            onDeleted={() => setSelected(null)}
            onClose={() => setSelected(null)}
          />
        ) : chosen ? (
          <ModelPanel model={chosen} locked={designing} onClose={() => setSelected(null)} />
        ) : null}
      </div>
      {review ? (
        <Review
          request={review}
          store={design ? design.store : 'files'}
          onClose={() => setReview(null)}
          onPublished={() => {
            setReview(null);
            setEditing(false);
            discard();
            reload({ quiet: true });
          }}
        />
      ) : null}
    </>
  );
}
