import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section
      className="relative text-center overflow-hidden"
      style={{ padding: '100px 0 80px', background: '#0C0A09' }}
    >
      {/* Radial glow — subtle, not a large gradient fill */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: '-100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(ellipse, rgba(249,115,22,0.07) 0%, transparent 65%)',
        }}
      />

      <div className="relative mx-auto max-w-[1100px] px-6">
        {/* Badge — gradient border only, not fill */}
        <div
          className="inline-flex items-center gap-[6px] mb-7"
          style={{
            padding: '6px 16px',
            borderRadius: '100px',
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.15)',
            fontSize: '12px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            color: '#FB923C',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{ width: '6px', height: '6px', background: '#22C55E', animation: 'echoPulse 2s infinite' }}
          />
          Now supporting 22 Indian languages
        </div>

        {/* Headline */}
        <h1
          className="mx-auto mb-5"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 'clamp(36px, 6vw, 56px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.04em',
            color: '#FAFAF9',
            maxWidth: '700px',
          }}
        >
          Your meetings,{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #F97316, #F59E0B)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            finally useful
          </span>
        </h1>

        {/* Sub-headline — no forbidden phrases */}
        <p
          className="mx-auto mb-9"
          style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: '#A8A29E',
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: '540px',
          }}
        >
          EchoBrief records Google Meet, Zoom, and Teams — transcribes in Hindi, Tamil, Telugu,
          and 19 more languages — then delivers clear summaries to WhatsApp, Slack, or email.
        </p>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Primary CTA — gradient on button only */}
          <Link
            to="/auth"
            className="inline-flex items-center no-underline font-medium transition-all duration-200"
            style={{
              padding: '10px 22px',
              fontSize: '14px',
              borderRadius: '12px',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              background: 'linear-gradient(135deg, #F97316, #F59E0B)',
              color: '#fff',
              boxShadow: '0 2px 12px rgba(249,115,22,0.25)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(249,115,22,0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(249,115,22,0.25)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Start recording free
          </Link>

          {/* Ghost CTA — brand spec: transparent bg, Orange 500 text, 1px orange border on hover */}
          <a
            href="#how-it-works"
            className="inline-flex items-center no-underline font-medium transition-all duration-200"
            style={{
              padding: '10px 22px',
              fontSize: '14px',
              borderRadius: '12px',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              background: 'transparent',
              color: '#F97316',
              border: '1px solid #292524',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.border = '1px solid #F97316';
              e.currentTarget.style.background = 'rgba(249,115,22,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.border = '1px solid #292524';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Watch demo
          </a>
        </div>

        {/* Metrics */}
        <div
          className="flex justify-center flex-wrap gap-12 mt-14 pt-10"
          style={{ borderTop: '1px solid #292524' }}
        >
          <div className="text-center">
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '28px', fontWeight: 700, color: '#FAFAF9', marginBottom: '4px' }}>
              <span style={{ color: '#FB923C' }}>22</span>
            </div>
            <div style={{ fontSize: '13px', color: '#78716C', fontFamily: "'DM Sans', sans-serif" }}>Indian languages</div>
          </div>
          <div className="text-center">
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '28px', fontWeight: 700, color: '#FAFAF9', marginBottom: '4px' }}>
              3{' '}
              <span style={{ fontSize: '16px', color: '#78716C' }}>platforms</span>
            </div>
            <div style={{ fontSize: '13px', color: '#78716C', fontFamily: "'DM Sans', sans-serif" }}>Meet, Zoom, Teams</div>
          </div>
          <div className="text-center">
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '22px', fontWeight: 700, color: '#FAFAF9', marginBottom: '4px' }}>
              Slack · WhatsApp · Email
            </div>
            <div style={{ fontSize: '13px', color: '#78716C', fontFamily: "'DM Sans', sans-serif" }}>Delivery channels</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes echoPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}
