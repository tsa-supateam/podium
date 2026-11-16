// Base components of the "industrial signal" system: chamfers, registration corners, index codes,
// stat tiles, bracket buttons, accordions, steppers, meters and rolling numbers.
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { useInView } from "./motion";

/** Four L-shaped registration marks on the corners of the positioned parent. */
export function Corners({ tone }: { tone?: "signal" | "paper" | "ink" }) {
  return (
    <span className={`corners ${tone ?? ""}`} aria-hidden>
      <i /><i /><i /><i />
    </span>
  );
}

/** Compact screen header: display-caps title, optional mono metadata, actions on the right. */
export function ScreenHeader({ title, meta, children }: {
  title: string;
  meta?: (string | null | false | undefined)[];
  children?: ReactNode;
}) {
  return (
    <header className="screen-head">
      <h1 className="display">
        <span className="line-mask"><span className="line">{title}</span></span>
      </h1>
      {meta && <span className="screen-head-meta micro">{meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}</span>}
      {children && <div className="screen-head-actions">{children}</div>}
    </header>
  );
}

/** Per-character digit roll. Digits slide to their value; other characters stay put. */
export function Odometer({ value, className }: { value: string | number; className?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const chars = String(value).split("");
  return (
    <span ref={ref} className={`odo ${className ?? ""}`} aria-label={String(value)}>
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span className="odo-col" key={`${chars.length}-${i}`} aria-hidden>
            <span className="odo-strip" style={{ transform: `translateY(${seen ? -Number(c) * 10 : 0}%)`, transitionDelay: `${i * 60}ms` }}>
              {"0123456789".split("").map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={`${chars.length}-${i}`} aria-hidden>{c}</span>
        ),
      )}
    </span>
  );
}

/** "250+"-style tile: big display number, mono label bottom-left, four-corner chamfer. */
export function StatTile({ value, label, tone = "charcoal", sub }: {
  value: string | number;
  label: string;
  tone?: "signal" | "charcoal" | "paper" | "concrete";
  sub?: ReactNode;
}) {
  return (
    <div className={`tile tile-${tone}`}>
      <Odometer value={value} className="tile-value" />
      {sub && <span className="tile-sub">{sub}</span>}
      <span className="tile-label micro">{label}</span>
    </div>
  );
}

/** ⌐ PREV ¬ style button with bracket corners. */
export function BracketButton({ children, onClick, disabled, title, className }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button className={`btn bracket ${className ?? ""}`} onClick={onClick} disabled={disabled} title={title}>
      <Corners />
      {children}
    </button>
  );
}

/** Pagination readout + dot stepper + bracket PREV/NEXT. */
export function Stepper({ index, total, onPrev, onNext, label }: {
  index: number; // 0-based
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  label?: string;
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="stepper">
      {onPrev && (
        <BracketButton onClick={onPrev} disabled={index <= 0}>
          <Icon name="arrowL" size={14} /> PREV
        </BracketButton>
      )}
      <span className="stepper-count micro">
        {label && <span className="muted">{label} </span>}
        <b>{pad(Math.min(total, index + 1))}</b> / {pad(total)}
      </span>
      <span className="stepper-dots" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < index ? "done" : i === index ? "on" : ""} />
        ))}
      </span>
      {onNext && (
        <BracketButton onClick={onNext} disabled={index >= total - 1}>
          NEXT <Icon name="arrowR" size={14} className="arw" />
        </BracketButton>
      )}
    </div>
  );
}

/** 10-block VU-style segmented meter. `value` in 0..1. */
export function SegMeter({ value, blocks = 10, tone, label }: { value: number; blocks?: number; tone?: "signal" | "paper" | "bad"; label?: string }) {
  const n = Math.round(Math.max(0, Math.min(1, value)) * blocks);
  return (
    <span className={`seg ${tone ?? ""}`} role="meter" aria-valuemin={0} aria-valuemax={blocks} aria-valuenow={n} aria-label={label}>
      {Array.from({ length: blocks }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} style={{ transitionDelay: `${i * 30}ms` }} />
      ))}
    </span>
  );
}

/** Accordion row: hairline-separated, index number on the left, + that turns to ×. Native <details>. */
export function Accordion({ index, title, children, className, defaultOpen }: {
  index?: number;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className={`acc ${className ?? ""}`} open={defaultOpen}>
      <summary>
        {index != null && <span className="acc-idx micro">{String(index).padStart(3, "0")}</span>}
        <span className="acc-title">{title}</span>
        <span className="acc-plus" aria-hidden><Icon name="plus" size={16} /></span>
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

/** Hatched swatch pattern defs used wherever gaze zones are drawn (shape + label, never colour alone). */
export function ZonePatterns() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <pattern id="pat-N" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--charcoal-700)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--signal)" strokeWidth="2" />
        </pattern>
        <pattern id="pat-X" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="5" height="5" fill="var(--charcoal-800)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--concrete-dim)" strokeWidth="1" />
        </pattern>
        <pattern id="pat-dots" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="var(--concrete)" opacity="0.25" />
        </pattern>
      </defs>
    </svg>
  );
}
