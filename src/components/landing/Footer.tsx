import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer style={{ padding: '40px 0', borderTop: '1px solid #292524', background: '#0C0A09' }}>
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-[10px] no-underline" style={{ textDecoration: 'none' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0 }}>
              <defs>
                <linearGradient id="footer-ng" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F97316" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="none" stroke="url(#footer-ng)" strokeWidth="1.2" opacity="0.25" />
              <circle cx="16" cy="16" r="9" fill="none" stroke="url(#footer-ng)" strokeWidth="1.2" opacity="0.55" />
              <circle cx="16" cy="16" r="4.5" fill="url(#footer-ng)" />
            </svg>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: '18px', color: '#FAFAF9', letterSpacing: '-0.3px' }}>
              echo<em style={{ fontStyle: 'normal', color: '#FB923C' }}>brief</em>
            </span>
          </Link>

          {/* Links */}
          <div className="flex flex-wrap items-center gap-6">
            <p style={{ fontSize: '13px', fontFamily: "'DM Sans', sans-serif", color: '#78716C', margin: 0 }}>
              EchoBrief by OltaFlock AI — 2026
            </p>
            {['Privacy', 'Terms', 'Docs', 'Twitter'].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                style={{
                  fontSize: '13px',
                  fontFamily: "'DM Sans', sans-serif",
                  color: '#78716C',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A8A29E')}
                onMouseLeave={e => (e.currentTarget.style.color = '#78716C')}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
