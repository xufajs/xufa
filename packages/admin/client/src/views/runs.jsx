// The runs of pipelines: by status and pipeline, newest first, read again while live; and each run with the graph of
// its steps (colored by status; a click shows a step), the step chosen with its output and its resume, its input and
// result, retry and cancel, and the runs it started or was started by.
import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  BaseEdge,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAdmin, useLeaf } from '../app.jsx';
import { api, useApi, useInterval } from '../api.js';
import { href, navigate } from '../router.js';
import { Icon } from '../icons.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Facts,
  Failure,
  Json,
  Loading,
  PageHead,
  Switch,
  Tabs,
} from '../ui.jsx';
import { FilterSelect, Paginator, SkeletonRows } from '../lists.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { RunStatus, scheduled, WorkSwitch } from './work.jsx';
import { ago, count, duration, when, statusLabel } from '../format.js';
import { t, tj, locale } from '../i18n.js';

const STATUSES = ['running', 'done', 'failed', 'cancelled'];

export function Runs({ query }) {
  const { meta } = useAdmin();
  const [live, setLive] = useState(true);
  const status = STATUSES.includes(query.status) ? query.status : '';
  const params = new URLSearchParams({ page: query.page || '1' });
  if (status) params.set('status', status);
  if (query.pipeline) params.set('pipeline', query.pipeline);
  if (query.trigger) params.set('trigger', query.trigger);
  const { data, error, reload } = useApi(`_runs?${params.toString()}`);
  useInterval(() => reload({ quiet: true }), 4000, live);

  const setQuery = (changes, keepPage = false) => {
    const next = { ...query, ...changes };
    if (!keepPage) delete next.page;
    navigate(['_runs'], next, { replace: true });
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  const total = data ? STATUSES.reduce((sum, name) => sum + (data.counts[name] || 0), 0) : 0;

  return (
    <>
      <WorkSwitch current="_runs" />
      <PageHead
        title={t('Pipeline runs')}
        sub={t('Each run of a pipeline, newest first')}
        actions={
          <>
            <Switch checked={live} onChange={setLive} label={t('Live')} />
            {meta.actions.runs.change ? (
              <Button
                variant="primary"
                icon="play"
                onClick={() => navigate(['_runs', 'new'], query.pipeline ? { pipeline: query.pipeline } : {})}
              >
                {t('Start a run')}
              </Button>
            ) : null}
          </>
        }
      />
      <section className="card">
        <Tabs
          label={t('Status')}
          value={status}
          onChange={(value) => setQuery({ status: value })}
          tabs={[
            { value: '', label: t('All'), count: data ? count(total) : undefined },
            ...STATUSES.map((name) => ({
              value: name,
              label: name.charAt(0).toUpperCase() + name.slice(1),
              count: data ? count(data.counts[name]) : undefined,
            })),
          ]}
        />
        <div className="toolbar">
          <FilterSelect
            label={t('Pipeline')}
            value={query.pipeline}
            options={data ? data.pipelines.map((name) => [name, name]) : []}
            onChange={(value) => setQuery({ pipeline: value })}
          />
          {query.trigger ? (
            <span className="filter-chip">
              {query.trigger.startsWith('schedule:')
                ? tj('Started by the schedule {name}', {
                    name: <strong>{query.trigger.replace(/^schedule:/, '')}</strong>,
                  })
                : tj('Started on {name}', { name: <strong>{query.trigger}</strong> })}
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('All the runs')}
                onClick={() => setQuery({ trigger: undefined })}
              >
                ×
              </Button>
            </span>
          ) : null}
        </div>
        {data && !data.results.length ? (
          <Empty title={t('No runs here')}>
            {status || query.pipeline || query.trigger ? t('None with these filters.') : t('No pipeline has run yet.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Run')}</th>
                  <th>{t('Pipeline')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Started')}</th>
                  <th className="num">{t('Took')}</th>
                  <th>{t('Error')}</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={6} />
                ) : (
                  data.results.map((run) => (
                    <tr key={run.id} className="link" onClick={() => (window.location.hash = href(['_runs', run.id]))}>
                      <td className="mono">
                        <a href={href(['_runs', run.id])}>#{run.id}</a>
                      </td>
                      <td className="primary-cell">{run.pipeline}</td>
                      <td>
                        <RunStatus run={run} />
                      </td>
                      <td title={when(run.createdAt)}>{ago(run.createdAt)}</td>
                      <td className="num">{run.finishedAt ? duration(run.createdAt, run.finishedAt) : '—'}</td>
                      <td className="error-cell" title={run.error || ''}>
                        {run.error || ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.count ? (
          <Paginator count={data.count} page={data.page} size={data.size} onPage={(page) => setQuery({ page }, true)} />
        ) : null}
      </section>
    </>
  );
}

const W = 184;
const H = 58;
const GX = 64;
const GY = 18;

// A step of the graph: its id, and in a run its status (with the steps of the run it started, its attempts and until
// when it waits) and a bar of how far that run is; in a pipeline not started, its block. A click or Enter chooses it.
function StepNode({ data }) {
  const { step, row, selected, onSelect } = data;
  const child = row && row.childProgress;
  const second = !row
    ? step.block
    : statusLabel(row.status) +
      (child ? ` · ${t('{done}/{total} steps', { done: child.done, total: child.total })}` : '') +
      (row.attempts > 1 ? ` · ${t('{count} attempts', { count: row.attempts })}` : '') +
      (row.pausedUntil
        ? ` · ${t('until {time}', { time: new Date(row.pausedUntil).toLocaleTimeString(locale) })}`
        : '');
  const label = row ? `${step.id}: ${row.status}` : `${step.id}: ${step.block}`;
  const tip =
    label +
    (step.when ? `\n${t('When')}: ${step.when}` : '') +
    (step.waitTimeout != null ? `\n${t('Waits at most')}: ${waitOf(step.waitTimeout)}` : '');
  const choose = onSelect
    ? {
        tabIndex: 0,
        role: 'button',
        'aria-pressed': selected,
        onClick: () => onSelect(step.id),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(step.id);
          }
        },
      }
    : {};
  return (
    <div
      className={`node ${row ? `s-${row.status}` : 'definition'} ${selected ? 'selected' : ''}`}
      aria-label={label}
      title={tip}
      {...choose}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="bar" />
      <span className="name">{step.id}</span>
      <span className="status">{second}</span>
      {child && child.total ? (
        <span
          className={`progress c-${child.status}`}
          title={t('The run #{run}: {status}, {done} of {total} steps', {
            run: row.child,
            status: t(child.status),
            done: child.done,
            total: child.total,
          })}
        >
          <span className="fill" style={{ width: `${(100 * Math.min(child.done, child.total)) / child.total}%` }} />
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

// An arrow: curves between columns, straight through the places of its points (the columns a long one crosses).
function RouteEdge({ sourceX, sourceY, targetX, targetY, data, markerEnd, style }) {
  let x = sourceX;
  let y = sourceY;
  let d = `M${x},${y}`;
  const curve = (x2, y2) => {
    const mx = (x + x2) / 2;
    d += ` C${mx},${y} ${mx},${y2} ${x2},${y2}`;
  };
  for (const point of data.points) {
    curve(point.x, point.y);
    d += ` L${point.x + W},${point.y}`;
    x = point.x + W;
    y = point.y;
  }
  curve(targetX, targetY);
  return <BaseEdge path={d} markerEnd={markerEnd} style={style} />;
}

const nodeTypes = { step: StepNode };
const edgeTypes = { route: RouteEdge };

// Puts the steps moved by hand back where the server lays them out, and the graph in view.
function PutBack({ onClick }) {
  const flow = useReactFlow();
  return (
    <ControlButton
      onClick={() => {
        onClick();
        requestAnimationFrame(() => flow.fitView({ padding: 0.12, maxZoom: 1, duration: 200 }));
      }}
      title={t('Put the steps back')}
      aria-label={t('Put the steps back')}
    >
      <Icon name="refresh" />
    </ControlButton>
  );
}

// The graph of a run (or of a pipeline, without steps: its definition), as the server lays it out: its steps in columns
// by depth, in the order that crosses the fewest arrows (graph.steps[].at), with arrows from each step to those after
// it (long ones through their points). A step that runs another pipeline shows how far that run is. It pans and zooms
// (React Flow), and its steps may be moved by hand while it is shown (an arrow of a moved step goes straight).
export function Graph({ graph, steps, selected, onSelect, label }) {
  const [moved, setMoved] = useState({});
  const { nodes, edges, height } = useMemo(() => {
    const ids = new Set(graph.steps.map((step) => step.id));
    const nodes = graph.steps.map((step, index) => {
      // A run kept before the layout: one column, in the order of the steps.
      const place = step.at || { column: 0, row: index };
      return {
        id: step.id,
        type: 'step',
        position: moved[step.id] || { x: place.column * (W + GX), y: place.row * (H + GY) },
        width: W,
        height: H,
        data: {
          step,
          row: steps ? steps[step.id] || { status: 'waiting', attempts: 0 } : null,
          selected: selected === step.id,
          onSelect,
        },
      };
    });
    const slot = (point) => ({ x: point.column * (W + GX), y: point.row * (H + GY) + H / 2 });
    const edges = (graph.edges || [])
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map((edge) => {
        const done = Boolean(steps) && (steps[edge.from] || {}).status === 'done';
        return {
          id: `${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          type: 'route',
          className: done ? 'done' : '',
          data: { points: moved[edge.from] || moved[edge.to] ? [] : (edge.points || []).map(slot) },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: done ? 'var(--success)' : 'var(--line-strong)',
          },
        };
      });
    const rows = graph.rows || graph.steps.length;
    // As tall as its rows, between a short graph and a page.
    const height = Math.min(560, Math.max(steps ? 220 : 160, rows * H + Math.max(0, rows - 1) * GY + 64));
    return { nodes, edges, height };
  }, [graph, steps, selected, onSelect, moved]);
  const onNodesChange = useCallback((changes) => {
    const places = changes.filter((change) => change.type === 'position' && change.position);
    if (places.length) {
      setMoved((before) => ({
        ...before,
        ...Object.fromEntries(places.map((change) => [change.id, change.position])),
      }));
    }
  }, []);
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

  return (
    <div className="graph" style={{ height }} role="group" aria-label={label}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodesDraggable
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        preventScrolling={false}
        zoomOnScroll={false}
        zoomOnPinch
        panOnScroll={false}
        ariaLabelConfig={labels}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="var(--line)" />
        <Controls showInteractive={false}>
          {Object.keys(moved).length ? <PutBack onClick={() => setMoved({})} /> : null}
        </Controls>
        {nodes.length > 8 ? <MiniMap pannable zoomable nodeStrokeWidth={2} /> : null}
      </ReactFlow>
    </div>
  );
}

// How long a step waits at most: as defined ('1h'), or milliseconds.
const waitOf = (value) => (typeof value === 'number' ? `${count(value)} ms` : String(value));

// What the definition of a step says: its block, the steps it comes after, its condition, how long it waits at most,
// and whether its output is the result of the run.
export function definitionFacts(definition) {
  return [
    [t('Block'), definition.block || '—'],
    [t('After'), (definition.after || []).join(', ') || '—'],
    definition.when ? [t('When'), <code key="when">{definition.when}</code>] : null,
    definition.waitTimeout != null ? [t('Waits at most'), waitOf(definition.waitTimeout)] : null,
    definition.result ? [t('Result'), t('Its output is the result of the run')] : null,
  ];
}

function StepPanel({ run, stepId, onAct, canChange, busy }) {
  const [output, setOutput] = useState('');
  const [problem, setProblem] = useState(null);
  const step = run.steps[stepId] || {};
  const definition = run.graph.steps.find((item) => item.id === stepId) || {};
  const status = step.status || 'waiting';
  const resumable = status === 'paused' && run.status === 'running' && canChange;

  return (
    <Card
      title={
        <h2>
          {stepId} <Badge status={status} live={status === 'running'} />
        </h2>
      }
    >
      <div className="stack">
        <Facts
          items={[
            ...definitionFacts(definition),
            step.child
              ? [
                  t('Runs'),
                  <a key="child" href={href(['_runs', step.child])}>
                    the run #{step.child}
                  </a>,
                ]
              : null,
            [t('Attempts'), String(step.attempts || 0)],
            [t('Started'), step.startedAt ? <span title={when(step.startedAt)}>{ago(step.startedAt)}</span> : '—'],
            [t('Took'), duration(step.startedAt, step.finishedAt)],
            step.pausedUntil ? [t('Waits until'), when(step.pausedUntil)] : null,
          ]}
        />
        {step.error ? <ErrorText text={step.error} /> : null}
        <div>
          <div className="field">
            <span className="label">{t('Output')}</span>
          </div>
          <Json value={step.output} label={t('Output of the step')} />
        </div>
        {resumable ? (
          <form
            className={`field ${problem ? 'invalid' : ''}`}
            onSubmit={(event) => {
              event.preventDefault();
              let value = null;
              try {
                value = output.trim() === '' ? null : JSON.parse(output);
              } catch (err) {
                setProblem(t('Not JSON: {message}', { message: err.message }));
                return;
              }
              setProblem(null);
              onAct(`steps/${encodeURIComponent(stepId)}/resume`, { output: value }, t('Resumed'));
            }}
          >
            <label htmlFor="resume-output">{t('Resume with an output')}</label>
            <textarea
              id="resume-output"
              className="textarea code"
              placeholder='{ "approved": true }   (empty: null)'
              spellCheck={false}
              value={output}
              onChange={(event) => setOutput(event.target.value)}
            />
            {problem ? <div className="error">{problem}</div> : null}
            <div className="actions" style={{ marginTop: 10 }}>
              <Button type="submit" variant="primary" icon="play" busy={busy === 'resume'}>
                {t('Resume {step}', { step: stepId })}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

const ACTIVE = new Set(['paused', 'failed', 'running', 'retrying']);

// What started a run: a schedule (pipelines.schedule()), or an event (pipelines.trigger()).
function Trigger({ run }) {
  const { meta } = useAdmin();
  if (!run.trigger) return null;
  const schedule = run.trigger.startsWith('schedule:') ? run.trigger.slice('schedule:'.length) : null;
  if (!schedule) return <> · on the event {run.trigger}</>;
  return (
    <>
      {' · by the schedule '}
      {meta.schedules ? <a href={href(['_schedules'])}>{schedule}</a> : schedule}
    </>
  );
}

export function RunDetail({ id }) {
  const { meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(null);
  const { data: run, error, reload } = useApi(`_runs/${encodeURIComponent(id)}`);
  useInterval(() => reload({ quiet: true }), 3000, Boolean(run && run.status === 'running'));
  useLeaf(run ? `${run.pipeline} #${run.id}` : null);

  if (error && !run) return <Failure error={error} retry={reload} />;
  if (!run) return <Loading />;

  const ids = run.graph.steps.map((step) => step.id);
  // The step shown: the one chosen; else the first paused, failed or running; else the first.
  const selected =
    chosen && ids.includes(chosen)
      ? chosen
      : ids.find((stepId) => ACTIVE.has((run.steps[stepId] || {}).status)) || ids[0];
  const canChange = meta.actions.runs.change;

  const act = async (path, body, done) => {
    setBusy(path.split('/').pop());
    try {
      await api(`_runs/${encodeURIComponent(run.id)}/${path}`, { method: 'POST', body: body || {} });
      toast(done);
      reload({ quiet: true });
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title={
          <>
            {run.pipeline}{' '}
            <span className="muted mono" style={{ fontSize: 18 }}>
              #{run.id}
            </span>
          </>
        }
        badge={<RunStatus run={run} />}
        sub={
          <>
            {scheduled(run) ? `${t('Starts {when}', { when: `${ago(run.runAt)} (${when(run.runAt)})` })} · ` : ''}
            {scheduled(run)
              ? t('created {when}', { when: ago(run.createdAt) })
              : t('Started {when}', { when: ago(run.createdAt) })}
            {run.finishedAt ? ` · ${t('took {duration}', { duration: duration(run.createdAt, run.finishedAt) })}` : ''}
            {run.graph.concurrency
              ? ` · ${t('{running} of {concurrency} steps at once', { running: run.inFlight, concurrency: run.graph.concurrency })}`
              : ''}
            <Trigger run={run} />
          </>
        }
        actions={
          <>
            {(run.status === 'failed' || run.status === 'cancelled') && canChange ? (
              <Button
                variant="primary"
                icon="retry"
                busy={busy === 'retry'}
                onClick={() => act('retry', {}, t('Tried again'))}
              >
                {t('Retry')}
              </Button>
            ) : null}
            {run.status === 'running' && canChange ? (
              <Button
                variant="danger"
                icon="stop"
                busy={busy === 'cancel'}
                onClick={async () => {
                  const yes = await confirm({
                    title: t('Cancel the run #{id}?', { id: run.id }),
                    message: t('Its steps stop, and the runs it started are cancelled too.'),
                    confirm: t('Cancel the run'),
                    cancel: t('Keep it running'),
                  });
                  if (yes) act('cancel', {}, t('Cancelled'));
                }}
              >
                {t('Cancel')}
              </Button>
            ) : null}
          </>
        }
      />
      {run.error ? <Alert>{run.error}</Alert> : null}
      {run.parent ? (
        <Alert tone="info">
          {tj('Started by the step {step} of {run}.', {
            step: <strong>{run.parentStep}</strong>,
            run: <a href={href(['_runs', run.parent])}>{t('the run #{run}', { run: run.parent })}</a>,
          })}
        </Alert>
      ) : null}
      <div className="grid main-side">
        <div className="stack">
          <Card
            title={
              <h2>
                <Icon name="runs" /> {t('Steps')}
              </h2>
            }
            bodyless
          >
            <Graph
              key={run.id}
              graph={run.graph}
              steps={run.steps}
              selected={selected}
              onSelect={setChosen}
              label={t('The steps of the run')}
            />
          </Card>
          <div className="grid two">
            <Card title={t('Input')}>
              <Json value={run.input} label={t('Input')} />
            </Card>
            <Card title={t('Result')}>
              <Json value={run.result} label={t('Result')} />
            </Card>
          </div>
        </div>
        <StepPanel key={selected} run={run} stepId={selected} onAct={act} canChange={canChange} busy={busy} />
      </div>
    </>
  );
}
