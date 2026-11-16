// Achievements: wood → diamond tiers for the overall stars and the Overview's #/5 ratings,
// tracked separately for prepared and on-the-spot speeches. The engine works out what each run earned.
import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import { Icon, type IconName } from "../../ui/icons";
import { SegMeter } from "../../ui/kit";
import { useCountUp } from "../../ui/motion";

export type Tier = "wood" | "bronze" | "silver" | "gold" | "diamond";
export type Category = "overall" | "structure" | "evidence" | "commentary";
export type SpeechType = "prepared" | "impromptu";

export interface Achievement {
  id: string;
  speechType: SpeechType;
  category: Category;
  tier: Tier;
  level: number; // 1-5
  sessionId: string;
  title: string;
  at: string | null;
}

export const TIERS: Tier[] = ["wood", "bronze", "silver", "gold", "diamond"];
export const CATEGORIES: Category[] = ["overall", "structure", "evidence", "commentary"];
export const SPEECH_TYPES: SpeechType[] = ["prepared", "impromptu"];

const TIER_INFO: Record<Tier, { name: string; code: string; ink: string }> = {
  wood: { name: "Wood", code: "T1", ink: "var(--paper)" },
  bronze: { name: "Bronze", code: "T2", ink: "var(--ink)" },
  silver: { name: "Silver", code: "T3", ink: "var(--ink)" },
  gold: { name: "Gold", code: "T4", ink: "var(--ink)" },
  diamond: { name: "Diamond", code: "T5", ink: "var(--ink)" },
};
const CATEGORY_INFO: Record<Category, { name: string; icon: IconName }> = {
  overall: { name: "Speaker", icon: "target" },
  structure: { name: "Structure", icon: "structure" },
  evidence: { name: "Evidence", icon: "evidence" },
  commentary: { name: "Commentary", icon: "commentary" },
};
export const SPEECH_TYPE_NAME: Record<SpeechType, string> = { prepared: "Prepared", impromptu: "On the spot" };

export function achievementName(a: Pick<Achievement, "tier" | "category">): string {
  return `${TIER_INFO[a.tier].name} ${CATEGORY_INFO[a.category].name}`;
}

/** What it took, in the results screen's own terms (stars, or the Overview's #/5). */
export function achievementRule(a: Pick<Achievement, "category" | "level" | "speechType">): string {
  const kind = a.speechType === "impromptu" ? "an on-the-spot speech" : "a prepared speech";
  return a.category === "overall"
    ? `${a.level}★ overall on ${kind}`
    : `${CATEGORY_INFO[a.category].name} ${a.level}/5 on ${kind}`;
}

/** The highest tier among several earned at once; overall breaks ties. */
export function best(list: Achievement[]): Achievement | null {
  return [...list].sort((x, y) => y.level - x.level || CATEGORIES.indexOf(x.category) - CATEGORIES.indexOf(y.category))[0] ?? null;
}

export function useAchievements(): Achievement[] | null {
  const [list, setList] = useState<Achievement[] | null>(null);
  useEffect(() => {
    engine.request<Achievement[]>("achievements.list", {}).then(setList).catch(() => setList([]));
  }, []);
  return list;
}

const OCT = (r: number, c = 50) => {
  const k = r * 0.4142; // tan(22.5°): regular octagon
  return [[c - k, c - r], [c + k, c - r], [c + r, c - k], [c + r, c + k], [c + k, c + r], [c - k, c + r], [c - r, c + k], [c - r, c - k]]
    .map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ");
};

/** Material fill for a tier: SVG gradients and patterns only. */
function Material({ id, tier }: { id: string; tier: Tier }) {
  switch (tier) {
    case "wood":
      return (
        <pattern id={id} width="6" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
          <rect width="6" height="100" fill="var(--mat-wood)" />
          <path d="M1 0c1 20-1 40 0 60s1 30 0 40M4 0c-1 25 1 45 0 70" stroke="var(--mat-wood-grain)" strokeWidth="0.6" fill="none" opacity="0.7" />
        </pattern>
      );
    case "bronze":
    case "silver":
      return (
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0.3">
          {[0, 0.18, 0.32, 0.5, 0.66, 0.82, 1].map((o, i) => (
            <stop key={o} offset={o} stopColor={`var(--mat-${tier}-${i % 2 ? "b" : "a"})`} stopOpacity={i % 2 ? 0.9 : 1} />
          ))}
        </linearGradient>
      );
    case "gold":
      return (
        <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="var(--mat-gold-a)" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="var(--mat-gold-b)" strokeWidth="0.5" opacity="0.55" />
        </pattern>
      );
    case "diamond":
      return (
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mat-diamond-a)" />
          <stop offset="0.45" stopColor="var(--mat-diamond-b)" />
          <stop offset="0.55" stopColor="var(--mat-diamond-a)" />
          <stop offset="1" stopColor="var(--mat-diamond-b)" />
        </linearGradient>
      );
  }
}

