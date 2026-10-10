// The login page: the user and password, then the code of an authenticator app when the server asks for it; sent to
// login with the header of the admin and the CSRF token of the session.
import { useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Alert, Button } from '../ui.jsx';
import { t } from '../i18n.js';

async function send(body, csrf) {
  let response;
  try {
    response = await fetch('login', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-xufa-admin': '1',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, data: { error: t('Could not reach the server') } };
  }
  const data = await response.json().catch(() => ({ error: response.statusText }));
  return { ok: response.ok, data };
}

export function Login({ title, csrf }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [asksCode, setAsksCode] = useState(false);
  // A recovery code instead of the app (lost): xxxx-xxxx.
  const [recovery, setRecovery] = useState(false);
  // Whether the app keeps recovery codes (said by the answer that asks for the code).
  const [canRecover, setCanRecover] = useState(false);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const codeBox = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setMessage(t('Write your user and password'));
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await send({ username, password, code: asksCode ? code : undefined }, csrf);
    if (res.ok) {
      window.location.href = './';
      return;
    }
    setBusy(false);
    if (res.data.code) {
      // The password was right: the code of the authenticator app is asked for.
      setAsksCode(true);
      setCanRecover(Boolean(res.data.recovery));
      setTimeout(() => codeBox.current?.focus(), 0);
    }
    setMessage(res.data.error || t('Could not log in'));
  };

  return (
    <div className="login-page">
      <div className="login">
        <div className="head">
          <span className="mark">{(title || 'A').charAt(0).toUpperCase()}</span>
          <div>
            <h1>{title}</h1>
            <div className="muted">{asksCode ? t('One more step') : t('Log in to continue')}</div>
          </div>
        </div>
        <form id="login" className="card" noValidate onSubmit={submit}>
          <div className="card-body">
            {message ? <Alert>{message}</Alert> : null}
            {!asksCode ? (
              <>
                <div className="field">
                  <label htmlFor="username">{t('User')}</label>
                  <input
                    id="username"
                    name="username"
                    className="input"
                    autoComplete="username"
                    autoFocus
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="password">{t('Password')}</label>
                  <div className="input-group">
                    <input
                      id="password"
                      name="password"
                      className="input"
                      type={show ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={show ? 'eyeOff' : 'eye'}
                      aria-label={show ? t('Hide the password') : t('Show the password')}
                      onClick={() => setShow(!show)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor="code">{recovery ? t('A recovery code') : t('Code of your authenticator app')}</label>
                <input
                  ref={codeBox}
                  id="code"
                  name="code"
                  className="input code-input"
                  inputMode={recovery ? 'text' : 'numeric'}
                  autoComplete={recovery ? 'off' : 'one-time-code'}
                  maxLength={recovery ? 9 : 8}
                  placeholder={recovery ? 'xxxx-xxxx' : undefined}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))}
                />
                {canRecover ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setRecovery(!recovery);
                      setCode('');
                      setTimeout(() => codeBox.current?.focus(), 0);
                    }}
                  >
                    {recovery ? t('Use the code of the app') : t('Lost the app? Use a recovery code')}
                  </button>
                ) : null}
              </div>
            )}
            <Button type="submit" variant="primary" busy={busy}>
              {asksCode ? t('Verify') : t('Log in')}
            </Button>
            {asksCode ? (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setAsksCode(false);
                  setCode('');
                  setMessage(null);
                }}
              >
                <Icon name="chevronLeft" /> {t('Use another account')}
              </button>
            ) : null}
          </div>
        </form>
        <div className="foot">
          <Icon name="lock" /> {t('Your session is kept by this site only')}
        </div>
      </div>
    </div>
  );
}
