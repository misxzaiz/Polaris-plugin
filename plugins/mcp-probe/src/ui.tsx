/** ui.tsx —— 面板小件（按钮/圆点/徽标/区块/JSON 视图） */
import type { ReactNode } from 'react';

export function Btn(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'ghost' | 'danger' | 'amber';
  sm?: boolean;
  title?: string;
}) {
  const cls = ['mp-btn'];
  if (props.kind && props.kind !== 'primary') cls.push(props.kind);
  if (props.sm) cls.push('sm');
  return (
    <button
      className={cls.join(' ')}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      type="button"
    >
      {props.children}
    </button>
  );
}

export function Dot({ status }: { status: 'ok' | 'warn' | 'bad' | 'idle' }) {
  return <span className={`mp-dot ${status}`} />;
}

export function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'mute'; children: ReactNode }) {
  return <span className={`mp-badge ${tone}`}>{children}</span>;
}

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mp-sec-wrap">
      <div className="mp-sec">
        <div className="mp-sec-bar" />
        <span className="mp-sec-t">{title}</span>
        {hint ? <span className="mp-hint">{hint}</span> : null}
        {actions ? <span className="mp-sec-actions">{actions}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function JsonView({ text, maxH }: { text: string; maxH?: number }) {
  return (
    <pre className="mp-json" style={maxH ? { maxHeight: maxH } : undefined}>{text}</pre>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mp-field">
      <span className="mp-field-l">{label}{hint ? <i className="mp-field-h">{hint}</i> : null}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="mp-empty">{children}</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="mp-err">{children}</div>;
}

export function statusDot(status: string | undefined, poisoned?: boolean): 'ok' | 'warn' | 'bad' | 'idle' {
  if (poisoned) return 'bad';
  switch (status) {
    case 'ready': return 'ok';
    case 'connecting': return 'warn';
    case 'error': return 'bad';
    default: return 'idle';
  }
}
