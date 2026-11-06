import { useEffect, useId, useRef, useState, type ReactNode } from "react";
export default function MapPopover({
  label,
  children,
  icon,
  className = "",
  attention = "",
  closeOnAction = false,
}: {
  label: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  attention?: string;
  closeOnAction?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (attention) setOpen(true);
  }, [attention]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className={`map-popover ${className}`}>
      <button
        ref={trigger}
        type="button"
        className="map-overlay-button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {icon || label}
      </button>
      {open && (
        <div
          id={id}
          role="region"
          aria-label={label}
          className="map-popover-panel"
          onClick={(event) => {
            if (
              closeOnAction &&
              (event.target as HTMLElement).closest("button")
            ) {
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
