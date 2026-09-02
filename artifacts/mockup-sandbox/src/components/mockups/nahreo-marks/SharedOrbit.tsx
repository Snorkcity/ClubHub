import { useState } from "react";

type MarkProps = {
  size?: number;
  mono?: boolean;
  inverse?: boolean;
};

function SharedOrbitMark({ size = 72, mono = false, inverse = false }: MarkProps) {
  const cobalt = inverse || mono ? "currentColor" : "#173F8A";
  const coral = mono ? "currentColor" : "#FF6B5E";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="Nahreo Shared Orbit mark" role="img">
      <path d="M20 57.5C20 36.5 35.8 21 56 21c9.5 0 17.9 3.4 24.4 9.5" stroke={cobalt} strokeWidth="12" strokeLinecap="round" />
      <path d="M80 42.5C80 63.5 64.2 79 44 79c-9.5 0-17.9-3.4-24.4-9.5" stroke={cobalt} strokeWidth="12" strokeLinecap="round" />
      <path d="M72.7 26.2 79.9 31.5 76.2 39.2" stroke={coral} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m27.3 73.8-7.2-5.3 3.7-7.7" stroke={coral} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="7" fill={coral} />
    </svg>
  );
}

function Wordmark({ mono = false, inverse = false }: { mono?: boolean; inverse?: boolean }) {
  return (
    <div className={`wordmark ${inverse ? "inverse" : ""} ${mono ? "mono" : ""}`}>
      <SharedOrbitMark size={42} mono={mono} inverse={inverse} />
      <span>nahreo</span>
    </div>
  );
}

