// The first page: the models with their counts, the jobs and runs by status, and the health of the app.
import { RecentActions } from './history.jsx';
import { useAdmin } from '../app.jsx';
import { useApi } from '../api.js';
import { href } from '../router.js';
import { Icon } from '../icons.jsx';
import { Badge, Card, PageHead, Spinner } from '../ui.jsx';
import { count, toneOf, statusLabel } from '../format.js';
import { t, tn, tj } from '../i18n.js';

// A wait in words: 45 s, 3 min, 2 h 5 min.
function waitOf(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// What waits in the queue: the jobs due now and the wait of the oldest (late after 5 minutes), those scheduled later.
function QueueWait({ due }) {
  return (
    <div className="queue-wait">
      <span className={due.late ? 'late' : ''}>
        {due.now ? (
          <>
            {tj('{count} due now, the oldest waiting {wait}', {
              count: <strong>{count(due.now)}</strong>,
              wait: <strong>{waitOf(due.wait)}</strong>,
            })}
          </>
        ) : (
          t('Nothing waits')
        )}
      </span>
      {due.later ? (
        <span className="muted">
          {' · '}
          {t('{count} scheduled later', { count: count(due.later) })}
        </span>
      ) : null}
      <span className="muted">
        {' · '}
        {due.workers ? tn(due.workers, '{count} worker here', '{count} workers here') : t('no workers here')}
      </span>
    </div>
  );
}

const TONE_COLORS = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  '': 'var(--line-strong)',
};

// The counts of some statuses as a bar and a legend, each a link to the list of that status.
function StatusMeter({ counts, order, link }) {
  const total = order.reduce((sum, status) => sum + (counts[status] || 0), 0);
  return (
    <>
      <div
        className="meter"
        role="img"
        aria-label={order.map((status) => `${statusLabel(status)} ${counts[status] || 0}`).join(', ')}
      >
        {total
          ? order.map((status) =>
              counts[status] ? (
                <span
                  key={status}
                  style={{ width: `${(counts[status] / total) * 100}%`, background: TONE_COLORS[toneOf(status)] }}
                />
              ) : null
            )
          : null}
      </div>
      <div className="legend">
        {order.map((status) => (
          <a key={status} href={link(status)}>
            <span className={`dot ${toneOf(status) ? `tone-${toneOf(status)}` : ''}`} />
            {statusLabel(status)} <strong>{count(counts[status])}</strong>
          </a>
        ))}
      </div>
    </>
  );
}

function SystemCard({ title, icon, path, order, to }) {
  const { data, error } = useApi(path);
  const total = data ? order.reduce((sum, status) => sum + (data.counts[status] || 0), 0) : 0;
  return (
    <Card
      title={
        <h2>
          <Icon name={icon} /> {title}
        </h2>
      }
      actions={
        <a className="btn sm ghost" href={to}>
          {t('View all')} <Icon name="chevronRight" />
        </a>
      }
    >
      {error ? (
        <span className="muted">{error.message}</span>
      ) : !data ? (
        <Spinner small />
      ) : (
        <div className="stack">
          <div className="stat" style={{ padding: 0 }}>
            <div className="value">{count(total)}</div>
          </div>
          <StatusMeter counts={data.counts} order={order} link={(status) => `${to}?status=${status}`} />
          {data.due ? <QueueWait due={data.due} /> : null}
        </div>
      )}
    </Card>
  );
}

function HealthCard() {
  const { data, error, loading, reload } = useApi('_health');
  const checks = data ? Object.entries(data.checks || {}) : [];
  return (
    <Card
      title={
        <h2>
          <Icon name="health" /> {t('Health')} {data ? <Badge status={data.status} /> : null}
        </h2>
      }
      actions={
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => reload()}
          disabled={loading}
          aria-label={t('Check again')}
        >
          {loading ? <span className="spinner sm" /> : <Icon name="refresh" />}
        </button>
      }
      bodyless
    >
      {error ? (
        <div className="card-body muted">{error.message}</div>
      ) : !data ? (
        <div className="card-body">
          <Spinner small />
        </div>
      ) : (
        <>
          <div className="card-body muted" style={{ paddingBottom: checks.length ? 8 : 18 }}>
            {t('Up for {minutes} min', { minutes: Math.round((data.uptime || 0) / 60) })}
          </div>
          {checks.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Check')}</th>
                    <th>{t('Status')}</th>
                    <th className="num">{t('Took')}</th>
                    <th>{t('Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map(([name, check]) => (
                    <tr key={name}>
                      <td className="primary-cell">
                        {name}
                        {check.critical === false ? <span className="muted"> · {t('not critical')}</span> : null}
                      </td>
                      <td>
                        <Badge status={check.status} />
                      </td>
                      <td className="num muted">{check.duration} ms</td>
                      <td className="muted" title={check.error || JSON.stringify(check.details)}>
                        {check.error || (check.details === undefined ? '' : JSON.stringify(check.details))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function Dashboard() {
  const { meta } = useAdmin();
  const tenant = meta.tenants && meta.tenants.find((entry) => entry.id === meta.tenant);
  const system = meta.jobs || meta.runs || meta.health;
  return (
    <>
      <PageHead title={t('Dashboard')} sub={t('Everything in {name}', { name: tenant ? tenant.label : meta.title })} />
      {meta.models.length ? (
        <div className="grid cards">
          {meta.models.map((model) => (
            <a key={model.name} className="card stat" href={href([model.name])}>
              <div className="top">
                <span className="tile">{model.label.charAt(0).toUpperCase()}</span>
                {model.can && model.can.add ? (
                  <span
                    className="btn sm ghost"
                    role="link"
                    tabIndex={0}
                    aria-label={`Add ${model.singular}`}
                    onClick={(event) => {
                      event.preventDefault();
                      window.location.hash = href([model.name, 'new']);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        window.location.hash = href([model.name, 'new']);
                      }
                    }}
                  >
                    <Icon name="plus" /> {t('Add')}
                  </span>
                ) : null}
              </div>
              <div>
                <div className="value">{count(model.count)}</div>
                <div className="label">{model.label}</div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Card>
          <span className="muted">{t('There are no models for you here.')}</span>
        </Card>
      )}
      {meta.models.some((model) => model.history) ? (
        <div style={{ marginTop: 16 }}>
          <RecentActions />
        </div>
      ) : null}
      {system ? (
        <>
          <h2 className="section-title">{t('System')}</h2>
          <div className="grid two">
            {meta.jobs ? (
              <SystemCard
                title={t('Jobs')}
                icon="jobs"
                path="_jobs"
                order={['pending', 'running', 'done', 'failed']}
                to="#/_jobs"
              />
            ) : null}
            {meta.runs ? (
              <SystemCard
                title={t('Pipeline runs')}
                icon="runs"
                path="_runs"
                order={['running', 'done', 'failed', 'cancelled']}
                to="#/_runs"
              />
            ) : null}
          </div>
          {meta.health ? (
            <div style={{ marginTop: 16 }}>
              <HealthCard />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
