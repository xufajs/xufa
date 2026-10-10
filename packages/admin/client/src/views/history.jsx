// What happened to objects, from the audit log of their database: the history of an object (Django's History of the
// admin) and the recent actions of the dashboard. Each entry: when, who (and through what), the action, and the
// fields that changed, from what to what.
import { useAdmin } from '../app.jsx';
import { useApi } from '../api.js';
import { href } from '../router.js';
import { Badge, Card, Spinner } from '../ui.jsx';
import { humanize, when } from '../format.js';
import { t } from '../i18n.js';

const TONES = { create: 'success', update: 'info', upsert: 'info', delete: 'danger' };
const VERBS = { create: t('Added'), update: t('Changed'), upsert: t('Saved'), delete: t('Deleted') };

function shown(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Changes({ changes }) {
  if (!changes.length) return null;
  return (
    <ul className="changes">
      {changes.map((change, index) => (
        <li key={`${change.field}-${change.path || ''}-${index}`}>
          <span className="field-name">
            {change.label || humanize(change.field)}
            {change.path ? `.${change.path}` : ''}
          </span>{' '}
          {change.redacted ? (
            <span className="muted">changed (not shown)</span>
          ) : (
            <>
              <span className="from">{shown(change.from)}</span> → <span className="to">{shown(change.to)}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Who({ entry }) {
  return (
    <span className="muted">
      {entry.actor
        ? t('by {actor}', { actor: entry.actor })
        : entry.via === 'admin'
          ? t('in the admin')
          : t('by the app')}
      {entry.via && entry.via !== 'admin' ? ` (${entry.via})` : ''}
    </span>
  );
}

// The history of an object, in its page.
export function HistoryCard({ model, pk }) {
  const { data, error } = useApi(`${encodeURIComponent(model.name)}/${encodeURIComponent(pk)}/history`);
  return (
    <Card title={<h2>{t('History')}</h2>} bodyless>
      {error ? (
        <div className="card-body muted">{error.message}</div>
      ) : !data ? (
        <div className="card-body">
          <Spinner small />
        </div>
      ) : !data.results.length ? (
        <div className="card-body muted">{t('No changes recorded.')}</div>
      ) : (
        <ol className="history">
          {data.results.map((entry) => (
            <li key={entry.id}>
              <div className="history-head">
                <Badge tone={TONES[entry.action] || ''}>{VERBS[entry.action] || humanize(entry.action)}</Badge>
                <span title={String(entry.at)}>{when(entry.at)}</span> <Who entry={entry} />
              </div>
              <Changes changes={entry.action === 'create' ? [] : entry.changes} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// The recent actions, in the dashboard.
export function RecentActions() {
  const { meta } = useAdmin();
  const { data, error } = useApi('_activity?size=10');
  const labelOf = (name) => {
    const model = meta.models.find((entry) => entry.name === name);
    return model ? model.singular.charAt(0).toUpperCase() + model.singular.slice(1) : name;
  };
  return (
    <Card title={<h2>{t('Recent actions')}</h2>} bodyless>
      {error ? (
        <div className="card-body muted">{error.message}</div>
      ) : !data ? (
        <div className="card-body">
          <Spinner small />
        </div>
      ) : !data.results.length ? (
        <div className="card-body muted">{t('Nothing yet.')}</div>
      ) : (
        <ol className="history">
          {data.results.map((entry) => (
            <li key={entry.id}>
              <div className="history-head">
                <Badge tone={TONES[entry.action] || ''}>{VERBS[entry.action] || humanize(entry.action)}</Badge>
                <span>
                  {labelOf(entry.model)}{' '}
                  {entry.label ? (
                    <a href={href([entry.model, entry.key])}>{entry.label}</a>
                  ) : (
                    <span className="muted">#{entry.key}</span>
                  )}
                </span>
                <span className="muted" title={String(entry.at)}>
                  {when(entry.at)}
                </span>{' '}
                <Who entry={entry} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
