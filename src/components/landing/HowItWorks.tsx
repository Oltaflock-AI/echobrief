export function HowItWorks() {
  const steps = [
    {
      num: '1',
      title: 'Connect calendar',
      description: 'Link Google Calendar or Outlook. Takes 30 seconds.',
      bgColor: 'rgba(249,115,22,0.1)',
      textColor: '#FB923C',
      borderColor: 'rgba(249,115,22,0.2)',
    },
    {
      num: '2',
      title: 'Bot auto-joins',
      description: 'EchoBrief joins 2 minutes before your meeting starts. No action needed.',
      bgColor: 'rgba(168,85,247,0.1)',
      textColor: '#A855F7',
      borderColor: 'rgba(168,85,247,0.2)',
    },
    {
      num: '3',
      title: 'AI processes',
      description: 'Real-time transcription in 22 languages. Insight extraction. Speaker attribution.',
      bgColor: 'rgba(59,130,246,0.1)',
      textColor: '#3B82F6',
      borderColor: 'rgba(59,130,246,0.2)',
    },
    {
      num: '4',
      title: 'Summary delivered',
      description: 'Action items, decisions, and risks — sent to WhatsApp, Slack, or email in your language.',
      bgColor: 'rgba(34,197,94,0.1)',
      textColor: '#22C55E',
      borderColor: 'rgba(34,197,94,0.2)',
    },
  ];

  return (
    <section
      id="how-it-works"
      style={{
        padding: '80px 0',
        background: '#1C1917',
        borderTop: '1px solid #292524',
        borderBottom: '1px solid #292524',
      }}
    >
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
            How it works
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
            Four steps. Zero effort.
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
            Connect once, and EchoBrief handles every meeting after that.
          </p>
        </div>

        {/* Steps with gradient connecting line */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0">
          {/* Gradient line connecting steps — desktop only */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute"
            style={{
              top: '36px',
              left: '12.5%',
              right: '12.5%',
              height: '2px',
              background: 'linear-gradient(90deg, #F97316, #F59E0B)',
              opacity: 0.3,
            }}
          />

          {steps.map((step, idx) => (
            <div
              key={idx}
              className="text-center relative"
              style={{ padding: '0 12px' }}
            >
              {/* Step number circle */}
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '24px',
                  fontWeight: 700,
                  position: 'relative',
                  zIndex: 2,
                  background: step.bgColor,
                  color: step.textColor,
                  border: `2px solid ${step.borderColor}`,
                }}
              >
                {step.num}
              </div>

              <h3
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#FAFAF9',
                  marginBottom: '6px',
                }}
              >
                {step.title}
              </h3>

              <p
                style={{
                  fontSize: '12px',
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.5,
                  color: '#A8A29E',
                }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
