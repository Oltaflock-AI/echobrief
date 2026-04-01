export function Languages() {
  const primaryLanguages = [
    'Hindi',
    'Tamil',
    'Telugu',
    'Bengali',
    'Marathi',
    'Kannada',
    'Malayalam',
    'English (Indian)',
  ];

  const otherLanguages = [
    'Gujarati',
    'Punjabi',
    'Odia',
    'Assamese',
    'Maithili',
    'Sanskrit',
    'Urdu',
    'Konkani',
    'Dogri',
    'Sindhi',
    'Manipuri',
    'Bodo',
    'Santali',
    'Kashmiri',
  ];

  return (
    <section id="languages" style={{ padding: '80px 0', background: '#0C0A09' }}>
      <div className="mx-auto max-w-[1100px] px-6">
        {/* Section header */}
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
            Languages
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
            Speaks your language
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
            Powered by Sarvam Saaras v3 — the highest accuracy STT for Indian languages, with
            native code-mixing support.
          </p>
        </div>

        {/* Language chips */}
        <div
          className="flex flex-wrap justify-center gap-[10px] mx-auto"
          style={{ maxWidth: '700px' }}
        >
          {primaryLanguages.map((lang) => (
            <span
              key={lang}
              className="transition-all duration-200"
              style={{
                padding: '8px 18px',
                borderRadius: '100px',
                border: '1px solid #F97316',
                background: 'rgba(249,115,22,0.08)',
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                color: '#FB923C',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#F97316';
                e.currentTarget.style.color = '#FAFAF9';
                e.currentTarget.style.background = 'rgba(249,115,22,0.12)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#F97316';
                e.currentTarget.style.color = '#FB923C';
                e.currentTarget.style.background = 'rgba(249,115,22,0.08)';
              }}
            >
              {lang}
            </span>
          ))}

          {otherLanguages.map((lang) => (
            <span
              key={lang}
              className="transition-all duration-200"
              style={{
                padding: '8px 18px',
                borderRadius: '100px',
                border: '1px solid #292524',
                background: '#1C1917',
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                color: '#A8A29E',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#F97316';
                e.currentTarget.style.color = '#FAFAF9';
                e.currentTarget.style.background = 'rgba(249,115,22,0.06)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#292524';
                e.currentTarget.style.color = '#A8A29E';
                e.currentTarget.style.background = '#1C1917';
              }}
            >
              {lang}
            </span>
          ))}
        </div>

        {/* Footer note */}
        <p
          className="text-center mt-5"
          style={{
            fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
            color: '#78716C',
          }}
        >
          + Hinglish, Tanglish, and all code-mixed variants handled natively
        </p>
      </div>
    </section>
  );
}