export function SharedOrbit() {
  const [mono, setMono] = useState(false);
  const [active, setActive] = useState<"lockup" | "icon" | "small">("lockup");
  return (
    <main className={`nahreo-board ${mono ? "mono-mode" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        .nahreo-board { --cobalt:#173F8A; --coral:#FF6B5E; --paper:#F7F9FC; --ink:#101828; --line:#D8E0EC; min-height:100vh; background:var(--paper); color:var(--ink); font-family:Inter, sans-serif; padding:20px; box-sizing:border-box; overflow:hidden; }
        .nahreo-board * { box-sizing:border-box; } .nahreo-board button { font:inherit; cursor:pointer; }
        .top { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:14px; }
        .eyebrow { color:var(--cobalt); font-size:10px; line-height:1.2; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
        .toggle { border:1px solid var(--line); background:#fff; border-radius:999px; padding:3px; display:flex; gap:2px; }
        .toggle button { border:0; background:transparent; color:#536277; padding:6px 9px; border-radius:99px; font-size:10px; font-weight:700; }
        .toggle button.selected { background:var(--cobalt); color:white; }
        .heading { padding:20px 0 15px; display:flex; justify-content:space-between; gap:15px; align-items:flex-end; }
        h1 { font-family:Manrope, sans-serif; font-size:32px; line-height:.95; letter-spacing:-.07em; margin:0; font-weight:800; color:var(--cobalt); }
        .pronunciation { font-size:10px; line-height:1.45; max-width:150px; color:#59687c; } .pronunciation b{ color:var(--ink); }
        .hero { background:#fff; border:1px solid var(--line); border-radius:18px; padding:18px; display:grid; grid-template-columns:1fr 1.15fr; gap:15px; min-height:206px; position:relative; overflow:hidden; }
        .hero::after { content:""; position:absolute; width:190px;height:190px;border:1px solid rgba(23,63,138,.09);border-radius:50%; right:-81px;bottom:-115px; }
        .hero-mark { display:flex; align-items:center; justify-content:center; background:#F0F4FB; border-radius:13px; position:relative; z-index:1; }
        .hero-mark svg { width:112px;height:112px; }
        .hero-copy { position:relative;z-index:1; display:flex; flex-direction:column; justify-content:space-between; }
        .wordmark { color:var(--cobalt); display:flex; align-items:center; gap:9px; } .wordmark span { font-family:Manrope,sans-serif; font-size:28px; letter-spacing:-.075em; font-weight:800; } .wordmark svg{flex:none}
        .hero-copy p { font-family:Manrope,sans-serif; font-size:13px; line-height:1.45; letter-spacing:-.025em; margin:8px 0; max-width:210px; font-weight:600; }
        .rule { font-size:10px; color:#637187; line-height:1.4; } .rule strong { color:var(--coral); font-weight:700; }
        .tabbar { display:flex; margin:16px 0 10px; gap:5px; } .tabbar button { flex:1; border:1px solid var(--line); border-radius:8px; background:transparent; padding:8px 3px; color:#5e6b7b; font-size:10px; font-weight:700; }
        .tabbar button.active { color:white;background:var(--cobalt);border-color:var(--cobalt); }
        .contexts { display:grid;grid-template-columns:1.06fr .94fr;gap:10px; }
        .context { border:1px solid var(--line); background:white; border-radius:14px; min-height:148px; overflow:hidden; position:relative; }
        .context-title { color:#657489; font-size:9px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;padding:12px 12px 0; }
        .app-icon { background:var(--cobalt); width:72px;height:72px;border-radius:19px; display:grid;place-items:center;margin:13px auto 0; color:white; box-shadow:0 8px 14px rgba(23,63,138,.18); }
        .app-icon svg { width:51px;height:51px; } .app-icon .mark-dot { color:var(--coral); }
        .small-row { display:flex; align-items:end; justify-content:center; gap:21px;height:102px;padding:10px 8px 12px; }
        .small-item { display:flex;flex-direction:column;align-items:center;gap:8px;color:#536277;font-size:9px;font-weight:600; } .small-item svg { display:block; }
        .mono-sample { background:var(--ink); color:white; margin-top:13px; height:82px;display:flex;align-items:center;justify-content:center; } .mono-sample .wordmark { color:white; transform:scale(.84); }
        .footer { display:flex;justify-content:space-between;align-items:center;padding-top:12px;color:#68778c;font-size:9px;line-height:1.4; } .footer b{color:var(--cobalt)}
        .mono-mode .hero-mark,.mono-mode .app-icon { background:var(--ink);color:white; } .mono-mode .app-icon{box-shadow:none} .mono-mode .hero { border-color:#B8C2D2; } .mono-mode .wordmark { color:var(--ink); }
        @media (max-width:460px){.nahreo-board{padding:16px}.heading{padding-top:17px}.hero{padding:14px;gap:10px}.hero-mark svg{width:92px;height:92px}.wordmark span{font-size:24px}.hero-copy p{font-size:12px}.contexts{gap:8px}}
      `}</style>
      <header className="top">
        <div className="eyebrow">Identity study / 01</div>
        <div className="toggle" aria-label="Colour mode">
          <button className={!mono ? "selected" : ""} onClick={() => setMono(false)}>Colour</button>
          <button className={mono ? "selected" : ""} onClick={() => setMono(true)}>One colour</button>
        </div>
      </header>

      <section className="heading">
        <div><div className="eyebrow" style={{ marginBottom: 7 }}>Shared Orbit</div><h1>Nahreo</h1></div>
        <div className="pronunciation"><b>NAH-ree-oh</b><br />For every person who keeps the club moving.</div>
      </section>

      <section className="hero">
        <div className="hero-mark"><SharedOrbitMark size={122} mono={mono} inverse={mono} /></div>
        <div className="hero-copy">
          <Wordmark mono={mono} />
          <p>Open motion around one reliable centre.</p>
          <div className="rule"><strong>Not a ring.</strong> Two paths keep arriving, leaving room for the next person in.</div>
        </div>
      </section>

      <nav className="tabbar" aria-label="Mark contexts">
        <button className={active === "lockup" ? "active" : ""} onClick={() => setActive("lockup")}>Lockup</button>
        <button className={active === "icon" ? "active" : ""} onClick={() => setActive("icon")}>App icon</button>
        <button className={active === "small" ? "active" : ""} onClick={() => setActive("small")}>At small sizes</button>
      </nav>

      <section className="contexts">
        <article className="context">
          <div className="context-title">{active === "icon" ? "App home" : "Primary lockup"}</div>
          {active === "icon" ? <div className="app-icon"><SharedOrbitMark size={55} mono inverse /></div> : <div style={{ padding: "27px 18px" }}><Wordmark mono={mono} /></div>}
          {active === "small" && <div className="small-row">
            {[20, 16, 12].map((n) => <div className="small-item" key={n}><SharedOrbitMark size={n * 2} mono={mono} /><span>{n}px</span></div>)}
          </div>}
        </article>
        <article className="context">
          <div className="context-title">Reverse / one ink</div>
          <div className="mono-sample"><Wordmark mono inverse /></div>
          <div style={{ padding: "8px 12px", color: "#68778c", fontSize: 9, lineHeight: 1.35 }}>The mark is drawn to keep its centre and open ends intact when colour is unavailable.</div>
        </article>
      </section>
      <footer className="footer"><span><b>System logic</b> / orbit · centre · arrival</span><span>#173F8A · #FF6B5E</span></footer>
    </main>
  );
}