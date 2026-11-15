// Achievements: wood → diamond tiers for the overall stars and the Overview's #/5 ratings,
// tracked separately for prepared and on-the-spot speeches. The engine works out what each run earned.
import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";

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

const TIER_INFO: Record<Tier, { name: string; light: string; dark: string; ink: string }> = {
  wood: { name: "Wood", light: "#c49a6c", dark: "#6b4423", ink: "#3d2410" },
  bronze: { name: "Bronze", light: "#f4a362", dark: "#9b4a12", ink: "#4a2508" },
  silver: { name: "Silver", light: "#eef2f6", dark: "#8a95a3", ink: "#3b4450" },
  gold: { name: "Gold", light: "#ffe27a", dark: "#c08a0c", ink: "#5a3e00" },
  diamond: { name: "Diamond", light: "#e6fbff", dark: "#43b3e6", ink: "#0b4a66" },
};
const CATEGORY_INFO: Record<Category, { name: string; glyph: string }> = {
  overall: { name: "Speaker", glyph: "★" },
  structure: { name: "Structure", glyph: "☰" },
  evidence: { name: "Evidence", glyph: "✔" },
  commentary: { name: "Commentary", glyph: "❝" },
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

/** A round coin: tier-metal rim, dark face, the track's symbol. Diamond adds facets and sparkle.
 *  Locked coins are plain grey, like an unminted blank. */
export function Badge({ tier, category, size = 56, locked = false }: { tier: Tier; category: Category; size?: number; locked?: boolean }) {
  const t = TIER_INFO[tier];
  const id = `c-${tier}-${category}-${locked ? "l" : "u"}-${size}`;
  const rimA = locked ? "#d9dde3" : t.light, rimB = locked ? "#9aa1ab" : t.dark;
  const glyph = locked ? "#a7adb6" : t.light;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${t.name} ${CATEGORY_INFO[category].name}${locked ? " (locked)" : ""}`}>
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={rimA} />
          <stop offset="0.5" stopColor={rimB} />
          <stop offset="1" stopColor={rimA} />
        </linearGradient>
        <radialGradient id={`${id}-face`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor={locked ? "#f2f4f7" : "#3a4256"} />
          <stop offset="1" stopColor={locked ? "#c9ced6" : "#151a26"} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-rim)`} />
      <circle cx="32" cy="32" r="23.5" fill={`url(#${id}-face)`} stroke={locked ? "#b7bdc6" : t.dark} strokeWidth="1.5" />
      {tier === "wood" && !locked && (
        <g stroke="#6e4f2a" strokeOpacity="0.5" strokeWidth="1.1" fill="none">
          <path d="M6 24c3-1 5 1 7 0" /><path d="M51 40c3 1 5-1 7 0" /><path d="M9 46c2 0 3 2 5 1" />
        </g>
      )}
      {tier === "diamond" && !locked && (
        <g fill="#ffffff">
          <path d="M50 6l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
          <path d="M11 47l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" opacity="0.8" />
        </g>
      )}
      <text x="32" y="39.5" textAnchor="middle" fontSize="20" fontWeight="700" fill={glyph}>
        {CATEGORY_INFO[category].glyph}
      </text>
    </svg>
  );
}

const Lock = () => (
  <span className="ach-lock" aria-hidden>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
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
      <Badge tier={shown.tier} category={shown.category} size={64} />
      <div className="ach-text">
        <span className="ach-kicker">Achievement unlocked · {SPEECH_TYPE_NAME[shown.speechType]}</span>
        <b className="ach-name">{achievementName(shown)}</b>
        <span className="muted small">{achievementRule(shown)}</span>
      </div>
      <button className="icon-btn" onClick={() => setShown(null)} aria-label="Close">✕</button>
    </div>
  );
}

/** History tab: a collection of every achievement, earned or locked, one section per track. */
export function AchievementsView() {
  const list = useAchievements();
  const [kind, setKind] = useState<SpeechType>("prepared");
  if (!list) return <div className="spinner" />;
  const byId = new Map(list.map((a) => [a.id, a]));
  const total = SPEECH_TYPES.length * CATEGORIES.length * TIERS.length;
  const top = best(list);
  const latestAt = list.reduce<string | null>((m, a) => (a.at && (!m || a.at > m) ? a.at : m), null);
  const latest = best(list.filter((a) => a.at === latestAt));
  const bestLevel = (cat: Category) =>
    Math.max(0, ...list.filter((a) => a.speechType === kind && a.category === cat).map((a) => a.level));
  return (
    <div className="ach-page">
      <section className="ach-hero">
        <div className="ach-hero-badge">
          {top ? <Badge tier={top.tier} category={top.category} size={112} /> : <Badge tier="wood" category="overall" size={112} locked />}
          <span className="spark s1">✦</span><span className="spark s2">✦</span><span className="spark s3">✦</span>
        </div>
        <div className="ach-hero-text">
          <h2>Collection</h2>
          <span className="muted">{list.length} of {total} unlocked</span>
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
            <span className="muted small">Latest unlock</span>
            <button className="ach-latest-card" onClick={() => void openSession(latest.sessionId)}>
              <Badge tier={latest.tier} category={latest.category} size={44} />
              <span>
                <b>{achievementName(latest)}</b>
                <span className="small">{SPEECH_TYPE_NAME[latest.speechType]} · {latest.at ? new Date(latest.at).toLocaleDateString() : ""}</span>
              </span>
            </button>
          </div>
        )}
      </section>

      {CATEGORIES.map((cat) => {
        const lvl = bestLevel(cat);
        return (
          <section key={cat} className="ach-section">
            <div className="ach-section-head">
              <h3>{CATEGORY_INFO[cat].name}</h3>
              <span className="muted small">{lvl} of {TIERS.length}</span>
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
                    <Badge tier={tier} category={cat} size={84} locked={!a} />
                    <b className="ach-card-name">{achievementName({ tier, category: cat })}</b>
                    <span className="ach-card-rule">{achievementRule({ category: cat, level: i + 1, speechType: kind })}</span>
                    <span className="ach-card-foot">
                      {a ? (
                        <span className="ach-earned">✓ {isBest ? "Best so far" : "Earned"}{a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ""}</span>
                      ) : lvl > 0 ? (
                        <>
                          <span className="ach-bar"><span style={{ width: `${(lvl / (i + 1)) * 100}%` }} /></span>
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
  );
}
