// Toasts (what happened) and confirmations (a dialog that answers a promise), for every page of the admin.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { Button } from './ui.jsx';
import { t } from './i18n.js';

const Feedback = createContext(null);

export const useToast = () => useContext(Feedback).toast;
export const useConfirm = () => useContext(Feedback).confirm;

function Dialog({ dialog, answer }) {
  const yes = useRef(null);
  useEffect(() => {
    yes.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') answer(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [answer]);
  const danger = dialog.tone !== 'accent';
  return (
    <div className="modal-back" onMouseDown={(event) => event.target === event.currentTarget && answer(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="body">
          <div className={`art tone-${danger ? 'danger' : 'accent'}`}>
            <Icon name={dialog.icon || (danger ? 'alert' : 'info')} />
          </div>
          <div>
            <h2 id="dialog-title">{dialog.title}</h2>
            {dialog.message ? <p>{dialog.message}</p> : null}
          </div>
        </div>
        <div className="foot">
          <Button onClick={() => answer(false)}>{dialog.cancel || t('Cancel')}</Button>
          <Button ref={yes} variant={danger ? 'danger solid' : 'primary'} onClick={() => answer(true)}>
            {dialog.confirm || t('Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

let ids = 0;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  // toast('Saved') or toast(message, 'danger').
  const toast = useCallback(
    (text, tone = 'success') => {
      ids += 1;
      const id = ids;
      setToasts((list) => [...list.slice(-3), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === 'danger' ? 7000 : 3500);
    },
    [dismiss]
  );
  // confirm({ title, message, confirm: 'Delete', tone: 'danger' }): a promise of true or false.
  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setDialog(options);
      }),
    []
  );
  const answer = useCallback((value) => {
    setDialog(null);
    if (resolver.current) resolver.current(value);
    resolver.current = null;
  }, []);
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <Feedback.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast tone-${item.tone}`} role="status">
            <Icon name={item.tone === 'danger' ? 'alert' : item.tone === 'success' ? 'ok' : 'info'} />
            <div className="text">{item.text}</div>
            <Button size="sm" variant="ghost" icon="x" aria-label={t('Close')} onClick={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
      {dialog ? <Dialog dialog={dialog} answer={answer} /> : null}
    </Feedback.Provider>
  );
}
