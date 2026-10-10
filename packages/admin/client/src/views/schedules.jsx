// The schedules of the scheduler: when each job runs next and how its runs went; those that start runs of a pipeline
// with their last run and a link to all of them; and Run now (for those who may change runs).
import { useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, useApi, useInterval } from '../api.js';
import { href, navigate } from '../router.js';
import { Badge, Button, Empty, Failure, PageHead, Switch } from '../ui.jsx';
import { SkeletonRows } from '../lists.jsx';
import { useToast } from '../feedback.jsx';
import { ago, count, when } from '../format.js';
import { RunStatus, WorkSwitch } from './work.jsx';
import { t, tj } from '../i18n.js';

export function Schedules() {
  const { meta } = useAdmin();
  const toast = useToast();
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(null);
  const { data, error, reload } = useApi('_runs/schedules');
  useInterval(() => reload({ quiet: true }), 5000, live);
  const canRun = Boolean(meta.actions && meta.actions.runs && meta.actions.runs.change);

  const runNow = async (item) => {
    setBusy(item.name);
    try {
      const answer = await api(`_runs/schedules/${encodeURIComponent(item.name)}/run`, { method: 'POST', body: {} });
      if (answer.run) {
        toast(t('Started the run #{run}', { run: answer.run }));
        navigate(['_runs', answer.run], {});
        return;
      }
      toast(t('{name} runs now', { name: item.name }));
      reload({ quiet: true });
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  return (
    <>
      <WorkSwitch current="_schedules" />
      <PageHead
        title={t('Schedules')}
        sub={t('What runs on a schedule: when next, and how its runs went')}
        actions={<Switch checked={live} onChange={setLive} label={t('Live')} />}
      />
      <section className="card">
        {data && !data.results.length ? (
          <Empty icon="clock" title={t('No schedules')}>
            {t('Jobs added to the scheduler, and pipelines.schedule(), show here.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table" id="schedules">
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Schedule')}</th>
                  <th>{t('Next')}</th>
                  <th>{t('Last')}</th>
                  <th>{t('Runs')}</th>
                  {canRun ? <th aria-label={t('Actions')} /> : null}
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={canRun ? 6 : 5} />
                ) : (
                  data.results.map((item) => (
                    <tr key={item.name} data-name={item.name}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.pipeline ? (
                          <div className="muted note">
                            {tj('starts the pipeline {name}', {
                              name: <a href={href(['_runs'], { pipeline: item.pipeline })}>{item.pipeline}</a>,
                            })}
                          </div>
                        ) : null}
                      </td>
                      <td className="mono note">{item.schedule}</td>
                      <td>
                        {item.running ? (
                          <Badge status="running" live />
                        ) : item.next ? (
                          <span title={when(item.next)}>{ago(item.next)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {item.lastPipelineRun ? (
                          <a href={href(['_runs', item.lastPipelineRun.id])} className="last-run">
                            <RunStatus run={item.lastPipelineRun} />{' '}
                            <span title={when(item.lastPipelineRun.createdAt)}>
                              {ago(item.lastPipelineRun.createdAt)}
                            </span>
                          </a>
                        ) : item.lastRun ? (
                          <span title={item.lastError || when(item.lastRun)}>
                            <Badge status={item.lastError ? 'failed' : 'done'} /> {ago(item.lastRun)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {item.trigger ? (
                          <a href={href(['_runs'], { trigger: item.trigger })}>
                            {count(item.pipelineRuns)} {item.pipelineRuns === 1 ? 'run' : 'runs'}
                          </a>
                        ) : (
                          <span className="muted">
                            {t('{count} here', { count: count(item.runs) })}
                            {item.failures ? ` · ${t('{count} failed', { count: count(item.failures) })}` : ''}
                          </span>
                        )}
                      </td>
                      {canRun ? (
                        <td className="end">
                          <Button size="sm" icon="play" busy={busy === item.name} onClick={() => runNow(item)}>
                            {t('Run now')}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
