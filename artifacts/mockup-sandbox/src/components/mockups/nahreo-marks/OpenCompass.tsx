import React from "react";

type MarkProps = {
  size?: number;
  color?: string;
  accent?: string;
  mono?: boolean;
};

function OpenCompassMark({ size = 72, color = "#173F8A", accent = "#FF6B5E", mono = false }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-label="Nahreo Open Compass mark" role="img">
      <path d="M17 59.5V28.8C17 22.3 22.3 17 28.8 17h27.8" stroke={color} strokeWidth="10" strokeLinecap="round" />
      <path d="M29.5 63h21.7C58.3 63 64 57.3 64 50.2V34" stroke={color} strokeWidth="10" strokeLinecap="round" />
      <path d="M47.5 17H63.5V33" stroke={mono ? color : accent} strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M33 45.5L46 32.5" stroke={color} strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="wordmark" style={{ color: dark ? "#F7F9FC" : "#101828" }}>
      <span>Nahreo</span>
      <sup>®</sup>
    </div>
  );
}

function MiniClubCard() {
  return (
    <div className="club-card">
      <div className="club-top">
        <OpenCompassMark size={31} />
        <span>Northcote FC</span>
        <i>›</i>
      </div>
      <div className="club-rule" />
      <p>THIS WEEK</p>
      <div className="fixture"><b>Under 14s</b><span>Training · Thu 5:30</span></div>
      <div className="fixture"><b>First XI</b><span>Match day · Sat 12:10</span></div>
    </div>
  );
}