/** Chamfered-octagon coin: registration corners, tick rim, inner hairline ring, category line icon,
 *  tier code and serial. Locked coins are charcoal with a dot-matrix fill, dashed outline and padlock.
 *  `unlock` plays the mint sequence: blueprint draw, crosshair sweep, stamp, shine, split-flap code. */
export function Badge({ tier, category, size = 56, locked = false, serial, unlock = false }: {
  tier: Tier; category: Category; size?: number; locked?: boolean; serial?: number; unlock?: boolean;
}) {
  const t = TIER_INFO[tier];
  const id = `c-${tier}-${category}-${locked ? "l" : "u"}-${size}-${unlock ? "a" : "s"}`;
  const big = size >= 80;
  const level = TIERS.indexOf(tier) + 1;
  const flap = useCountUp(level, unlock && !locked, 420);
  const ink = locked ? "var(--concrete-dim)" : t.ink;
  return (
    <svg className={`badge-coin ${unlock && !locked ? "unlock" : ""}`} width={size} height={size} viewBox="0 0 100 100" role="img"
      aria-label={`${t.name} ${CATEGORY_INFO[category].name}${locked ? " (locked)" : ""}`}>
      <defs>
        {!locked && <Material id={`${id}-m`} tier={tier} />}
        <clipPath id={`${id}-clip`}><polygon points={OCT(44)} /></clipPath>
      </defs>
      {/* registration corners */}
      <path d="M2 10V2h8M90 2h8v8M98 90v8h-8M10 98H2v-8" fill="none" stroke={locked ? "var(--concrete-faint)" : "var(--paper)"} strokeWidth="1.5" />
      {unlock && !locked && <polygon className="bp" points={OCT(47)} pathLength={1} fill="none" stroke="var(--concrete)" strokeWidth="0.75" />}
      <g className="coin">
        <polygon points={OCT(44)} fill={locked ? "var(--charcoal-700)" : `url(#${id}-m)`}
          stroke={locked ? "var(--concrete-faint)" : "none"} strokeDasharray={locked ? "3 2" : undefined} />
        {locked && <polygon points={OCT(44)} fill="url(#pat-dots)" />}
        {tier === "diamond" && !locked && (
          <path d="M32 7L50 50 68 7M7 32L50 50 7 68M93 32L50 50 93 68M32 93L50 50 68 93" fill="none" stroke="var(--mat-glint)" strokeWidth="0.5" opacity="0.5" />
        )}
        {/* tick-marked rim */}
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2, r0 = i % 4 === 0 ? 33.5 : 35.5, r1 = 38;
          return <line key={i} x1={50 + Math.cos(a) * r0} y1={50 + Math.sin(a) * r0} x2={50 + Math.cos(a) * r1} y2={50 + Math.sin(a) * r1}
            stroke={ink} strokeWidth="0.6" opacity={locked ? 0.4 : 0.55} />;
        })}
        <circle cx="50" cy="50" r="31" fill="none" stroke={ink} strokeWidth="0.5" opacity="0.6" />
        <g transform={`translate(${big ? 36 : 32},${big ? 33 : 32})`} color={ink}>
          <Icon name={locked ? "lock" : CATEGORY_INFO[category].icon} size={big ? 28 : 36} />
        </g>
        {big && (
          <>
            <text x="50" y="72" textAnchor="middle" fontSize="7" fontFamily="var(--mono)" fontWeight="700" fill={ink} letterSpacing="0.08em">
              T{locked ? level : Math.max(1, Math.round(flap))} {t.name.toUpperCase()}
            </text>
            {serial != null && (
              <text x="50" y="27" textAnchor="middle" fontSize="5.5" fontFamily="var(--mono)" fill={ink} opacity="0.75" letterSpacing="0.06em">
                № {String(serial).padStart(3, "0")}
              </text>
            )}
          </>
        )}
        {!locked && (
          <g clipPath={`url(#${id}-clip)`}>
            <rect className="shine" x="20" y="-20" width="16" height="140" fill="var(--paper)" opacity="0.45" transform="rotate(25 50 50)" />
          </g>
        )}
      </g>
      {unlock && !locked && (
        <g stroke="var(--signal)" strokeWidth="0.75">
          <line className="sweep-h" x1="0" x2="100" y1="50" y2="50" />
          <line className="sweep-v" y1="0" y2="100" x1="50" x2="50" />
        </g>
      )}
    </svg>
  );
}

const Lock = () => (
  <span className="ach-lock" aria-hidden>
    <Icon name="lock" size={14} />
  </span>
);

