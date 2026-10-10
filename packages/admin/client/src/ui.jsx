// The components of the admin: buttons, badges, cards, empty states, alerts, switches, menus, tabs and JSON.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { toneOf, statusLabel } from './format.js';
import { t } from './i18n.js';

export function Button({ variant = '', size = '', icon, busy = false, children, className = '', ...props }) {
  const classes = ['btn', variant, size, !children ? 'icon-only' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={busy || props.disabled} {...props}>
      {busy ? <span className="spinner sm" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Badge({ status, tone, children, live = false }) {
  const shown = tone === undefined ? toneOf(status) : tone;
  return (
    <span className={`badge ${shown ? `tone-${shown}` : ''} ${live ? 'spin-dot' : ''}`}>
      <span className="dot" />
      {children ?? statusLabel(status)}
    </span>
  );
}

export function Spinner({ small = false, label = t('Loading') }) {
  return <span className={`spinner ${small ? 'sm' : ''}`} role="status" aria-label={label} />;
}

export function Loading() {
  return (
    <div className="loading">
      <Spinner />
    </div>
  );
}

export function Card({ title, actions, children, foot, className = '', bodyless = false }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      ) : null}
      {bodyless ? children : <div className="card-body">{children}</div>}
      {foot ? <div className="card-foot">{foot}</div> : null}
    </section>
  );
}

export function PageHead({ title, sub, actions, badge }) {
  return (
    <div className="page-head">
      <div>
        <h1>
          {title}
          {badge}
        </h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children, actions }) {
  return (
    <div className="empty">
      <div className="art">
        <Icon name={icon} />
      </div>
      {title ? <h3>{title}</h3> : null}
      {children ? <div>{children}</div> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

const ALERT_ICONS = { danger: 'alert', warning: 'alert', info: 'info', success: 'ok' };

export function Alert({ tone = 'danger', children }) {
  return (
    <div className={`alert tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICONS[tone] || 'info'} />
      <div>{children}</div>
    </div>
  );
}

// An error of the API as a page: its message, and a retry.
export function Failure({ error, retry }) {
  const status = error && error.status;
  const title =
    status === 403
      ? t('You cannot see this')
      : status === 404
        ? t('Not found')
        : status === 0
          ? t('The server does not answer')
          : t('Something went wrong');
  return (
    <div className="card">
      <Empty
        icon={status === 403 ? 'lock' : 'alert'}
        title={title}
        actions={
          retry ? (
            <Button icon="refresh" onClick={() => retry()}>
              {t('Try again')}
            </Button>
          ) : null
        }
      >
        {error ? error.message : null}
      </Empty>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled = false, id }) {
  return (
    <label className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="track" />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

// Closes on a click outside and on Escape.
export function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      // (A target no longer in the page was inside: an option chosen, taken out of its list by the render of the
      // choice before the event got here.)
      if (ref.current && event.target.isConnected && !ref.current.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

// A button with a menu under it: the menu gets close() to call when an item is chosen.
export function Dropdown({ button, children, align = 'right', label }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div className="drop" ref={ref}>
      {button({ open, toggle: () => setOpen((value) => !value), label })}
      {open ? (
        <div className={`popover ${align === 'right' ? 'right' : ''}`} role="menu" aria-label={label}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={`tab ${tab.value === value ? 'active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="n">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Facts({ items }) {
  return (
    <dl className="facts">
      {items
        .filter(Boolean)
        .map(([term, value]) => [<dt key={`t-${term}`}>{term}</dt>, <dd key={`d-${term}`}>{value}</dd>])}
    </dl>
  );
}

// JSON with its keys, texts, numbers and literals colored (as text nodes: nothing of it is HTML).
function highlight(text) {
  const parts = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] && match[2]) {
      parts.push(
        <span key={match.index} className="j-key">
          {match[1]}
        </span>,
        match[2]
      );
    } else if (match[1]) {
      parts.push(
        <span key={match.index} className="j-str">
          {match[1]}
        </span>
      );
    } else if (match[3]) {
      parts.push(
        <span key={match.index} className="j-lit">
          {match[3]}
        </span>
      );
    } else {
      parts.push(
        <span key={match.index} className="j-num">
          {match[4]}
        </span>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="copy"
      icon={done ? 'check' : 'copy'}
      aria-label={t('Copy')}
      title={t('Copy')}
      onClick={() => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    />
  );
}

export function Json({ value, label }) {
  if (value === null || value === undefined) return <div className="muted">—</div>;
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="code-wrap">
      <pre className="code-block" aria-label={label}>
        {highlight(text)}
      </pre>
      <CopyButton text={text} />
    </div>
  );
}

export function ErrorText({ text }) {
  if (!text) return null;
  return (
    <div className="code-wrap">
      <pre className="code-block error">{text}</pre>
      <CopyButton text={text} />
    </div>
  );
}
