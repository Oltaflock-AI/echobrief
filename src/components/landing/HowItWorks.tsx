export function HowItWorks() {
  return (
    <section className="py-20 bg-stone-900 border-t border-b border-stone-800">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-orange-400 mb-3 text-center">How it works</div>
        <h2 className="font-['Outfit'] text-[36px] font-semibold tracking-[-0.03em] text-center text-stone-50 mb-2">
          Four steps. Zero effort.
        </h2>
        <p className="text-[16px] text-stone-400 text-center max-w-[520px] mx-auto mb-12 font-['DM_Sans']">
          Connect once, and EchoBrief handles every meeting after that.
        </p>

        {/* Steps */}
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-9 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-orange-500 to-amber-500 opacity-30" />

          {/* Step 1 */}
          <div className="text-center relative px-3">
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-5 bg-[rgba(249,115,22,0.1)] border-2 border-[rgba(249,115,22,0.2)] relative z-10">
              <span className="font-['Outfit'] text-[24px] font-bold text-orange-400">1</span>
            </div>
            <h3 className="font-['Outfit'] text-[15px] font-semibold mb-1.5 text-stone-50">Connect calendar</h3>
            <p className="text-[12px] leading-relaxed text-stone-400 font-['DM_Sans']">Link Google Calendar or Outlook. Takes 30 seconds.</p>
          </div>

          {/* Step 2 */}
          <div className="text-center relative px-3">
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-5 bg-[rgba(168,85,247,0.1)] border-2 border-[rgba(168,85,247,0.2)] relative z-10">
              <span className="font-['Outfit'] text-[24px] font-bold text-purple-500">2</span>
            </div>
            <h3 className="font-['Outfit'] text-[15px] font-semibold mb-1.5 text-stone-50">Bot auto-joins</h3>
            <p className="text-[12px] leading-relaxed text-stone-400 font-['DM_Sans']">EchoBrief joins 2 minutes before your meeting starts. No action needed.</p>
          </div>

          {/* Step 3 */}
          <div className="text-center relative px-3">
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-5 bg-[rgba(59,130,246,0.1)] border-2 border-[rgba(59,130,246,0.2)] relative z-10">
              <span className="font-['Outfit'] text-[24px] font-bold text-blue-500">3</span>
            </div>
            <h3 className="font-['Outfit'] text-[15px] font-semibold mb-1.5 text-stone-50">AI processes</h3>
            <p className="text-[12px] leading-relaxed text-stone-400 font-['DM_Sans']">Real-time transcription in 22 languages. Insight extraction. Speaker attribution.</p>
          </div>

          {/* Step 4 */}
          <div className="text-center relative px-3">
            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-5 bg-[rgba(34,197,94,0.1)] border-2 border-[rgba(34,197,94,0.2)] relative z-10">
              <span className="font-['Outfit'] text-[24px] font-bold text-green-500">4</span>
            </div>
            <h3 className="font-['Outfit'] text-[15px] font-semibold mb-1.5 text-stone-50">Summary delivered</h3>
            <p className="text-[12px] leading-relaxed text-stone-400 font-['DM_Sans']">Action items, decisions, and risks — sent to WhatsApp, Slack, or email in your language.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
