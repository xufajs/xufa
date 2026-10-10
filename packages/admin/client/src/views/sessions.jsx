// The sessions of the user logged in (each a browser: its device, address, since and last seen), each ended by a button;
// and, for those who may (_sessions.view), those of another user by its id.
import { useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, useApi } from '../api.js';
import { navigate } from '../router.js';
import { Icon } from '../icons.jsx';
import { Badge, Button, Card, Empty, Failure, PageHead, Spinner } from '../ui.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { ago, when } from '../format.js';
import { t } from '../i18n.js';

// A user agent in words: Chrome on Windows, Safari on iPhone.
export function deviceOf(agent) {
  if (!agent) return t('Unknown device');
  const browsers = [
    [/Edg\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/Firefox\//, 'Firefox'],
    [/Chrome\//, 'Chrome'],
    [/Safari\//, 'Safari'],
    [/curl\//, 'curl'],
  ];
  const systems = [
    [/iPhone/, 'iPhone'],
    [/iPad/, 'iPad'],
    [/Android/, 'Android'],
    [/Windows/, 'Windows'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/Linux/, 'Linux'],
  ];
  const browser = (browsers.find(([pattern]) => pattern.test(agent)) || [null, null])[1];
  const system = (systems.find(([pattern]) => pattern.test(agent)) || [null, null])[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser || system || agent.slice(0, 40);
}

function SessionTable({ data, onEnd, ending, canEnd }) {
  if (!data.results.length) {
    return <Empty icon="devices" title={t('No sessions')} />;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Device')}</th>
            <th>{t('Address')}</th>
            <th>{t('Since')}</th>
            <th>{t('Last seen')}</th>
            <th aria-label={t('Actions')} />
          </tr>
        </thead>
        <tbody>
          {data.results.map((item) => (
            <tr key={item.handle} className={item.current ? 'checked' : ''}>
              <td className="primary-cell" title={item.agent || ''}>
                <Icon name="devices" /> {deviceOf(item.agent)}{' '}
                {item.current ? <Badge tone="success">{t('This browser')}</Badge> : null}
              </td>
              <td className="mono">{item.ip || '—'}</td>
              <td title={when(item.since)}>{ago(item.since)}</td>
              <td title={when(item.seen)}>{ago(item.seen)}</td>
              <td style={{ textAlign: 'right' }}>
                {!item.current && canEnd ? (
                  <Button size="sm" variant="danger" busy={ending === item.handle} onClick={() => onEnd(item)}>
                    {t('End')}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sessions({ query }) {
  const { meta } = useAdmin();
  const confirm = useConfirm();
  const toast = useToast();
  const other = meta.sessions && meta.sessions.others && query.user ? String(query.user) : null;
  const path = other ? `_sessions/${encodeURIComponent(other)}` : '_account/sessions';
  const { data, error, reload } = useApi(path);
  const [ending, setEnding] = useState(null);
  const [lookup, setLookup] = useState(other || '');
  const canEnd = !other || meta.sessions.end;

  const end = async (item) => {
    const yes = await confirm({
      title: t('End the session of {device}?', { device: deviceOf(item.agent) }),
      message: t('That browser is logged out at its next request.'),
      confirm: t('End it'),
    });
    if (!yes) return;
    setEnding(item.handle);
    try {
      await api(`${path}/${encodeURIComponent(item.handle)}/end`, { method: 'POST', body: {} });
      toast(t('Session ended'));
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setEnding(null);
    }
    reload();
  };

  const endAll = async () => {
    const yes = await confirm({
      title: t('End every session of the user {user}?', { user: other }),
      message: t('Every browser of the user is logged out at its next request.'),
      confirm: t('End them all'),
    });
    if (!yes) return;
    try {
      await api(`${path}/end`, { method: 'POST', body: {} });
      toast(t('Every session ended'));
    } catch (err) {
      toast(err.message, 'danger');
    }
    reload();
  };

  if (!meta.sessions) return <Failure error={{ status: 404, message: t('There are no sessions here.') }} />;
  return (
    <>
      <PageHead
        title={other ? t('Sessions of the user {user}', { user: other }) : t('Your sessions')}
        sub={other ? t('Each a browser the user is logged in') : t('Each a browser you are logged in')}
        actions={
          other && canEnd && data && data.results.length ? (
            <Button variant="danger" icon="logout" onClick={endAll}>
              {t('End them all')}
            </Button>
          ) : null
        }
      />
      {meta.sessions.others ? (
        <form
          className="toolbar"
          style={{ marginBottom: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            navigate(['_sessions'], lookup.trim() ? { user: lookup.trim() } : {});
          }}
        >
          <input
            className="input"
            aria-label={t('The id of a user')}
            placeholder={t('The id of a user (empty: yours)')}
            value={lookup}
            onChange={(event) => setLookup(event.target.value)}
          />
          <Button type="submit" icon="search">
            {t('Show')}
          </Button>
        </form>
      ) : null}
      <Card bodyless>
        {error ? (
          <Failure error={error} retry={reload} />
        ) : !data ? (
          <div className="card-body">
            <Spinner small />
          </div>
        ) : (
          <SessionTable data={data} onEnd={end} ending={ending} canEnd={canEnd} />
        )}
      </Card>
    </>
  );
}
