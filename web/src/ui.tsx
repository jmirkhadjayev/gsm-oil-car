// Umumiy UI komponentlari: modal, maydonlar, bildirishnomalar, jadval holatlari.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useI18n } from './i18n';

// ----------------------------- Bildirishnoma -----------------------------
type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, text, kind }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// --------------------------------- Modal ---------------------------------
export function Modal({ title, onClose, children, footer, wide }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button className="btn btn-icon" onClick={onClose} aria-label="close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// -------------------------------- Maydonlar ------------------------------
export function Field({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string };
export function Input({ label, hint, ...rest }: InputProps) {
  return <Field label={label} hint={hint}><input {...rest} /></Field>;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string };
export function Select({ label, hint, children, ...rest }: SelectProps) {
  return <Field label={label} hint={hint}><select {...rest}>{children}</select></Field>;
}

export function Checkbox({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" {...rest} />
        <span>{label}</span>
      </label>
    </div>
  );
}

// ------------------------------ Holatlar ---------------------------------
export function Empty({ text }: { text?: string }) {
  const { t } = useI18n();
  return <div className="empty-state">{text ?? t('empty')}</div>;
}

export function Loading() {
  const { t } = useI18n();
  return <div className="empty-state">{t('loading')}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { cls: string; label: string }> = {
    draft: { cls: 'badge', label: t('statusDraft') },
    issued: { cls: 'badge blue', label: t('statusIssued') },
    closed: { cls: 'badge green', label: t('statusClosed') },
  };
  const s = map[status] ?? { cls: 'badge', label: status };
  return <span className={s.cls}>{s.label}</span>;
}

/** Chetlanish: musbat — ortiqcha sarf (qizil), manfiy — tejamkorlik (yashil). */
export function Deviation({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const v = Number(value);
  if (Math.abs(v) < 0.005) return <span className="mono">0,00</span>;
  const cls = v > 0 ? 'text-pos' : 'text-neg';
  return <span className={cls}>{v > 0 ? '+' : '−'}{Math.abs(v).toFixed(2).replace('.', ',')}</span>;
}

// -------------------------- Ma'lumot yuklash hook ------------------------
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.message || 'Xatolik'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1), setData };
}

/** Tasdiqlash dialogi — oddiy confirm ustiga o'ram (tilga mos matn bilan). */
export function useConfirm() {
  const { t } = useI18n();
  return (text?: string) => window.confirm(text ?? t('confirmDelete'));
}
