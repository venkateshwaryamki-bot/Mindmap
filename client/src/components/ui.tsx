import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName, isIconName } from "./Icon";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet${wide ? " wide" : ""} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export interface Action {
  label: string;
  /** A line-icon name (or a short emoji). */
  icon?: IconName | string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: string; actions: Action[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} className="action-sheet">
      <div className="action-list">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`action-item${a.danger ? " danger" : ""}`}
            disabled={a.disabled}
            onClick={() => {
              onClose();
              a.onSelect();
            }}
          >
            <span className="action-icon">{a.icon && isIconName(a.icon) ? <Icon name={a.icon} size={20} /> : a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function PromptDialog({
  open,
  title,
  label,
  initial = "",
  placeholder,
  confirmLabel = "Save",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setValue(initial);
      setTimeout(() => ref.current?.select(), 30);
    }
  }, [open, initial]);
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onConfirm(value.trim());
        }}
      >
        {label && <label className="field-label">{label}</label>}
        <input ref={ref} autoFocus value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <p className="confirm-text">{message}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger-solid"
          onClick={() => {
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
