// Line icon set: 24-unit grid, one 1.5px stroke weight, square caps, built from circles,
// nested rectangles, crosshairs and tick-marked axes. Replaces every emoji in the app.
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  arrowR: <path d="M4 12h15M13 6l6 6-6 6" />,
  arrowL: <path d="M20 12H5M11 6l-6 6 6 6" />,
  arrowUp: <path d="M12 20V5M6 11l6-6 6 6" />,
  play: <path d="M7 4.5v15L19 12z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" />,
  rec: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" fill="currentColor" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8" /></>,
  speaker: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  book: <><path d="M4 4h7v16H4zM13 4h7v16h-7z" /><path d="M6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 4v16M4 12h16" />,
  minus: <path d="M4 12h16" />,
  lock: <><rect x="5" y="11" width="14" height="9" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 14.5v2" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 2v6M12 16v6M2 12h6M16 12h6" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></>,
  medal: <><path d="M8.5 3h7l5 5v7l-5 5h-7l-5-5V8z" /><path d="M12 7.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" /></>,
  folder: <><path d="M3 6h7l2 2h9v11H3z" /><path d="M3 11h18" /></>,
  retry: <><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4v4.5h-4.5" /></>,
  shuffle: <><rect x="3.5" y="3.5" width="17" height="17" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="15.5" cy="8.5" r="1" fill="currentColor" /><circle cx="8.5" cy="15.5" r="1" fill="currentColor" /></>,
  idea: <><circle cx="12" cy="10" r="6" /><path d="M9.5 19h5M10 22h4M12 4v3M9 10h6" /></>,
  camera: <><rect x="3" y="6" width="13" height="12" /><path d="M16 10l5-3v10l-5-3" /><circle cx="9.5" cy="12" r="2.5" /></>,
  eye: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  gauge: <><path d="M4.2 17.5a9 9 0 1 1 15.6 0" /><path d="M12 13.5l4-5M12 4.5v2M5 9l1.6 1M19 9l-1.6 1" /><circle cx="12" cy="13.5" r="1.2" /></>,
  wave: <path d="M2 12h3l2-6 3 12 3-15 3 15 2-6h4" />,
  sine: <path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0 3.5-5 5-3" />,
  structure: <><rect x="3" y="3" width="18" height="18" /><rect x="7" y="7" width="10" height="4" /><rect x="7" y="13" width="10" height="4" /></>,
  evidence: <><path d="M4 20V4M4 20h16" /><path d="M4 16h1.5M4 12h1.5M4 8h1.5M8 20v-1.5M12 20v-1.5M16 20v-1.5" /><path d="M8.5 13l3 3 7-8" /></>,
  commentary: <><path d="M8 5H4v14h4M16 5h4v14h-4" /><path d="M9 10h6M9 14h4" /></>,
  clarity: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M12 3.5V7M12 17v3.5M3.5 12H7M17 12h3.5" /></>,
  speed: <><circle cx="12" cy="13" r="8" /><path d="M10 2.5h4M12 2.5v2.5M12 13l4-3.5" /><path d="M12 6v1.5M19 13h-1.5M5 13h1.5" /></>,
  filler: <><path d="M2 12h4l1.5-3 2 6 2-9 2 12 2-6h6.5" /><path d="M17 5l4 4M21 5l-4 4" /></>,
  voice: <><path d="M2 12h2.5M19.5 12H22" /><path d="M6 8v8M9 5v14M12 9v6M15 6v12M18 10v4" /></>,
  gaze: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M12 1.5v2.5M12 20v2.5" /></>,
  trash: <><path d="M4 6h16M9 6V3.5h6V6M6 6l1 15h10l1-15" /><path d="M10 10v7M14 10v7" /></>,
  replay: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4.5h4.5" /><path d="M10.5 9v6l4.5-3z" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  audience: <><circle cx="7" cy="9" r="2.5" /><circle cx="17" cy="9" r="2.5" /><circle cx="12" cy="7" r="2.5" /><path d="M2.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5M12.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5M8 13.5c1-1.5 2.5-2.5 4-2.5s3 1 4 2.5" /></>,
  grid: <><rect x="3" y="3" width="18" height="18" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></>,
  scan: <><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" /><path d="M3 12h18" /></>,
  flag: <><path d="M5 21V3" /><path d="M5 4h13l-3 4 3 4H5" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /><path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5.5 9v11h13V9" /><rect x="10" y="14" width="4" height="6" /></>,
  learn: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6" /></>,
  warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 17.5v1" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 16, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {P[name]}
    </svg>
  );
}

/** Line icon for each Learn module / metric family. */
export const MODULE_ICON: Record<string, IconName> = {
  structure: "structure", evidence: "evidence", commentary: "commentary", clarity: "clarity",
  speed: "speed", fillers: "filler", voice: "voice", eye: "gaze",
};
