// The page of the admin: what the server says of it (api/models: the models, the user, the tenants, what it may do),
// the sidebar and the header around the view of the route, the tenant chosen, and the theme.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrf, setTenant } from './api.js';
import { href, navigate, useRoute } from './router.js';
import { Icon } from './icons.jsx';
import { Button, Dropdown, Failure, Loading } from './ui.jsx';
import { useConfirm, useToast } from './feedback.jsx';
import { count, initials } from './format.js';
import { Dashboard } from './views/dashboard.jsx';
import { ModelList } from './views/model-list.jsx';
import { ModelForm } from './views/model-form.jsx';
import { Jobs, JobDetail } from './views/jobs.jsx';
import { Runs, RunDetail } from './views/runs.jsx';
import { Schema } from './views/schema.jsx';
import { Work } from './views/work.jsx';
import { Sessions } from './views/sessions.jsx';
import { Account } from './views/account.jsx';
import { StartRun } from './views/start-run.jsx';
import { Schedules } from './views/schedules.jsx';
import { t, languages, locale, chooseLanguage } from './i18n.js';

const Admin = createContext(null);
export const useAdmin = () => useContext(Admin);

// The name of the last part of the breadcrumb (an object, a job...), set by the view.
export function useLeaf(label) {
  const { setLeaf } = useAdmin();
  useEffect(() => {
    setLeaf(label || null);
    return () => setLeaf(null);
  }, [label, setLeaf]);
}

const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // Not kept: the default next time.
    }
  },
};

const TENANT_KEY = 'xufa.admin.tenant';
const THEME_KEY = 'xufa.admin.theme';
const NARROW_KEY = 'xufa.admin.narrow';

// The theme: light, dark, or that of the system.
function useTheme() {
  const [theme, setTheme] = useState(() => store.get(THEME_KEY) || 'system');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const choose = useCallback((value) => {
    store.set(THEME_KEY, value === 'system' ? null : value);
    setTheme(value);
  }, []);
  return [theme, choose];
}

function Sidebar({ meta, route, narrow, onNarrow, onNavigate }) {
  const [section] = route.parts;
  const item = (to, icon, label, active, extra) => (
    <a
      key={to}
      href={to}
      className={`nav-item ${active ? 'active' : ''}`}
      title={narrow ? label : undefined}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span className="label">{label}</span>
      {extra}
    </a>
  );
  return (
    <aside className="sidebar" aria-label={t('Sections')}>
      <a className="brand" href="#/" onClick={onNavigate}>
        <span className="mark">{(meta.title || 'A').charAt(0).toUpperCase()}</span>
        <span className="name">{meta.title}</span>
      </a>
      <nav>
        {item('#/', <Icon name="dashboard" />, t('Dashboard'), !section)}
        {meta.models.length ? <div className="nav-section">{t('Models')}</div> : null}
        {meta.models.map((entry) =>
          item(
            href([entry.name]),
            <span className="letter">{entry.label.charAt(0).toUpperCase()}</span>,
            entry.label,
            section === entry.name,
            <span className="count">{count(entry.count)}</span>
          )
        )}
        {meta.jobs || meta.runs || meta.schedules || meta.schema ? (
          <div className="nav-section">{t('System')}</div>
        ) : null}
        {meta.jobs || meta.runs || meta.schedules
          ? item(
              meta.jobs && meta.runs ? '#/_work' : meta.jobs ? '#/_jobs' : meta.runs ? '#/_runs' : '#/_schedules',
              <Icon name="jobs" />,
              t('Work'),
              section === '_work' || section === '_jobs' || section === '_runs' || section === '_schedules'
            )
          : null}
        {meta.schema ? item('#/_schema', <Icon name="database" />, t('Data model'), section === '_schema') : null}
      </nav>
      <div className="sidebar-foot hide-sm">
        <Button
          variant="ghost"
          icon={narrow ? 'chevronsRight' : 'chevronsLeft'}
          onClick={onNarrow}
          aria-label={narrow ? t('Expand the sidebar') : t('Collapse the sidebar')}
        >
          {narrow ? null : t('Collapse')}
        </Button>
      </div>
    </aside>
  );
}

