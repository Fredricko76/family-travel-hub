import React from 'react';
import { landing } from '../landing';

type Props = { dates: string | null; onEnter: () => void };

/**
 * Full-screen welcome page for the web build: an American skyline at sunset in
 * red, white, blue and gold, the family's name, and one button into the plan.
 */
export function LandingScreen({ dates, onEnter }: Props) {
  return (
    <div style={styles.root} role="main">
      <svg viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice" style={styles.scene} aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1F4D" />
            <stop offset="0.45" stopColor="#1F3C88" />
            <stop offset="0.72" stopColor="#C8102E" />
            <stop offset="0.9" stopColor="#F2A93B" />
          </linearGradient>
          <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFE08A" />
            <stop offset="1" stopColor="#F2A93B" />
          </linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F2A93B" />
            <stop offset="0.3" stopColor="#C8102E" />
            <stop offset="1" stopColor="#0B1F4D" />
          </linearGradient>
        </defs>
        <rect width="800" height="1200" fill="url(#sky)" />
        <g fill="#fff" opacity="0.9">
          <circle cx="90" cy="120" r="2" /><circle cx="210" cy="70" r="1.5" /><circle cx="330" cy="150" r="2.2" />
          <circle cx="480" cy="60" r="1.6" /><circle cx="560" cy="180" r="2" /><circle cx="690" cy="90" r="1.8" />
          <circle cx="740" cy="230" r="1.4" /><circle cx="150" cy="260" r="1.6" /><circle cx="420" cy="240" r="1.3" />
          <circle cx="620" cy="300" r="1.5" /><circle cx="60" cy="340" r="1.2" /><circle cx="300" cy="330" r="1.4" />
        </g>
        <circle cx="560" cy="790" r="150" fill="url(#sun)" />
        <g fill="#0B1F4D">
          <rect x="30" y="700" width="70" height="240" />
          <rect x="110" y="760" width="40" height="180" />
          <rect x="160" y="640" width="60" height="300" />
          <rect x="180" y="600" width="20" height="40" />
          <rect x="235" y="720" width="80" height="220" />
          <rect x="330" y="560" width="30" height="380" />
          <rect x="335" y="520" width="20" height="40" />
          <rect x="342" y="470" width="6" height="50" />
          <rect x="375" y="690" width="60" height="250" />
          <rect x="450" y="740" width="45" height="200" />
          <rect x="640" y="680" width="70" height="260" />
          <rect x="720" y="750" width="60" height="190" />
        </g>
        <g fill="#0B1F4D" transform="translate(520 640) scale(1.15)">
          <rect x="0" y="180" width="90" height="80" />
          <rect x="15" y="150" width="60" height="30" />
          <rect x="30" y="80" width="30" height="70" />
          <circle cx="45" cy="70" r="16" />
          <path d="M45 54 l-6 -18 l6 6 l6 -6 z M33 60 l-14 -12 l12 4 z M57 60 l14 -12 l-12 4 z" />
          <rect x="60" y="40" width="7" height="50" transform="rotate(-20 63 90)" />
          <path d="M60 30 l7 -12 l7 12 l-4 4 l-6 0 z" />
          <rect x="18" y="95" width="10" height="45" transform="rotate(25 23 95)" />
        </g>
        <g fill="#0B1F4D">
          <rect x="20" y="960" width="760" height="240" />
        </g>
        <g fill="#0B1F4D">
          <path d="M700 960 c 0 -70 -10 -120 -20 -160" stroke="#0B1F4D" strokeWidth="10" fill="none" />
          <path d="M680 800 c -40 -30 -80 -30 -110 -10 c 40 -10 80 0 110 10 z" />
          <path d="M680 800 c 30 -40 70 -50 100 -40 c -40 0 -70 20 -100 40 z" />
          <path d="M680 800 c -10 -50 10 -90 40 -100 c -20 30 -30 60 -40 100 z" />
          <path d="M680 800 c 10 -50 -20 -90 -50 -95 c 20 30 30 55 50 95 z" />
          <path d="M760 960 c 0 -60 -8 -100 -14 -130" stroke="#0B1F4D" strokeWidth="8" fill="none" />
          <path d="M746 830 c -30 -25 -60 -25 -85 -8 c 30 -8 60 0 85 8 z" />
          <path d="M746 830 c 25 -32 55 -40 80 -32 c -32 0 -56 16 -80 32 z" />
          <path d="M746 830 c -8 -40 8 -70 32 -80 c -16 24 -24 48 -32 80 z" />
        </g>
        <rect x="0" y="940" width="800" height="24" fill="url(#sea)" />
        <g opacity="0.95">
          <rect x="0" y="1060" width="800" height="24" fill="#C8102E" />
          <rect x="0" y="1084" width="800" height="24" fill="#fff" />
          <rect x="0" y="1108" width="800" height="24" fill="#C8102E" />
          <rect x="0" y="1132" width="800" height="24" fill="#fff" />
          <rect x="0" y="1156" width="800" height="44" fill="#C8102E" />
          <rect x="0" y="1060" width="300" height="96" fill="#1F3C88" />
          <g fill="#fff">
            <circle cx="40" cy="1084" r="5" /><circle cx="90" cy="1084" r="5" /><circle cx="140" cy="1084" r="5" /><circle cx="190" cy="1084" r="5" /><circle cx="240" cy="1084" r="5" />
            <circle cx="65" cy="1108" r="5" /><circle cx="115" cy="1108" r="5" /><circle cx="165" cy="1108" r="5" /><circle cx="215" cy="1108" r="5" />
            <circle cx="40" cy="1132" r="5" /><circle cx="90" cy="1132" r="5" /><circle cx="140" cy="1132" r="5" /><circle cx="190" cy="1132" r="5" /><circle cx="240" cy="1132" r="5" />
          </g>
        </g>
      </svg>

      <div style={styles.content}>
        <p style={styles.family}>{landing.family}</p>
        <h1 style={styles.headline}>{landing.headline}</h1>
        <p style={styles.destination}>{landing.destination}</p>
        {dates ? <p style={styles.dates}>{dates}</p> : null}
        <p style={styles.tagline}>{landing.tagline}</p>
        <button type="button" onClick={onEnter} style={styles.button}>
          {landing.enter}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, overflow: 'hidden', background: '#0B1F4D', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  scene: { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  content: {
    position: 'relative',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px 28px calc(48px + env(safe-area-inset-bottom))',
    color: '#fff',
    textShadow: '0 2px 12px rgba(0,0,0,0.45)',
    boxSizing: 'border-box',
  },
  family: { margin: 0, fontSize: 18, letterSpacing: 6, textTransform: 'uppercase', fontWeight: 600, color: '#FFE08A' },
  headline: { margin: '6px 0 0', fontSize: 'clamp(38px, 9vw, 64px)', lineHeight: 1.05, fontWeight: 800, letterSpacing: -1 },
  destination: {
    margin: '14px 0 0',
    fontSize: 'clamp(72px, 24vw, 160px)',
    lineHeight: 0.95,
    fontWeight: 900,
    letterSpacing: 6,
    background: 'linear-gradient(180deg, #fff 0%, #FFE08A 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    textShadow: 'none',
    filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.5))',
  },
  dates: { margin: '14px 0 0', fontSize: 18, fontWeight: 600, color: '#fff' },
  tagline: { margin: '10px 0 0', fontSize: 16, color: 'rgba(255,255,255,0.85)', maxWidth: 360 },
  button: {
    marginTop: 34,
    padding: '18px 30px',
    fontSize: 18,
    fontWeight: 700,
    color: '#0B1F4D',
    background: '#FFE08A',
    border: 0,
    borderRadius: 999,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
