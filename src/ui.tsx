import {
  useEffect,
  useRef,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
} from "react";
import { X, LoaderCircle } from "lucide-react";
export function Button({
  children,
  onClick,
  className = "",
  disabled = false,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      title={title}
      type={type}
      disabled={disabled}
      className={`button ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    ["input", "select", "textarea"].includes(children.type as string);
  return (
    <div className="field">
      {control ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {control ? cloneElement(children as any, { id }) : children}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`notice ${tone}`}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">✧</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Action({
  children,
  run,
  className = "",
}: {
  children: ReactNode;
  run: () => Promise<any>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await run();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={16} className="spin" /> : null}
        {children}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}
export function useAsyncAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
