// The jobs of the queue: by status (tabs with their counts), name and queue, newest first, read again while live; the
// failed ones tried again (one, or all); and each job with its payload, result and error.
import { useState } from 'react';
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
import { WorkSwitch } from './work.jsx';
import { ago, count, LIVE, when } from '../format.js';
import { t, tn, tj } from '../i18n.js';

const STATUSES = ['pending', 'running', 'done', 'failed'];

export function Jobs({ query }) {
  const { meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const [live, setLive] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const status = STATUSES.includes(query.status) ? query.status : '';
  const params = new URLSearchParams({ page: query.page || '1' });
  ['status', 'name', 'queue'].forEach((key) => {
    if (query[key]) params.set(key, query[key]);
  });
  if (query.pipelines) params.set('pipelines', '1');
  const { data, error, reload } = useApi(`_jobs?${params.toString()}`);
  useInterval(() => reload({ quiet: true }), 4000, live && !document.hidden);

  const setQuery = (changes, keepPage = false) => {
    const next = { ...query, ...changes };
    if (!keepPage) delete next.page;
    navigate(['_jobs'], next, { replace: true });
  };

  const retryAll = async () => {
    const what = query.name
      ? t('the failed {name} jobs', { name: query.name })
      : t('all {count} failed jobs', { count: data.retryable });
    const yes = await confirm({
      title: t('Retry {what}?', { what }),
      message: t('They run again as soon as a worker is free.'),
      confirm: t('Retry'),
      tone: 'accent',
      icon: 'retry',
    });
    if (!yes) return;
    setRetrying(true);
    try {
      const result = await api(`_jobs/retry${query.name ? `?name=${encodeURIComponent(query.name)}` : ''}`, {
        method: 'POST',
        body: {},
      });
      toast(tn(result.retried, '{count} job tried again', '{count} jobs tried again'));
      reload({ quiet: true });
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setRetrying(false);
    }
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  const total = data ? STATUSES.reduce((sum, name) => sum + (data.counts[name] || 0), 0) : 0;

  return (
    <>
      <WorkSwitch current="_jobs" />
      <PageHead
        title={t('Jobs')}
        sub={t('The work of the queue, newest first')}
        actions={
          <>
            <Switch checked={live} onChange={setLive} label={t('Live')} />
            {data && data.retryable && meta.actions.jobs.change ? (
              <Button variant="primary" icon="retry" busy={retrying} onClick={retryAll}>
                {query.name
                  ? t('Retry failed {name}', { name: query.name })
                  : t('Retry all failed ({count})', { count: count(data.retryable) })}
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
            label={t('Name')}
            value={query.name}
            options={data ? data.names.map((name) => [name, name]) : []}
            onChange={(value) => setQuery({ name: value })}
          />
          {data && data.queues.length > 1 ? (
            <FilterSelect
              label={t('Queue')}
              value={query.queue}
              options={data.queues.map((name) => [name, name])}
              onChange={(value) => setQuery({ queue: value })}
            />
          ) : null}
          {meta.runs ? (
            <Switch
              checked={Boolean(query.pipelines)}
              onChange={(on) => setQuery({ pipelines: on ? '1' : '', name: '' })}
              label={t('Jobs of pipelines')}
            />
          ) : null}
        </div>
        {data && !data.results.length ? (
          <Empty title={t('No jobs here')}>
            {status || query.name ? t('None with these filters.') : t('The queue has done nothing yet.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Job')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Status')}</th>
                  <th className="num">{t('Attempts')}</th>
                  <th>{t('Due / finished')}</th>
                  <th>{t('Error')}</th>
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={6} />
                ) : (
                  data.results.map((job) => {
                    const at = job.status === 'pending' ? job.runAt : job.finishedAt;
                    return (
                      <tr
                        key={job.id}
                        className="link"
                        onClick={() => (window.location.hash = href(['_jobs', job.id]))}
                      >
                        <td className="mono">
                          <a href={href(['_jobs', job.id])}>#{job.id}</a>
                        </td>
                        <td className="primary-cell">{job.name}</td>
                        <td>
                          <Badge status={job.status} live={LIVE.has(job.status) && job.status !== 'pending'} />
                        </td>
                        <td className="num">
                          {job.attempts} / {job.maxAttempts}
                        </td>
                        <td title={when(at)}>{at ? ago(at) : '—'}</td>
                        <td className="error-cell" title={job.error || ''}>
                          {job.error || ''}
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

export function JobDetail({ id }) {
  const { meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  const { data: job, error, reload } = useApi(`_jobs/${encodeURIComponent(id)}`);
  useInterval(() => reload({ quiet: true }), 3000, Boolean(job && LIVE.has(job.status)));
  useLeaf(job ? `${job.name} #${job.id}` : null);

  if (error && !job) return <Failure error={error} retry={reload} />;
  if (!job) return <Loading />;

  const retry = async () => {
    setBusy('retry');
    try {
      await api(`_jobs/${encodeURIComponent(job.id)}/retry`, { method: 'POST', body: {} });
      toast(t('Tried again'));
      reload({ quiet: true });
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    const pending = job.status === 'pending';
    const yes = await confirm({
      title: pending ? t('Cancel the job #{id}?', { id: job.id }) : t('Delete the job #{id}?', { id: job.id }),
      message: pending ? t('It will not run.') : t('Its record is deleted.'),
      confirm: pending ? t('Cancel the job') : t('Delete'),
      cancel: t('Keep it'),
    });
    if (!yes) return;
    setBusy('delete');
    try {
      await api(`_jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE' });
      toast(pending ? t('Cancelled') : t('Deleted'));
      navigate(['_jobs']);
    } catch (err) {
      toast(err.message, 'danger');
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        title={
          <>
            {job.name}{' '}
            <span className="muted mono" style={{ fontSize: 18 }}>
              #{job.id}
            </span>
          </>
        }
        badge={<Badge status={job.status} live={job.status === 'running'} />}
        sub={t('In the queue {queue}', { queue: job.queue })}
        actions={
          <>
            {job.status === 'failed' && !job.pipeline && meta.actions.jobs.change ? (
              <Button variant="primary" icon="retry" busy={busy === 'retry'} onClick={retry}>
                {t('Retry')}
              </Button>
            ) : null}
            {job.status !== 'running' && meta.actions.jobs.delete ? (
              <Button
                variant="danger"
                icon={job.status === 'pending' ? 'stop' : 'trash'}
                busy={busy === 'delete'}
                onClick={remove}
              >
                {job.status === 'pending' ? t('Cancel') : t('Delete')}
              </Button>
            ) : null}
          </>
        }
      />
      {job.pipeline ? (
        <Alert tone="info">
          {tj('A job of the step {step} of {run}', {
            step: <strong>{job.pipeline.step}</strong>,
            run: meta.runs ? (
              <a href={href(['_runs', job.pipeline.run])}>{t('the run #{run}', { run: job.pipeline.run })}</a>
            ) : (
              t('the run #{run}', { run: job.pipeline.run })
            ),
          })}
          {job.status === 'failed' ? t(': retry the run, which goes on from its failed steps.') : '.'}
        </Alert>
      ) : null}
      <div className="grid main-side">
        <div className="stack">
          {job.lastError ? (
            <Card
              title={
                <h2>
                  <Icon name="alert" /> {t('The error of its last run')}
                </h2>
              }
            >
              <ErrorText text={job.lastError} />
            </Card>
          ) : null}
          <Card title={t('Payload')}>
            <Json value={job.payload} label={t('Payload')} />
          </Card>
          <Card title={t('Result')}>
            <Json value={job.result} label={t('Result')} />
          </Card>
        </div>
        <Card title={t('Information')}>
          <Facts
            items={[
              [t('Queue'), job.queue],
              [t('Priority'), String(job.priority)],
              [t('Attempts'), t('{count} of {total}', { count: job.attempts, total: job.maxAttempts })],
              [t('Key'), job.key || '—'],
              [t('Created'), <span title={when(job.createdAt)}>{ago(job.createdAt)}</span>],
              [
                job.status === 'pending' ? t('Runs') : t('Was due'),
                <span title={when(job.runAt)}>{ago(job.runAt)}</span>,
              ],
              [t('Finished'), job.finishedAt ? <span title={when(job.finishedAt)}>{ago(job.finishedAt)}</span> : '—'],
              job.lockedBy
                ? [t('Worker'), t('{worker} (until {when})', { worker: job.lockedBy, when: when(job.lockedUntil) })]
                : null,
            ]}
          />
        </Card>
      </div>
    </>
  );
}
