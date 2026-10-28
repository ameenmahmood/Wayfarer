import {
  useEffect,
  useRef,
  useState,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, LoaderCircle, ChevronLeft, ChevronRight } from "lucide-react";
let scrollLocks = 0;
let previousOverflow = "";
export function lockPageScroll() {
  if (scrollLocks++ === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}
export function Button({
  children,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type={type} className={`button ${className}`}>
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
  const titleId = useId();
  useEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    const unlock = lockPageScroll();
    d.showModal();
    return () => {
      d.close();
      unlock();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body" tabIndex={0} aria-label={`${title} content`}>
        {children}
      </div>
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
  const running = useRef(false);
  async function run(fn: () => Promise<any>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** A keyboard-focusable horizontal rail with explicit controls for mouse users. */
export function ScrollRail({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const el = rail.current!;
    const update = () =>
      setEdges({
        start: el.scrollLeft < 2,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener("scroll", update);
    update();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [children]);
  const move = (direction: number) =>
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.75,
      behavior: "smooth",
    });
  return (
    <div className="scroll-rail">
      <button
        className="icon-button rail-arrow"
        aria-label={`Scroll ${label} left`}
        disabled={edges.start}
        onClick={() => move(-1)}
      >
        <ChevronLeft size={18} />
      </button>
      <div
        ref={rail}
        className={className}
        role="region"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (
            e.target === e.currentTarget &&
            ["ArrowLeft", "ArrowRight"].includes(e.key)
          ) {
            e.preventDefault();
            move(e.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        {children}
      </div>
      <button
        className="icon-button rail-arrow"
        aria-label={`Scroll ${label} right`}
        disabled={edges.end}
        onClick={() => move(1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
