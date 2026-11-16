// Dev-only component gallery (open with #gallery in a dev build).
import { Badge, CATEGORIES, TIERS } from "../features/achievements/achievements";
import { Gauge, Radar } from "../features/debrief/charts";
import { Icon, type IconName } from "./icons";
import { Accordion, BracketButton, Corners, ScreenHeader, SegMeter, StatTile, Stepper } from "./kit";
import { LogoLockup, LogoMark } from "./logo";

const ICONS: IconName[] = ["arrowR", "arrowL", "play", "pause", "stop", "rec", "mic", "speaker", "book", "check", "cross", "plus", "lock",
  "crosshair", "target", "medal", "folder", "retry", "shuffle", "idea", "camera", "eye", "gauge", "wave", "sine", "structure", "evidence",
  "commentary", "clarity", "speed", "filler", "voice", "gaze", "trash", "replay", "menu", "audience", "grid", "scan", "flag", "history", "home", "learn", "warn"];

export default function Gallery() {
  return (
    <div className="page stagger">
      <ScreenHeader title="Gallery">
        <button className="btn ghost" onClick={() => (location.hash = "")}>Close <Icon name="cross" size={14} /></button>
      </ScreenHeader>
      <div className="row" style={{ gap: 32, flexWrap: "wrap" }}>
        <LogoMark size={96} /><LogoMark size={32} /><LogoMark size={16} /><LogoLockup size={40} />
      </div>
      <div className="tiles">
        <StatTile value="250+" label="Sessions logged" tone="signal" />
        <StatTile value="15+" label="Skills tracked" />
        <StatTile value="98%" label="On-device" tone="paper" />
        <StatTile value="500+" label="Minutes spoken" tone="concrete" />
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn primary big">Start session <Icon name="arrowR" size={14} className="arw" /></button>
        <button className="btn">Secondary <Icon name="arrowR" size={14} className="arw" /></button>
        <button className="btn ghost">Ghost</button>
        <BracketButton><Icon name="arrowL" size={14} /> PREV</BracketButton>
        <button className="icon-btn"><Icon name="speaker" size={14} /> Play</button>
        <span className="pill ok"><span className="dot" /> Online</span>
        <span className="tag good">Good</span><span className="tag bad">Bad</span><span className="tag">Neutral</span>
      </div>
      <Stepper index={2} total={9} onPrev={() => {}} onNext={() => {}} label="STEP" />
      <div className="row"><SegMeter value={0.7} /><SegMeter value={0.4} tone="signal" /><SegMeter value={0.2} tone="bad" /></div>
      <div>
        <Accordion index={1} title="Quality execution">Hairline rows, a + that rotates to ×, an index on the left.</Accordion>
        <Accordion index={2} title="Precise delivery">Second row.</Accordion>
      </div>
      <div className="gallery-grid">
        <div className="card"><Corners /><h2>Card</h2><p className="muted">Hover: corners slide out, scanline, light.</p></div>
        <div className="card alt"><h2>Alt cut</h2><p className="muted">Two opposite corners.</p></div>
        <div className="card light"><h2>Light</h2><p className="muted">Paper surface.</p></div>
      </div>
      <div className="row" style={{ gap: 40, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Gauge score={78} grade="B+" />
        <Radar axes={[["Content", 72], ["Structure", 64], ["Engagement", 81], ["Pace", 55], ["Fillers", 90], ["Voice", 47], ["Eye", 68]]} />
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 18 }}>
        {TIERS.map((t, i) => <Badge key={t} tier={t} category={CATEGORIES[i % 4]} size={110} serial={i + 1} unlock />)}
        <Badge tier="gold" category="overall" size={110} locked />
      </div>
      <div className="gallery-icons">
        {ICONS.map((n) => <div key={n}><Icon name={n} size={24} /><span className="micro">{n}</span></div>)}
      </div>
    </div>
  );
}
