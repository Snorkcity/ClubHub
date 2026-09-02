import type { CSSProperties } from "react";

const cobalt = "#173F8A";
const coral = "#FF6B5E";
const paper = "#F7F9FC";
const ink = "#101828";

function PathsMark({ size = 84, mono = "color" }: { size?: number; mono?: "color" | "cobalt" | "ink" }) {
  const blue = mono === "color" ? cobalt : mono === "cobalt" ? cobalt : ink;
  const warm = mono === "color" ? coral : mono === "cobalt" ? cobalt : ink;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-label="Nahreo converging paths mark" role="img">
      <path d="M16 22C29 22 33 29 40 39C47 49 52 54 72 54" stroke={blue} strokeWidth="11" strokeLinecap="round" />
      <path d="M16 74C29 74 34 67 40 57C47 47 52 42 72 42" stroke={warm} strokeWidth="11" strokeLinecap="round" />
      <path d="M72 42V54" stroke={blue} strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}

function Lockup({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  const wordStyle: CSSProperties = {
    color: inverse ? paper : ink,
    fontFamily: "'Manrope', sans-serif",
    fontSize: compact ? 26 : 42,
    fontWeight: 800,
    letterSpacing: "-0.07em",
    lineHeight: 1,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 10 : 15 }}>
      <PathsMark size={compact ? 38 : 60} mono={inverse ? "ink" : "color"} />
      <span style={wordStyle}>nahreo</span>
    </div>
  );
}

const captionStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  color: "#5A6880",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export function ConvergingPaths() {
  return (
    <main style={{ minHeight: "100vh", background: paper, color: ink, fontFamily: "'Inter', sans-serif", padding: "clamp(24px, 5vw, 72px)", boxSizing: "border-box" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" />
      <style>{`
        * { box-sizing: border-box; }
        .nahreo-grid { display:grid; grid-template-columns: minmax(0,1.25fr) minmax(290px,.75fr); gap: clamp(28px,5vw,76px); }
        .nahreo-card { border:1px solid #D7DFEB; border-radius:18px; background:#FCFDFE; }
        .nahreo-swatch:hover { transform:translateY(-3px); }
        @media (max-width: 760px) { .nahreo-grid { grid-template-columns:1fr; } .nahreo-intro { margin-bottom:42px !important; } }
      `}</style>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #D7DFEB", paddingBottom: 19, marginBottom: "clamp(42px,7vw,90px)" }}>
        <div style={{ ...captionStyle, color: cobalt }}>Identity direction / 01</div>
        <div style={{ ...captionStyle, letterSpacing: "0.08em" }}>NAH-ree-oh</div>
      </header>

      <section className="nahreo-grid nahreo-intro" style={{ marginBottom: "clamp(48px,8vw,104px)" }}>
        <div>
          <p style={{ ...captionStyle, margin: "0 0 18px", color: coral }}>Converging paths</p>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: "clamp(45px,6.2vw,84px)", lineHeight: 0.98, letterSpacing: "-0.075em", maxWidth: 790, margin: 0, fontWeight: 800 }}>
            Many moving parts.<br /><span style={{ color: cobalt }}>One clear way forward.</span>
          </h1>
        </div>
        <div style={{ alignSelf: "end", paddingBottom: 4 }}>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "#41516C", maxWidth: 360, margin: 0 }}>
            A fluid joining of schedules, families, teams and volunteers. The mark avoids the usual sporting shorthand in favour of a simple, durable idea: scattered paths arriving in step.
          </p>
          <div style={{ marginTop: 22, height: 3, width: 88, background: coral, borderRadius: 10 }} />
        </div>
      </section>

      <section className="nahreo-grid" style={{ alignItems: "stretch", marginBottom: "clamp(52px,8vw,96px)" }}>
        <div className="nahreo-card" style={{ minHeight: 300, padding: "clamp(25px,4vw,54px)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={captionStyle}>Primary lockup</div>
          <Lockup />
          <p style={{ margin: 0, maxWidth: 480, color: "#5A6880", lineHeight: 1.55, fontSize: 13 }}>The two path strokes meet without colliding. A firm central join gives the motion a sense of coordination and trust.</p>
        </div>
        <div style={{ background: cobalt, borderRadius: 18, padding: "clamp(25px,4vw,54px)", minHeight: 300, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ ...captionStyle, color: "#BFCDE8" }}>App icon / inverse context</div>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ width: 102, height: 102, borderRadius: 25, background: coral, display: "grid", placeItems: "center" }}>
              <PathsMark size={70} mono="ink" />
            </div>
            <div style={{ color: paper, fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "-0.05em", maxWidth: 155, lineHeight: 1.05 }}>Club day, without the scramble.</div>
          </div>
          <Lockup inverse compact />
        </div>
      </section>

      <section style={{ borderTop: "1px solid #D7DFEB", paddingTop: 25, display: "grid", gridTemplateColumns: "minmax(170px,.7fr) minmax(0,1.7fr)", gap: "clamp(25px,5vw,76px)" }}>
        <div>
          <p style={{ ...captionStyle, marginTop: 0 }}>Built to hold up</p>
          <p style={{ color: "#5A6880", fontSize: 13, lineHeight: 1.55, maxWidth: 200 }}>The geometry stays legible where clubs need it most: screens, shirts, signage, and Saturday-morning messages.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
          <div className="nahreo-card" style={{ padding: 20, minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={captionStyle}>16 px test</span>
            <PathsMark size={26} />
            <span style={{ fontSize: 12, color: "#5A6880" }}>Clear at favicon scale</span>
          </div>
          <div className="nahreo-card" style={{ padding: 20, minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={captionStyle}>One colour</span>
            <PathsMark size={57} mono="cobalt" />
            <span style={{ fontSize: 12, color: "#5A6880" }}>Stamps &amp; embroidery</span>
          </div>
          <div style={{ padding: 20, minHeight: 148, borderRadius: 18, background: ink, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span style={{ ...captionStyle, color: "#9DACC3" }}>Ink field</span>
            <PathsMark size={57} mono="cobalt" />
            <span style={{ fontSize: 12, color: "#C7D1E0" }}>Single ink reproduction</span>
          </div>
        </div>
      </section>

      <footer style={{ display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap", marginTop: 54, paddingTop: 18, borderTop: "1px solid #D7DFEB" }}>
        <span style={captionStyle}>Australian club coordination, made dependable.</span>
        <div style={{ display: "flex", gap: 9 }}>
          {[cobalt, coral, paper, ink].map((color) => <span key={color} className="nahreo-swatch" style={{ width: 20, height: 20, borderRadius: 5, background: color, border: color === paper ? "1px solid #D7DFEB" : "none", transition: "transform .2s ease" }} />)}
        </div>
      </footer>
    </main>
  );
}

export default ConvergingPaths;