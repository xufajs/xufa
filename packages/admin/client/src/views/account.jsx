// The account of the user logged in: its password (the other sessions end when it changes), an authenticator app (a QR
// code to scan, confirmed by its first code) and recovery codes (shown once, to keep somewhere safe).
import { useState } from 'react';
import { api, setCsrf, useApi } from '../api.js';
import { Icon } from '../icons.jsx';
import { Alert, Badge, Button, Card, Failure, Loading, PageHead } from '../ui.jsx';
import { useToast } from '../feedback.jsx';
import { t, tn } from '../i18n.js';

// Errors by field of an answer of the API.
const errorsOf = (err) => (err && err.data && err.data.errors) || {};

function Field({ id, label, error, ...props }) {
  return (
    <div className={`field ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" {...props} />
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [values, setValues] = useState({ current: '', password: '', repeat: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const change = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (values.password !== values.repeat) {
      setErrors({ repeat: [t('Not the same password')] });
      return;
    }
    setBusy(true);
    try {
      const answer = await api('_account/password', {
        method: 'POST',
        body: { current: values.current, password: values.password },
      });
      if (answer.csrf) setCsrf(answer.csrf);
      setValues({ current: '', password: '', repeat: '' });
      setErrors({});
      toast(t('Password changed: your other sessions are logged out'));
    } catch (err) {
      setErrors(Object.keys(errorsOf(err)).length ? errorsOf(err) : { current: [err.message] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={
        <h2>
          <Icon name="lock" /> {t('Password')}
        </h2>
      }
    >
      <form id="password-form" className="stack" noValidate onSubmit={submit}>
        <Field
          id="current-password"
          label={t('Your password now')}
          type="password"
          autoComplete="current-password"
          value={values.current}
          onChange={change('current')}
          error={errors.current && errors.current[0]}
        />
        <Field
          id="new-password"
          label={t('New password')}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={change('password')}
          error={errors.password && errors.password[0]}
        />
        <Field
          id="repeat-password"
          label={t('The new password again')}
          type="password"
          autoComplete="new-password"
          value={values.repeat}
          onChange={change('repeat')}
          error={errors.repeat && errors.repeat[0]}
        />
        <div>
          <Button type="submit" variant="primary" busy={busy}>
            {t('Change password')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Codes shown once: copied, or saved as a file.
function RecoveryCodes({ codes, onDone }) {
  const toast = useToast();
  const text = codes.join('\n');
  return (
    <div className="stack">
      <Alert tone="warning">
        {t('Keep these codes somewhere safe: each logs you in once without the app. They are not shown again.')}
      </Alert>
      <ol className="recovery-codes">
        {codes.map((code) => (
          <li key={code} className="mono">
            {code}
          </li>
        ))}
      </ol>
      <div className="actions">
        <Button
          icon="copy"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => toast(t('Copied')),
              () => toast(t('Could not copy'), 'danger')
            )
          }
        >
          {t('Copy')}
        </Button>
        <a
          className="btn"
          download="recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          {t('Save as a file')}
        </a>
        <Button variant="primary" onClick={onDone}>
          {t('I have kept them')}
        </Button>
      </div>
    </div>
  );
}

function AuthenticatorCard({ state, reload }) {
  const toast = useToast();
  // What is asked now: nothing, the password (to start, remove or renew), the code of the app, or the codes.
  const [step, setStep] = useState(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setStep(null);
    setPassword('');
    setCode('');
    setSetup(null);
    setError(null);
  };
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      const errors = errorsOf(err);
      setError((errors.current && errors.current[0]) || (errors.code && errors.code[0]) || err.message);
    } finally {
      setBusy(false);
    }
  };
  const withPassword = (event) => {
    event.preventDefault();
    run(async () => {
      if (step === 'start') {
        setSetup(await api('_account/totp/start', { method: 'POST', body: { password } }));
        setStep('code');
      } else if (step === 'disable') {
        await api('_account/totp/disable', { method: 'POST', body: { password } });
        toast(t('The authenticator app is removed'));
        reset();
        reload();
      } else if (step === 'renew') {
        const answer = await api('_account/recovery', { method: 'POST', body: { password } });
        reset();
        setCodes(answer.recoveryCodes);
        reload();
      }
      setPassword('');
    });
  };
  const confirm = (event) => {
    event.preventDefault();
    run(async () => {
      const answer = await api('_account/totp/confirm', { method: 'POST', body: { code } });
      toast(t('The authenticator app is set up'));
      reset();
      if (answer.recoveryCodes) setCodes(answer.recoveryCodes);
      reload();
    });
  };

  return (
    <Card
      title={
        <h2>
          <Icon name="devices" /> {t('Authenticator app')}{' '}
          {state.totp.enabled ? <Badge tone="success">{t('On')}</Badge> : <Badge tone="">{t('Off')}</Badge>}
        </h2>
      }
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
      ) : step === 'code' && setup ? (
        <form id="totp-confirm" className="stack" noValidate onSubmit={confirm}>
          <p>{t('Scan this code with your authenticator app, then write the code it shows.')}</p>
          {/* An SVG made by the server (qrSvg of @xufa/auth): paths only. */}
          <div className="qr" dangerouslySetInnerHTML={{ __html: setup.svg }} />
          <details>
            <summary className="muted">{t('Cannot scan it?')}</summary>
            <p>
              Write this key in the app: <code className="mono">{setup.secret}</code>
            </p>
          </details>
          {error ? <Alert>{error}</Alert> : null}
          <Field
            id="totp-code"
            label={t('Code of the app')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
          />
          <div className="actions">
            <Button type="submit" variant="primary" busy={busy}>
              {t('Turn on')}
            </Button>
            <Button onClick={reset}>{t('Cancel')}</Button>
          </div>
        </form>
      ) : step ? (
        <form id="totp-password" className="stack" noValidate onSubmit={withPassword}>
          <p>{t('Write your password to go on.')}</p>
          {error ? <Alert>{error}</Alert> : null}
          <Field
            id="totp-password-input"
            label={t('Your password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="actions">
            <Button type="submit" variant={step === 'disable' ? 'danger' : 'primary'} busy={busy}>
              {step === 'start' ? t('Go on') : step === 'disable' ? t('Remove the app') : t('New codes')}
            </Button>
            <Button onClick={reset}>{t('Cancel')}</Button>
          </div>
        </form>
      ) : state.totp.enabled ? (
        <div className="stack">
          <p>{t('Logging in asks for a code of your authenticator app after your password.')}</p>
          {state.recovery ? (
            <p className="muted">
              {tn(state.recovery.left, '{count} recovery code left.', '{count} recovery codes left.')}
            </p>
          ) : null}
          <div className="actions">
            {state.recovery ? <Button onClick={() => setStep('renew')}>{t('New recovery codes')}</Button> : null}
            {state.totp.can ? (
              <Button variant="danger" onClick={() => setStep('disable')}>
                {t('Remove the app')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="stack">
          <p>{t('A code of an app on your phone after your password: a stolen password is not enough to log in.')}</p>
          {state.totp.can ? (
            <div>
              <Button variant="primary" onClick={() => setStep('start')}>
                {t('Set up an authenticator app')}
              </Button>
            </div>
          ) : (
            <p className="muted">{t('It is not set up from here.')}</p>
          )}
        </div>
      )}
    </Card>
  );
}

export function Account() {
  const { data, error, reload } = useApi('_account');
  if (error && !data) return <Failure error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHead title={t('Your account')} sub={data.name || ' '} />
      <div className="grid two">
        {data.password ? <PasswordCard /> : null}
        <AuthenticatorCard state={data} reload={reload} />
      </div>
    </>
  );
}
