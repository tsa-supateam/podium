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
  wood: { name: "Wood", light: "#e6cfa4", dark: "#a07b4c", ink: "#4a3216" },
  bronze: { name: "Bronze", light: "#e7a467", dark: "#8c4f1d", ink: "#4a2508" },
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

/** Medal for wood to gold, a cut gem for diamond. Locked badges are grey outlines. */
export function Badge({ tier, category, size = 56, locked = false }: { tier: Tier; category: Category; size?: number; locked?: boolean }) {
  const t = TIER_INFO[tier];
  const id = `g-${tier}-${category}-${locked ? "l" : "u"}`;
  const fill = locked ? "var(--line)" : `url(#${id})`;
  const ink = locked ? "var(--faint)" : t.ink;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${t.name} ${CATEGORY_INFO[category].name}${locked ? " (locked)" : ""}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.light} />
          <stop offset="1" stopColor={t.dark} />
        </linearGradient>
      </defs>
      {tier === "diamond" ? (
        <g stroke={locked ? "var(--faint)" : "#ffffff"} strokeOpacity={locked ? 0.5 : 0.7} strokeWidth="1.2" strokeLinejoin="round">
          <polygon points="14,8 50,8 62,24 32,60 2,24" fill={fill} />
          <polyline points="2,24 62,24" fill="none" />
          <polyline points="14,8 22,24 32,60 42,24 50,8" fill="none" />
          <polyline points="22,24 32,8 42,24" fill="none" />
        </g>
      ) : (
        <g>
          <polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill={fill} stroke={locked ? "var(--faint)" : t.dark} strokeWidth="2" />
          {tier === "wood" && !locked && (
            <g stroke="#6e4f2a" strokeOpacity="0.55" strokeWidth="1.3" fill="none">
              <path d="M12 22c10 4 30 -4 40 2" />
              <path d="M10 34c12 5 32 -5 44 1" />
              <path d="M12 45c10 3 28 -3 40 1" />
            </g>
          )}
          <circle cx="32" cy="32" r="17" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1.5" />
        </g>
      )}
      <text x="32" y={tier === "diamond" ? 33 : 39} textAnchor="middle" fontSize={tier === "diamond" ? 15 : 19}
        fontWeight="700" fill={ink}>
        {CATEGORY_INFO[category].glyph}
      </text>
    </svg>
  );
}

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

/** History tab: every achievement, earned or locked, per speech type. */
export function AchievementsView() {
  const list = useAchievements();
  if (!list) return <div className="spinner" />;
  const byId = new Map(list.map((a) => [a.id, a]));
  return (
    <div className="grid">
      <p className="muted">
        Earn a tier the first time a run reaches that level: the overall star rating, or the Structure, Evidence and
        Commentary ratings (#/5) in the Overview. Prepared and on-the-spot speeches are tracked separately.
        {" "}{list.length} of {SPEECH_TYPES.length * CATEGORIES.length * TIERS.length} earned.
      </p>
      {SPEECH_TYPES.map((kind) => (
        <section className="card" key={kind}>
          <h3>{SPEECH_TYPE_NAME[kind]}</h3>
          <div className="ach-table">
            {CATEGORIES.map((cat) => (
              <div className="ach-row" key={cat}>
                <span className="ach-cat">{CATEGORY_INFO[cat].name}</span>
                {TIERS.map((tier, i) => {
                  const a = byId.get(`${kind}:${cat}:${tier}`);
                  const rule = achievementRule({ category: cat, level: i + 1, speechType: kind });
                  return (
                    <button key={tier} className={`ach-cell ${a ? "on" : ""}`} disabled={!a}
                      title={a ? `${rule}. Earned ${a.at ? new Date(a.at).toLocaleDateString() : ""} in “${a.title}”` : `Locked: ${rule}`}
                      onClick={() => a && void openSession(a.sessionId)}>
                      <Badge tier={tier} category={cat} size={44} locked={!a} />
                      <span className="small">{TIER_INFO[tier].name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
