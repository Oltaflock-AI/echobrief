export function Features() {
  const features = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FB923C" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      ),
      title: 'Auto-join and record',
      description: 'Connect your calendar. EchoBrief's bot joins your meetings automatically — Google Meet, Zoom, or Teams. No extensions, no manual triggers.',
      color: 'rgba(249,115,22,0.1)',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2" strokeLinecap="round">
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        </svg>
      ),
      title: '22 Indian languages',
      description: 'Powered by Sarvam Saaras v3 — the best STT for Indian languages. Handles Hinglish, Tanglish, and code-mixing natively. Summaries in your language.',
      color: 'rgba(168,85,247,0.1)',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
        </svg>
      ),
      title: 'Decision-grade insights',
      description: 'Executive summary, action items with owners, risk flags, strategic insights, and a timestamped timeline. Not just a transcript dump.',
      color: 'rgba(34,197,94,0.1)',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: 'Speaker attribution',
      description: 'Knows who said what. Diarization maps speakers to names from your calendar invite. Action items get assigned to the right person.',
      color: 'rgba(59,130,246,0.1)',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FB923C" strokeWidth="2" strokeLinecap="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
      title: 'WhatsApp delivery',
      description: 'Summaries go where your team already is. Get meeting briefs on WhatsApp in your preferred language — Hindi summary to the Delhi team, Tamil to Chennai.',
      color: 'rgba(249,115,22,0.1)',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: 'Data stays in India',
      description: 'Audio processed via Sarvam's sovereign Indian cloud. DPDP Act compliant. Your meeting data never leaves the country.',
      color: 'rgba(34,197,94,0.1)',
    },
  ];

  return (
    <section id="features" style={{ padding: '80px 0', background: '#0C0A09' }}>
      <div className="mx-auto max-w-[1100px] px-6">
        {/* Section header with 4px gradient bar */}
        <div className="text-center mb-12">
          <div
            style={{
              fontSize: '11px',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#FB923C',
              marginBottom: '12px',
            }}
          >
            Features
          </div>
          <h2
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: '36px',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: '#FAFAF9',
              marginBottom: '8px',
            }}
          >
            Not just transcripts. Decisions.
          </h2>
          <p
            style={{
              fontSize: '16px',
              fontFamily: "'DM Sans', sans-serif",
              color: '#A8A29E',
              maxWidth: '520px',
              margin: '0 auto',
            }}
          >
            EchoBrief acts as your chief of staff — extracting what matters from every meeting.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="group transition-all duration-250"
              style={{
                padding: '28px 24px',
                borderRadius: '16px',
                border: '1px solid #292524',
                background: '#1C1917',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#44403C';
                e.currentTarget.style.background = '#292524';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#292524';
                e.currentTarget.style.background = '#1C1917';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* 4px gradient bar at top — signature detail */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: 'linear-gradient(90deg, #F97316, #F59E0B)',
                  opacity: 0,
                  transition: 'opacity 0.25s',
                }}
                className="group-hover:opacity-100"
              />

              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  background: feature.color,
                }}
              >
                {feature.icon}
              </div>

              <h3
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '16px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: '#FAFAF9',
                  marginBottom: '6px',
                }}
              >
                {feature.title}
              </h3>

              <p
                style={{
                  fontSize: '13px',
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.6,
                  color: '#A8A29E',
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