/** Shown once when a run's results open, for the best achievement it earned. */
export function AchievementBanner({ sessionId }: { sessionId: string }) {
  const list = useAchievements();
  const [shown, setShown] = useState<Achievement | null>(null);
  useEffect(() => {
    const mine = best((list ?? []).filter((a) => a.sessionId === sessionId));
    const key = `podium.achievementShown.${sessionId}`;
    try {
      if (!mine || localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    } catch {
      if (!mine) return; // storage blocked: it may show again next time
    }
    setShown(mine);
    const t = setTimeout(() => setShown(null), 9000);
    return () => clearTimeout(t);
  }, [list, sessionId]);
  if (!shown) return null;
  return (
    <div className={`achievement-banner tier-${shown.tier}`} role="status">
      <Badge tier={shown.tier} category={shown.category} size={84} unlock />
      <div className="ach-text">
        <span className="ach-kicker">Achievement unlocked / {TIER_INFO[shown.tier].code} / {SPEECH_TYPE_NAME[shown.speechType]}</span>
        <b className="ach-name">{achievementName(shown)}</b>
        <span className="muted small">{achievementRule(shown)}</span>
      </div>
      <button className="icon-btn" onClick={() => setShown(null)} aria-label="Close"><Icon name="cross" size={14} /></button>
    </div>
  );
}

/** History tab: a collection of every achievement, earned or locked, one section per track. */
export function AchievementsView() {
  const list = useAchievements();
  const [kind, setKind] = useState<SpeechType>("prepared");
  if (!list) return <div className="spinner" />;
  const serialOf = (id: string) => SPEECH_TYPES.flatMap((k) => CATEGORIES.flatMap((c) => TIERS.map((t) => `${k}:${c}:${t}`))).indexOf(id) + 1;
  const byId = new Map(list.map((a) => [a.id, a]));
  const total = SPEECH_TYPES.length * CATEGORIES.length * TIERS.length;
  const top = best(list);
  const latestAt = list.reduce<string | null>((m, a) => (a.at && (!m || a.at > m) ? a.at : m), null);
  const latest = best(list.filter((a) => a.at === latestAt));
  const bestLevel = (cat: Category) =>
    Math.max(0, ...list.filter((a) => a.speechType === kind && a.category === cat).map((a) => a.level));
  return (
    <div className="ach-page">
      <section className="card ach-hero">
        <div className="ach-hero-badge">
          {top ? <Badge tier={top.tier} category={top.category} size={124} serial={serialOf(top.id)} unlock /> : <Badge tier="wood" category="overall" size={124} locked />}
        </div>
        <div className="ach-hero-text">
          <h2>{list.length} / {total} unlocked</h2>
          <SegMeter value={list.length / total} blocks={20} tone="signal" label="Unlocked" />
          <div className="segmented ach-kind" role="radiogroup" aria-label="Speech type">
            {SPEECH_TYPES.map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {SPEECH_TYPE_NAME[k]}
              </button>
            ))}
          </div>
        </div>
        {latest && (
          <div className="ach-latest">
            <span className="micro">Latest unlock</span>
            <button className="ach-latest-card" onClick={() => void openSession(latest.sessionId)}>
              <Badge tier={latest.tier} category={latest.category} size={44} />
              <span>
                <b>{achievementName(latest)}</b>
                <span className="micro">{SPEECH_TYPE_NAME[latest.speechType]} / {latest.at ? new Date(latest.at).toLocaleDateString() : ""}</span>
              </span>
            </button>
          </div>
        )}
      </section>

      <div className="scroll ach-sections">
      {CATEGORIES.map((cat) => {
        const lvl = bestLevel(cat);
        return (
          <section key={cat} className="ach-section">
            <div className="ach-section-head">
              <h3>{CATEGORY_INFO[cat].name}</h3>
              <span className="rule" />
              <span className="micro">{String(lvl).padStart(2, "0")} / {String(TIERS.length).padStart(2, "0")}</span>
            </div>
            <div className="ach-cards">
              {TIERS.map((tier, i) => {
                const a = byId.get(`${kind}:${cat}:${tier}`);
                const isBest = !!a && i + 1 === lvl;
                return (
                  <button key={tier} className={`ach-card ${a ? "earned" : "locked"} ${isBest ? "best" : ""}`}
                    disabled={!a} onClick={() => a && void openSession(a.sessionId)}
                    title={a ? `Earned in “${a.title}”. Click to open that run.` : undefined}>
                    {a && a.at === latestAt && <span className="ach-new">New</span>}
                    {!a && <Lock />}
                    <Badge tier={tier} category={cat} size={92} locked={!a} serial={a ? serialOf(a.id) : undefined} />
                    <b className="ach-card-name">{achievementName({ tier, category: cat })}</b>
                    <span className="ach-card-rule">{achievementRule({ category: cat, level: i + 1, speechType: kind })}</span>
                    <span className="ach-card-foot">
                      {a ? (
                        <span className="ach-earned"><Icon name="check" size={12} /> {isBest ? "Best so far" : "Earned"}{a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ""}</span>
                      ) : lvl > 0 ? (
                        <>
                          <SegMeter value={lvl / (i + 1)} tone="signal" label="Progress" />
                          <span className="small">{lvl} of {i + 1}{cat === "overall" ? "★" : ""}</span>
                        </>
                      ) : (
                        <span className="small">Not earned yet</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}
