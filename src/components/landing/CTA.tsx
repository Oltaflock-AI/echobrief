import { Link } from 'react-router-dom';

export function CTA() {
  return (
    <section className="text-center" style={{ padding: '80px 0', background: '#0C0A09' }}>
      <div className="mx-auto max-w-[1100px] px-6">
        <div
          className="relative overflow-hidden"
          style={{
            padding: '56px 40px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(245,158,11,0.06))',
            border: '1px solid rgba(249,115,22,0.15)',
          }}
        >
          {/* Decorative rings — subtle accents, not overwhelming */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              top: '-100px',
              right: '-100px',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              border: '1px solid rgba(249,115,22,0.08)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              top: '-50px',
              right: '-50px',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              border: '1px solid rgba(249,115,22,0.05)',
            }}
          />

          <div className="relative">
            <h2
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '32px',
                fontWeight: 600,
                letterSpacing: '-0.03em',
                color: '#FAFAF9',
                marginBottom: '12px',
              }}
            >
              Stop taking notes. Start making decisions.
            </h2>

            <p
              className="mx-auto mb-8"
              style={{
                fontSize: '16px',
                fontFamily: "'DM Sans', sans-serif",
                color: '#A8A29E',
                maxWidth: '420px',
              }}
            >
              Connect your calendar and let EchoBrief handle the rest. Free to start — no credit card
              required.
            </p>

            <Link
              to="/auth"
              className="inline-flex items-center no-underline font-medium transition-all duration-200"
              style={{
                padding: '14px 32px',
                fontSize: '16px',
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
          </div>
        </div>
      </div>
    </section>
  );
}