function Crumbs({ meta, route, leaf }) {
  const [section, id] = route.parts;
  const crumbs = [];
  const both = meta.jobs && meta.runs;
  if (section === '_work') crumbs.push([t('Work'), '#/_work']);
  else if (section === '_jobs') crumbs.push(...(both ? [[t('Work'), '#/_work']] : []), [t('Jobs'), '#/_jobs']);
  else if (section === '_runs') crumbs.push(...(both ? [[t('Work'), '#/_work']] : []), [t('Pipeline runs'), '#/_runs']);
  else if (section === '_schedules') {
    crumbs.push(...(meta.jobs && meta.runs ? [[t('Work'), '#/_work']] : []), [t('Schedules'), '#/_schedules']);
  } else if (section === '_sessions') crumbs.push([t('Sessions'), '#/_sessions']);
  else if (section === '_schema') crumbs.push([t('Data model'), '#/_schema']);
  else if (section === '_account') crumbs.push([t('Your account'), '#/_account']);
  else if (section) {
    const model = meta.models.find((entry) => entry.name === section);
    crumbs.push([model ? model.label : section, href([section])]);
  }
  if (id !== undefined) crumbs.push([leaf || (id === 'new' ? t('New') : `#${id}`), null]);
  const all = [[t('Dashboard'), '#/'], ...crumbs];
  return (
    <nav className="crumbs" aria-label={t('Breadcrumb')}>
      {all.map(([label, to], index) => {
        const lastOne = index === all.length - 1;
        return (
          <span key={`${label}-${index}`} style={{ display: 'contents' }}>
            {index ? <span className={`sep ${index === 1 ? 'hide-sm' : ''}`}>/</span> : null}
            {lastOne || !to ? (
              <span className="here" aria-current="page">
                {label}
              </span>
            ) : (
              <a href={to} className={index === 0 ? 'hide-sm' : ''}>
                {label}
              </a>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function TenantMenu({ tenants, tenant, onChoose }) {
  const [filter, setFilter] = useState('');
  const current = tenants.find((entry) => entry.id === tenant);
  const shown = tenants.filter((entry) => entry.label.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <Dropdown
      label={t('Tenant')}
      button={({ open, toggle }) => (
        <button
          type="button"
          className="menu-btn outlined"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Tenant: ${current ? current.label : 'none'}`}
        >
          <Icon name="building" />
          <span className="text">{current ? current.label : t('Choose a tenant')}</span>
          <Icon name="chevronDown" />
        </button>
      )}
    >
      {(close) => (
        <>
          {tenants.length > 6 ? (
            <input
              className="input"
              placeholder={t('Find a tenant')}
              aria-label={t('Find a tenant')}
              autoFocus
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          ) : (
            <div className="menu-head muted">{t('Tenant')}</div>
          )}
          <ul className="options">
            {shown.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={entry.id === tenant}
                  className={`option ${entry.id === tenant ? 'selected' : ''}`}

                  onClick={() => {
                    close();
                    if (entry.id !== tenant) onChoose(entry.id);
                  }}
                >
                  {entry.label}
                  {entry.id === tenant ? <Icon name="check" className="check" /> : null}
                </button>
              </li>
            ))}
            {!shown.length ? <li className="option-empty">{t('No tenant')}</li> : null}
          </ul>
        </>
      )}
    </Dropdown>
  );
}

const THEMES = [
  ['light', t('Light'), 'sun'],
  ['dark', t('Dark'), 'moon'],
  ['system', t('Like the system'), 'dashboard'],
];

function UserMenu({ user, theme, onTheme }) {
  const { meta } = useAdmin();
  const confirm = useConfirm();
  const toast = useToast();
  const logout = (body) =>
    api('/logout', { method: 'POST', body })
      .catch(() => null)
      .then(() => {
        window.location.href = 'login';
      });
  const others = async () => {
    const yes = await confirm({
      title: t('Log out of your other sessions?'),
      message: t(
        'Every other browser and device where you are logged in to the admin is logged out. This one goes on.'
      ),
      confirm: t('Log out the others'),
      icon: 'logout',
    });
    if (!yes) return;
    try {
      const result = await api('/logout', { method: 'POST', body: { others: true } });
      setCsrf(result.csrf);
      toast(t('Your other sessions are logged out'));
    } catch (err) {
      toast(err.message, 'danger');
    }
  };
  const everywhere = async () => {
    const yes = await confirm({
      title: t('Log out everywhere?'),
      message: t('Every browser and device where you are logged in to the admin is logged out, this one too.'),
      confirm: t('Log out everywhere'),
      icon: 'logout',
    });
    if (yes) logout({ everywhere: true });
  };
  return (
    <Dropdown
      label={t('Account')}
      button={({ open, toggle }) => (
        <button
          type="button"
          className="menu-btn"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={user ? t('Account of {name}', { name: user.name }) : t('Settings')}
        >
          {user ? <span className="avatar">{initials(user.name)}</span> : <Icon name="sun" />}
          {user ? <span className="text hide-sm">{user.name}</span> : null}
          <Icon name="chevronDown" />
        </button>
      )}
    >
      {(close) => (
        <>
          {user ? (
            <div className="menu-head">
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {t('Signed in')}
              </div>
            </div>
          ) : null}
          <div className="muted" style={{ padding: '4px 9px', fontSize: 12 }}>
            {t('Theme')}
          </div>
          {THEMES.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              className={`option ${theme === value ? 'selected' : ''}`}

              onClick={() => {
                onTheme(value);
                close();
              }}
            >
              <Icon name={icon} />
              {label}
              {theme === value ? <Icon name="check" className="check" /> : null}
            </button>
          ))}
          {languages.length > 1 ? (
            <>
              <div className="menu-sep" />
              {/* One row, however many languages: a select (typing a letter goes to it). */}
              <label className="menu-row">
                <Icon name="globe" />
                <span>{t('Language')}</span>
                <select
                  className="select sm"
                  value={locale}
                  onChange={(event) => {
                    close();
                    chooseLanguage(event.target.value);
                  }}
                >
                  {languages.map(({ tag, name }) => (
                    <option key={tag} value={tag} lang={tag}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {user ? (
            <>
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="option"

                onClick={() => {
                  close();
                  logout({});
                }}
              >
                <Icon name="logout" />
                {t('Log out')}
              </button>
              {meta && meta.account ? (
                <button
                  type="button"
                  role="menuitem"
                  className="option"
                  onClick={() => {
                    close();
                    navigate(['_account'], {});
                  }}
                >
                  <Icon name="lock" />
                  {t('Your account')}
                </button>
              ) : null}
              {meta && meta.sessions ? (
                <button
                  type="button"
                  role="menuitem"
                  className="option"
                  onClick={() => {
                    close();
                    navigate(['_sessions'], {});
                  }}
                >
                  <Icon name="devices" />
                  {t('Your sessions')}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="option"
                onClick={() => {
                  close();
                  others();
                }}
              >
                <Icon name="devices" />
                {t('Log out other sessions')}
              </button>
              <button
                type="button"
                role="menuitem"
                className="option danger-option"
                onClick={() => {
                  close();
                  everywhere();
                }}
              >
                <Icon name="logout" />
                {t('Log out everywhere')}
              </button>
            </>
          ) : null}
        </>
      )}
    </Dropdown>
  );
}

function View({ route }) {
  const { meta } = useAdmin();
  const [section, id] = route.parts;
  if (!section) return <Dashboard />;
  if (section === '_work' && meta.jobs && meta.runs) return <Work query={route.query} />;
  if (section === '_jobs' && meta.jobs) return id ? <JobDetail key={id} id={id} /> : <Jobs query={route.query} />;
  if (section === '_runs' && meta.runs && id === 'new' && meta.actions.runs.change)
    return <StartRun query={route.query} />;
  if (section === '_runs' && meta.runs) return id ? <RunDetail key={id} id={id} /> : <Runs query={route.query} />;
  if (section === '_schedules' && meta.schedules) return <Schedules />;
  if (section === '_schema' && meta.schema) return <Schema />;
  if (section === '_sessions' && meta.sessions) return <Sessions key={route.query.user || ''} query={route.query} />;
  if (section === '_account' && meta.account) return <Account />;
  const model = meta.models.find((entry) => entry.name === section);
  if (!model) {
    return (
      <Failure
        error={{ status: 404, message: t('There is nothing at {section} (or it is not for you).', { section }) }}
      />
    );
  }
  if (id !== undefined) return <ModelForm key={`${model.name}/${id}`} model={model} pk={id} query={route.query} />;
  return <ModelList key={model.name} model={model} query={route.query} />;
}

export function App() {
  const route = useRoute();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [leaf, setLeaf] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [narrow, setNarrow] = useState(() => store.get(NARROW_KEY) === '1');
  const [theme, setTheme] = useTheme();

  // What the server says of the page, in the tenant chosen (a tenant remembered that is not the user's any more: the
  // first one the user may use).
  const load = useCallback(async () => {
    try {
      let data;
      try {
        data = await api('models');
      } catch (err) {
        if (err.status !== 403 || !store.get(TENANT_KEY)) throw err;
        store.set(TENANT_KEY, null);
        setTenant(null);
        data = await api('models');
      }
      setCsrf(data.csrf);
      if (data.tenant) {
        setTenant(data.tenant);
        store.set(TENANT_KEY, data.tenant);
      }
      setMeta(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    setTenant(store.get(TENANT_KEY));
    load();
  }, [load]);

  useEffect(() => {
    if (!meta) return;
    const [section] = route.parts;
    const model = meta.models.find((entry) => entry.name === section);
    const place =
      leaf ||
      (section === '_work'
        ? t('Work')
        : section === '_jobs'
          ? t('Jobs')
          : section === '_runs'
            ? t('Pipeline runs')
            : section === '_schedules'
              ? t('Schedules')
              : section === '_sessions'
                ? t('Sessions')
                : section === '_schema'
                  ? t('Data model')
                  : section === '_account'
                    ? t('Your account')
                    : model
                      ? model.label
                      : t('Dashboard'));
    document.title = `${place} · ${meta.title}`;
  }, [meta, route, leaf]);

  const chooseTenant = useCallback(
    (id) => {
      setTenant(id);
      store.set(TENANT_KEY, id);
      setMeta((current) => ({ ...current, tenant: id }));
      navigate([]);
      load();
    },
    [load]
  );

  const value = useMemo(() => (meta ? { meta, refresh: load, setLeaf, tenant: meta.tenant } : null), [meta, load]);

  if (error && !meta) {
    return (
      <div className="content">
        <Failure error={error} retry={load} />
      </div>
    );
  }
  if (!meta) return <Loading />;

  const closeDrawer = () => setDrawer(false);
  return (
    <Admin.Provider value={value}>
      <div className={`shell ${narrow ? 'narrow' : ''} ${drawer ? 'drawer' : ''}`}>
        <Sidebar
          meta={meta}
          route={route}
          narrow={narrow}
          onNavigate={closeDrawer}
          onNarrow={() => {
            store.set(NARROW_KEY, narrow ? null : '1');
            setNarrow(!narrow);
          }}
        />
        <div className="scrim" onClick={closeDrawer} />
        <div className="main">
          <header className="topbar">
            <Button
              variant="ghost"
              icon="menu"
              aria-label={t('Menu')}
              className="menu-toggle"
              onClick={() => setDrawer(!drawer)}
            />
            <Crumbs meta={meta} route={route} leaf={leaf} />
            <div className="grow" />
            {meta.tenants && meta.tenants.length ? (
              <TenantMenu tenants={meta.tenants} tenant={meta.tenant} onChoose={chooseTenant} />
            ) : null}
            <UserMenu user={meta.user} theme={theme} onTheme={setTheme} />
          </header>
          <main className="content" key={meta.tenant || 'all'}>
            <View route={route} />
          </main>
        </div>
      </div>
    </Admin.Provider>
  );
}
