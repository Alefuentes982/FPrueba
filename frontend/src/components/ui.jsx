import { useCallback, useEffect, useState } from 'react';

// Carga datos y expone estado de carga/error. `deps` controla cuándo se vuelve a pedir.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

export function ErrorAlert({ error, onClose }) {
  if (!error) return null;
  return (
    <div className="alert alert-danger d-flex justify-content-between" role="alert">
      <div>
        {error.message}
        {error.details?.length > 0 && (
          <ul className="mb-0 mt-1">
            {error.details.map((d, i) => <li key={i}>{d.path ? `${d.path}: ` : ''}{d.message}</li>)}
          </ul>
        )}
      </div>
      {onClose && <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" />}
    </div>
  );
}

export const Spinner = () => (
  <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /></div>
);

export function PageHeader({ title, children }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h2 className="h4 mb-0">{title}</h2>
      <div className="d-flex gap-2">{children}</div>
    </div>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return <div className="text-muted small">{total} registro(s)</div>;
  return (
    <div className="d-flex justify-content-between align-items-center">
      <span className="text-muted small">{total} registro(s)</span>
      <div className="btn-group">
        <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <i className="bi bi-chevron-left" />
        </button>
        <span className="btn btn-outline-secondary btn-sm disabled">{page} / {pages}</span>
        <button className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <i className="bi bi-chevron-right" />
        </button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}