export function OpenCompass() {
  return (
    <main className="nahreo-board">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box}.nahreo-board{--cobalt:#173F8A;--coral:#FF6B5E;--paper:#F7F9FC;--ink:#101828;--mist:#E8EEF8;min-height:100vh;background:var(--paper);color:var(--ink);font-family:Inter,sans-serif;padding:56px clamp(28px,6vw,96px) 68px;position:relative;overflow:hidden}.nahreo-board:before{content:"";position:absolute;width:520px;height:520px;border:1px solid #dbe4f3;border-radius:50%;right:-270px;top:-270px}.nahreo-board:after{content:"";position:absolute;width:190px;height:190px;border:1px solid #dbe4f3;border-radius:50%;right:118px;bottom:-130px}.topline{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;border-bottom:1px solid #d8e1ee;padding-bottom:32px}.eyebrow,.label{color:var(--cobalt);font-size:10px;font-weight:700;letter-spacing:.15em;line-height:1.4}.eyebrow{margin:0 0 13px}.title{font-family:Manrope,sans-serif;font-weight:800;font-size:clamp(30px,4vw,49px);line-height:1.03;letter-spacing:-.06em;margin:0}.title em{font-style:normal;color:var(--coral)}.direction-note{width:250px;padding-top:2px;font-size:12px;line-height:1.55;color:#48566b}.direction-note strong{color:var(--ink);font-weight:600}.hero{display:grid;grid-template-columns:minmax(310px,1.05fr) minmax(260px,.95fr);gap:clamp(34px,7vw,110px);padding:58px 0 52px;position:relative;z-index:1}.primary{display:flex;align-items:center;gap:25px;min-height:190px}.wordmark{font-family:Manrope,sans-serif;font-weight:800;font-size:clamp(45px,6vw,76px);letter-spacing:-.07em;line-height:.9;white-space:nowrap}.wordmark sup{font:600 10px Inter,sans-serif;letter-spacing:0;vertical-align:top;margin-left:5px}.primary-copy{align-self:end;max-width:310px;margin-bottom:7px;color:#59677c;font-size:13px;line-height:1.65}.primary-copy b{color:var(--ink)}.construction{border-left:1px solid #d8e1ee;padding-left:28px;display:flex;flex-direction:column;justify-content:center}.mark-grid{display:grid;grid-template-columns:84px 1fr;gap:16px 21px;align-items:center}.mark-grid svg{grid-row:span 2}.mark-grid b{font-family:Manrope,sans-serif;font-size:16px;letter-spacing:-.03em}.mark-grid p{font-size:12px;line-height:1.55;margin:-10px 0 0;color:#59677c}.swatches{display:flex;gap:7px;margin-top:20px}.swatches i{width:18px;height:18px;border-radius:50%;display:block}.contexts{border-top:1px solid #d8e1ee;padding-top:33px;position:relative;z-index:1}.context-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:21px}.context-head h2{font:800 15px Manrope,sans-serif;letter-spacing:-.03em;margin:0}.context-head p{font-size:11px;color:#68768a;margin:0}.context-grid{display:grid;grid-template-columns:1.18fr .82fr .82fr 1fr;gap:14px;align-items:stretch}.context{min-height:168px;background:#fff;border:1px solid #dbe4f0;padding:21px;position:relative}.context .label{display:block;margin-bottom:18px}.icon-card{background:var(--cobalt);display:flex;flex-direction:column;justify-content:space-between}.icon-card .label{color:#bfcbea}.icon-square{background:#f7f9fc;width:76px;height:76px;border-radius:19px;display:grid;place-items:center;box-shadow:0 7px 20px rgba(8,33,84,.21)}.icon-caption{font-family:Manrope,sans-serif;color:#f7f9fc;font-size:13px;letter-spacing:-.02em}.small-row{display:flex;align-items:center;gap:14px;margin-top:20px}.small-row span{font:800 27px Manrope,sans-serif;letter-spacing:-.06em}.small-row small{font-size:10px;line-height:1.4;color:#66758a;max-width:100px}.mono-card{background:var(--ink);border-color:var(--ink);color:var(--paper)}.mono-card .label{color:#aebbd0}.mono-lockup{display:flex;gap:11px;align-items:center;margin-top:27px}.mono-lockup .wordmark{font-size:30px}.club-card{background:#fff;border:1px solid #dbe4f0;padding:14px 15px 10px;box-shadow:0 8px 16px rgba(32,55,94,.06);transform:rotate(1.5deg);font-size:8px}.club-top{display:flex;align-items:center;gap:7px;font-weight:700;color:var(--ink);font-size:10px}.club-top i{font-style:normal;margin-left:auto;color:var(--cobalt);font-size:17px}.club-rule{height:1px;background:#e5ebf5;margin:12px 0 10px}.club-card p{font-size:7px;letter-spacing:.12em;color:var(--coral);font-weight:700;margin:0 0 7px}.fixture{border-top:1px solid #eff3f8;padding:6px 0;display:flex;justify-content:space-between;gap:5px}.fixture b{font-size:8px}.fixture span{font-size:7px;color:#66758a;text-align:right}@media(max-width:760px){.nahreo-board{padding:35px 22px}.topline{display:block}.direction-note{margin-top:24px}.hero{grid-template-columns:1fr;padding:40px 0}.primary{min-height:150px;gap:16px}.primary-copy{display:none}.construction{border-left:0;border-top:1px solid #d8e1ee;padding:22px 0 0}.context-grid{grid-template-columns:1fr 1fr}.context:last-child{grid-column:span 2}.context{min-height:150px}}@media(max-width:420px){.context-grid{gap:9px}.context{padding:15px}.wordmark{font-size:42px}.primary svg{width:62px;height:62px}.small-row span{font-size:22px}}
      `}</style>

      <header className="topline">
        <div>
          <p className="eyebrow">IDENTITY DIRECTION / 01</p>
          <h1 className="title">Open <em>Compass</em></h1>
        </div>
        <p className="direction-note"><strong>A calm point forward.</strong><br />An open, asymmetrical form turns coordination into a shared next step — never a command.</p>
      </header>

      <section className="hero" aria-label="Primary Nahreo logo">
        <div className="primary">
          <OpenCompassMark size={156} />
          <div>
            <Wordmark />
          </div>
          <p className="primary-copy"><b>NAH-ree-oh</b><br />For the people keeping community sport moving.</p>
        </div>
        <div className="construction">
          <div className="mark-grid">
            <OpenCompassMark size={84} />
            <b>Open Compass mark</b>
            <p>Two continuous, offset routes create an open place to move toward. The coral corner quietly identifies the next thing that needs attention.</p>
          </div>
          <div className="swatches"><i style={{background:"#173F8A"}} /><i style={{background:"#FF6B5E"}} /><i style={{background:"#101828"}} /><i style={{background:"#F7F9FC",border:"1px solid #d8e1ee"}} /></div>
        </div>
      </section>

      <section className="contexts" aria-label="Brand in context">
        <div className="context-head"><h2>Designed to hold up in the real world</h2><p>From the coach’s pocket to the committee room</p></div>
        <div className="context-grid">
          <div className="context icon-card">
            <span className="label">STANDALONE APP ICON</span>
            <div className="icon-square"><OpenCompassMark size={48} /></div>
            <div className="icon-caption">An open place to begin</div>
          </div>
          <div className="context">
            <span className="label">SMALL-SIZE TEST</span>
            <div className="small-row"><OpenCompassMark size={32} /><span>nahreo</span></div>
            <div className="small-row" style={{marginTop:17}}><OpenCompassMark size={20} /><small>Legible at 20px without asking for attention.</small></div>
          </div>
          <div className="context mono-card">
            <span className="label">ONE COLOUR</span>
            <div className="mono-lockup"><OpenCompassMark size={38} color="#F7F9FC" mono /><Wordmark dark /></div>
          </div>
          <div className="context">
            <span className="label">IN PRODUCT</span>
            <MiniClubCard />
          </div>
        </div>
      </section>
    </main>
  );
}