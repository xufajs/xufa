// The work of the app in one list: its jobs and the runs of its pipelines, newest first, by status, read again while
// live; and the switch between this list, the jobs and the runs.
import { useState } from 'react';
import { useAdmin } from '../app.jsx';
import { useApi, useInterval } from '../api.js';
import { href, navigate } from '../router.js';
import { Icon } from '../icons.jsx';
import { Badge, Button, Empty, Failure, PageHead, Switch, Tabs } from '../ui.jsx';
import { Paginator, SkeletonRows } from '../lists.jsx';
import { ago, count, duration, LIVE, when } from '../format.js';
import { t } from '../i18n.js';

const STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled'];

// A run whose first steps start later (start() with delay or at).
export const scheduled = (run) => run.status === 'running' && run.runAt && new Date(run.runAt).getTime() > Date.now();

export function RunStatus({ run }) {
  if (scheduled(run)) {
    return (
      <span title={t('Starts {when}', { when: when(run.runAt) })}>
        <Badge tone="accent">scheduled</Badge>
      </span>
    );
  }
  return <Badge status={run.status} live={run.status === 'running'} />;
}

// All the work, the jobs, the runs: those the user may see.
export function WorkSwitch({ current }) {
  const { meta } = useAdmin();
  const kinds = [
    ['_work', t('All work'), 'dashboard'],
    meta.jobs ? ['_jobs', t('Jobs'), 'jobs'] : null,
    meta.runs ? ['_runs', t('Pipeline runs'), 'runs'] : null,
    meta.schedules ? ['_schedules', t('Schedules'), 'clock'] : null,
  ].filter(Boolean);
  if (kinds.length < 2) return null;
  return (
    <nav className="segmented" aria-label={t('Kind of work')}>
      {kinds.map(([to, label, icon]) => (
        <a
          key={to}
          href={`#/${to}`}
          className={current === to ? 'on' : ''}
          aria-current={current === to ? 'page' : undefined}
        >
          <Icon name={icon} />
          {label}
        </a>
      ))}
    </nav>
  );
}

function Due({ item }) {
  if (item.kind === 'job') {
    const at = item.status === 'pending' ? item.runAt : item.finishedAt;
    return at ? (
      <span title={when(at)}>
        {item.status === 'pending' ? t('runs {when}', { when: ago(at) }) : t('ended {when}', { when: ago(at) })}
      </span>
    ) : (
      '—'
    );
  }
  if (scheduled(item)) return <span title={when(item.runAt)}>starts {ago(item.runAt)}</span>;
  return item.finishedAt ? t('took {duration}', { duration: duration(item.createdAt, item.finishedAt) }) : '—';
}

export function Work({ query }) {
  const { meta } = useAdmin();
  const [live, setLive] = useState(true);
  const status = STATUSES.includes(query.status) ? query.status : '';
  const params = new URLSearchParams({ page: query.page || '1' });
  if (status) params.set('status', status);
  const { data, error, reload } = useApi(`_work?${params.toString()}`);
  useInterval(() => reload({ quiet: true }), 4000, live);

  const setQuery = (changes, keepPage = false) => {
    const next = { ...query, ...changes };
    if (!keepPage) delete next.page;
    navigate(['_work'], next, { replace: true });
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  const total = data ? Object.values(data.counts).reduce((sum, n) => sum + n, 0) : 0;
  const shown = data
    ? STATUSES.filter((name) => (name !== 'pending' || data.kinds.jobs) && (name !== 'cancelled' || data.kinds.runs))
    : STATUSES;

  return (
    <>
      <WorkSwitch current="_work" />
      <PageHead
        title={t('Work')}
        sub={t('The jobs of the queue and the runs of the pipelines, newest first')}
        actions={
          <>
            <Switch checked={live} onChange={setLive} label={t('Live')} />
            {meta.actions.runs.change ? (
              <Button variant="primary" icon="play" onClick={() => navigate(['_runs', 'new'], {})}>
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
            ...shown.map((name) => ({
              value: name,
              label: name.charAt(0).toUpperCase() + name.slice(1),
              count: data ? count(data.counts[name]) : undefined,
            })),
          ]}
        />
        {data && !data.results.length ? (
          <Empty title={t('No work here')}>{status ? t('Nothing with this status.') : t('Nothing has run yet.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Kind')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Created')}</th>
                  <th>{t('When')}</th>
                  <th>{t('Error')}</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={6} />
                ) : (
                  data.results.map((item) => {
                    const to = href([item.kind === 'job' ? '_jobs' : '_runs', item.id]);
                    return (
                      <tr key={`${item.kind}-${item.id}`} className="link" onClick={() => (window.location.hash = to)}>
                        <td className="nowrap">
                          <a href={to} className="kind">
                            <Icon name={item.kind === 'job' ? 'jobs' : 'runs'} />
                            {item.kind === 'job' ? t('Job') : t('Run')} <span className="mono">#{item.id}</span>
                          </a>
                        </td>
                        <td className="primary-cell">{item.title}</td>
                        <td>
                          {item.kind === 'run' ? (
                            <RunStatus run={item} />
                          ) : (
                            <Badge status={item.status} live={LIVE.has(item.status) && item.status !== 'pending'} />
                          )}
                        </td>
                        <td title={when(item.createdAt)}>{ago(item.createdAt)}</td>
                        <td>
                          <Due item={item} />
                        </td>
                        <td className="error-cell" title={item.error || ''}>
                          {item.error || ''}
                        </td>
                      </tr>
                    );
                  })
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
