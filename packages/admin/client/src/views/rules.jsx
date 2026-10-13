// The books of rules: their active and last versions, a new book (from a table to start with), workbooks of Excel
// uploaded as new versions (refused when their tests fail, unless kept anyway), and downloads.
import { useRef, useState } from 'react';
import { useAdmin } from '../app.jsx';
import { api, download, useApi } from '../api.js';
import { href, navigate } from '../router.js';
import { Alert, Button, Empty, Failure, PageHead } from '../ui.jsx';
import { SkeletonRows } from '../lists.jsx';
import { useConfirm, useToast } from '../feedback.jsx';
import { ago, when } from '../format.js';
import { t } from '../i18n.js';

// The sheets of a new book: a rules table to start from.
const STARTER = [
  {
    name: 'RULES',
    rows: [
      ['Rules Float Discount(String plan, Integer age)', null, null, null],
      ['C1', 'HC1', 'RET', null],
      ['plan', 'age', null, null],
      ['String', 'IntRange', 'Float', null],
      [null, '<30', '[30..60)', '>=60'],
      ['basic', 0, 0.05, 0.1],
      ['premium', 0.1, 0.15, 0.2],
    ],
  },
];

// The bytes of a file in base64.
export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Downloads the .xlsx of a book (of a version).
export function downloadBook(name, version) {
  const query = version ? `?version=${version}` : '';
  return download(`_rules/${encodeURIComponent(name)}/xlsx${query}`, `${name}${version ? `-v${version}` : ''}.xlsx`);
}

// A name of a book: letters, digits, - _ and . (not starting with one of them).
const validName = (name) => /^[\w][\w.-]{0,199}$/.test(name);

export function Rules() {
  const { meta } = useAdmin();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, reload } = useApi('_rules');
  const [failed, setFailed] = useState(null);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const canChange = Boolean(meta.actions && meta.actions.rules && meta.actions.rules.change);

  const askName = (suggested) => {
    const name = window.prompt(t('The name of the book'), suggested || '');
    if (name === null) return null;
    if (!validName(name.trim())) {
      toast(t('A name is letters, digits, - _ and .'), 'danger');
      return null;
    }
    return name.trim();
  };

  const create = async () => {
    const name = askName('');
    if (!name) return;
    if (data && data.results.some((book) => book.name === name)) {
      toast(t('There is a book {name} already', { name }), 'danger');
      return;
    }
    setBusy(true);
    try {
      await api(`_rules/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: { sheets: STARTER, comment: t('New book') },
      });
      navigate(['_rules', name], {});
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (chosen, force = false) => {
    const name = force ? chosen.name : askName(chosen.file.name.replace(/\.xlsx$/i, '').replace(/[^\w.-]+/g, '-'));
    if (!name) return;
    setBusy(true);
    setFailed(null);
    try {
      const xlsx = await readBase64(chosen.file);
      const answer = await api(`_rules/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: { xlsx, fileName: chosen.file.name, force },
      });
      toast(t('Version {version} of {name} kept', { version: answer.version, name }));
      reload();
    } catch (err) {
      if (err.status === 422) setFailed({ name, file: chosen.file, messages: err.data.messages || [] });
      else toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const keepAnyway = async () => {
    const yes = await confirm({
      title: t('Keep a book whose tests fail?'),
      message: t('It becomes the active version: the rules that fail their tests run as they are.'),
      confirm: t('Keep it anyway'),
      icon: 'alert',
    });
    if (yes) upload(failed, true);
  };

  if (error && !data) return <Failure error={error} retry={reload} />;
  return (
    <>
      <PageHead
        title={t('Rules')}
        sub={t('Books of rules: decision tables and calculations in workbooks, tested and in versions')}
        actions={
          canChange ? (
            <>
              <input
                ref={file}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  const [chosen] = event.target.files;
                  event.target.value = '';
                  if (chosen) upload({ file: chosen });
                }}
              />
              <Button icon="save" busy={busy} onClick={() => file.current.click()}>
                {t('Upload a workbook')}
              </Button>
              <Button variant="primary" icon="plus" busy={busy} onClick={create}>
                {t('New book')}
              </Button>
            </>
          ) : null
        }
      />
      {failed ? (
        <Alert>
          <strong>{t('The workbook {name} does not pass its tests', { name: failed.name })}</strong>
          <ul className="rule-messages">
            {failed.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <Button size="sm" variant="danger" onClick={keepAnyway}>
            {t('Keep it anyway')}
          </Button>{' '}
          <Button size="sm" variant="ghost" onClick={() => setFailed(null)}>
            {t('Close')}
          </Button>
        </Alert>
      ) : null}
      <section className="card">
        {data && !data.results.length ? (
          <Empty icon="edit" title={t('No books of rules')}>
            {t('Upload a workbook of Excel, or start a new book here.')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table" id="rules">
              <thead>
                <tr>
                  <th>{t('Name')}</th>
                  <th>{t('Active version')}</th>
                  <th>{t('Versions')}</th>
                  <th>{t('Updated')}</th>
                  <th aria-label={t('Actions')} />
                </tr>
              </thead>
              <tbody>
                {!data ? (
                  <SkeletonRows columns={5} />
                ) : (
                  data.results.map((book) => (
                    <tr key={`${book.tenant || ''}/${book.name}`} data-name={book.name}>
                      <td>
                        <a href={href(['_rules', book.name])}>
                          <strong>{book.name}</strong>
                        </a>
                      </td>
                      <td>{book.active ? `v${book.active}` : <span className="muted">{t('none')}</span>}</td>
                      <td>{book.last}</td>
                      <td>{book.updatedAt ? <span title={when(book.updatedAt)}>{ago(book.updatedAt)}</span> : '—'}</td>
                      <td className="end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="save"
                          onClick={() => downloadBook(book.name).catch((err) => toast(err.message, 'danger'))}
                        >
                          {t('Download')}
                        </Button>
                      </td>
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
