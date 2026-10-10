// Starts a run of a pipeline: its input (JSON), now or later (in some time, or at a date), its priority, and a key (a
// run of that key still running is opened instead of a new one). For those who may change runs (_runs.change).
import { useCallback, useState } from 'react';
import { useLeaf } from '../app.jsx';
import { api, useApi } from '../api.js';
import { navigate } from '../router.js';
import { Alert, Button, Card, Facts, Failure, Loading, PageHead } from '../ui.jsx';
import { useToast } from '../feedback.jsx';
import { WorkSwitch } from './work.jsx';
import { Graph, definitionFacts } from './runs.jsx';
import { t } from '../i18n.js';

const errorsOf = (err) => (err && err.data && err.data.errors) || {};

export function StartRun({ query }) {
  useLeaf(t('Start a run'));
  const toast = useToast();
  const { data, error, reload } = useApi('_runs/pipelines');
  const [values, setValues] = useState({
    pipeline: query.pipeline || '',
    input: '',
    when: 'now',
    delay: '',
    at: '',
    priority: '',
    key: '',
  });
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  // The step of the graph chosen: a click shows it, another click hides it.
  const [picked, setPicked] = useState(null);
  const pick = useCallback((id) => setPicked((current) => (current === id ? null : id)), []);
  // A field changed: its error goes (and those of the times, when how to start changes).
  const set = (name) => (event) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => {
      const gone = name === 'when' ? [name, 'delay', 'at'] : [name];
      if (!gone.some((key) => current[key])) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => !gone.includes(key)));
    });
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  if (!data) return <Loading />;
  const pipelines = data.results;
  const chosen = pipelines.find((item) => item.name === values.pipeline) || null;
  const step = (chosen && chosen.graph && chosen.graph.steps.find((item) => item.id === picked)) || null;

  const submit = async (event) => {
    event.preventDefault();
    let input = null;
    try {
      input = values.input.trim() === '' ? null : JSON.parse(values.input);
    } catch (err) {
      setErrors({ input: [t('Not JSON: {message}', { message: err.message })] });
      return;
    }
    const body = { pipeline: values.pipeline, input };
    if (values.when === 'delay') body.delay = values.delay;
    // A date of the browser (datetime-local) in its time zone, sent as an instant.
    if (values.when === 'at') body.at = values.at ? new Date(values.at).toISOString() : '';
    if (values.priority !== '') body.priority = values.priority;
    if (values.key.trim()) body.key = values.key.trim();
    if (values.when === 'delay' && !values.delay.trim()) {
      setErrors({ delay: [t('How long to wait (10m)')] });
      return;
    }
    if (values.when === 'at' && !values.at) {
      setErrors({ at: [t('When to start')] });
      return;
    }
    setBusy(true);
    setErrors({});
    setProblem(null);
    try {
      const run = await api('_runs', { method: 'POST', body });
      toast(
        run.existing
          ? t('A run of this key is still running: #{id}', { id: run.id })
          : t('Started the run #{run}', { run: run.id })
      );
      navigate(['_runs', run.id], {});
    } catch (err) {
      const fields = errorsOf(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setProblem(err.message);
      setBusy(false);
    }
  };

  const field = (name) => `field ${errors[name] ? 'invalid' : ''}`;
  const errorOf = (name) => (errors[name] ? <div className="error">{errors[name][0]}</div> : null);

  return (
    <>
      <WorkSwitch current="_runs" />
      <PageHead title={t('Start a run')} sub={t('A run of a pipeline, now or later')} />
      <Card>
        {!pipelines.length ? (
          <p className="muted">{t('There are no pipelines defined.')}</p>
        ) : (
          <form id="start-run" className="stack" noValidate onSubmit={submit}>
            {problem ? <Alert>{problem}</Alert> : null}
            <div className={field('pipeline')}>
              <label htmlFor="run-pipeline">{t('Pipeline')}</label>
              <select id="run-pipeline" className="select" value={values.pipeline} onChange={set('pipeline')}>
                <option value="">{t('Choose one…')}</option>
                {pipelines.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
              {chosen && chosen.graph ? (
                <div className="run-graph">
                  <Graph
                    key={chosen.name}
                    graph={chosen.graph}
                    selected={step ? step.id : null}
                    onSelect={pick}
                    label={t('The steps of the pipeline')}
                  />
                  {step ? (
                    <div className="run-step">
                      <strong>{step.id}</strong>
                      <Facts items={definitionFacts(step)} />
                    </div>
                  ) : null}
                </div>
              ) : chosen ? (
                <div className="muted run-steps">
                  {chosen.steps.length} {chosen.steps.length === 1 ? 'step' : 'steps'}: {chosen.steps.join(', ')}
                </div>
              ) : null}
              {errorOf('pipeline')}
            </div>
            <div className={field('input')}>
              <label htmlFor="run-input">
                {t('Input')} <span className="hint">{t('JSON; empty: null')}</span>
              </label>
              <textarea
                id="run-input"
                className="textarea code"
                placeholder='{ "url": "https://example.com/report.pdf" }'
                spellCheck={false}
                value={values.input}
                onChange={set('input')}
              />
              {errorOf('input')}
            </div>
            <fieldset className="field when">
              <legend>{t('When')}</legend>
              <div className="choices">
                {[
                  ['now', t('Now')],
                  ['delay', t('In some time')],
                  ['at', t('At a date')],
                ].map(([value, label]) => (
                  <label key={value} className="choice">
                    <input
                      type="radio"
                      name="when"
                      value={value}
                      checked={values.when === value}
                      onChange={set('when')}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {values.when === 'delay' ? (
              <div className={field('delay')}>
                <label htmlFor="run-delay">
                  {t('Start in')} <span className="hint">30s, 10m, 2h, 1h30m</span>
                </label>
                <input
                  id="run-delay"
                  className="input"
                  value={values.delay}
                  onChange={set('delay')}
                  placeholder="10m"
                />
                {errorOf('delay')}
              </div>
            ) : null}
            {values.when === 'at' ? (
              <div className={field('at')}>
                <label htmlFor="run-at">{t('Start at')}</label>
                <input id="run-at" className="input" type="datetime-local" value={values.at} onChange={set('at')} />
                {errorOf('at')}
              </div>
            ) : null}
            <div className="grid two">
              <div className={field('priority')}>
                <label htmlFor="run-priority">
                  {t('Priority')} <span className="hint">{t('higher first; 0')}</span>
                </label>
                <input
                  id="run-priority"
                  className="input"
                  type="number"
                  step="1"
                  value={values.priority}
                  onChange={set('priority')}
                  placeholder="0"
                />
                {errorOf('priority')}
              </div>
              <div className={field('key')}>
                <label htmlFor="run-key">
                  {t('Key')} <span className="hint">{t('optional: one running run per key')}</span>
                </label>
                <input id="run-key" className="input" value={values.key} onChange={set('key')} />
                {errorOf('key')}
              </div>
            </div>
            <div className="actions">
              <Button type="submit" variant="primary" icon="play" busy={busy}>
                {t('Start the run')}
              </Button>
              <Button onClick={() => window.history.back()}>{t('Cancel')}</Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
