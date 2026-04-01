import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative py-24 pb-20 text-center overflow-hidden">
      {/* Radial glow */}
      <div className="pointer-events-none absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[radial-gradient(ellipse,rgba(249,115,22,0.07)_0%,transparent_65%)]" />

      <div className="max-w-[1100px] mx-auto px-6 relative">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[rgba(249,115,22,0.08)] border border-[rgba(249,115,22,0.15)] text-[12px] font-semibold text-orange-400 tracking-[0.04em] uppercase mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Now supporting 22 Indian languages
        </div>

        {/* Headline */}
        <h1 className="font-['Outfit'] text-[56px] md:text-[56px] text-[36px] font-bold leading-[1.08] tracking-[-0.04em] mb-5 max-w-[700px] mx-auto text-stone-50">
          Your meetings,{' '}
          <span className="bg-gradient-to-br from-orange-500 to-amber-500 bg-clip-text text-transparent">
            finally useful
          </span>
        </h1>

        {/* Description */}
        <p className="text-[18px] leading-relaxed text-stone-400 max-w-[540px] mx-auto mb-9 font-['DM_Sans']">
          EchoBrief records Google Meet, Zoom, and Teams — transcribes in Hindi, Tamil, Telugu, and 19 more languages — then delivers clear summaries to WhatsApp, Slack, or email.
        </p>

        {/* CTAs */}
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 px-[22px] py-[10px] rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_2px_12px_rgba(249,115,22,0.25)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.4)] hover:-translate-y-px transition-all"
          >
            Start recording free
          </Link>
          <button className="inline-flex items-center gap-2 px-[22px] py-[10px] rounded-xl text-sm font-semibold text-orange-400 bg-transparent border border-stone-800 hover:border-orange-500 hover:bg-[rgba(249,115,22,0.06)] transition-all">
            Watch demo
          </button>
        </div>

        {/* Metrics bar */}
        <div className="flex flex-col sm:flex-row justify-center gap-5 sm:gap-12 mt-14 pt-10 border-t border-stone-800">
          <div className="text-center">
            <div className="font-['Outfit'] text-[28px] font-bold text-stone-50 mb-1">
              <span className="text-orange-400">22</span>
            </div>
            <div className="text-[13px] text-stone-500">Indian languages</div>
          </div>
          <div className="text-center">
            <div className="font-['Outfit'] text-[28px] font-bold text-stone-50 mb-1">
              3 <span className="text-[16px] text-stone-500">platforms</span>
            </div>
            <div className="text-[13px] text-stone-500">Meet, Zoom, Teams</div>
          </div>
          <div className="text-center">
            <div className="font-['Outfit'] text-[22px] font-bold text-stone-50 mb-1">
              Slack · WhatsApp · Email
            </div>
            <div className="text-[13px] text-stone-500">Delivery channels</div>
          </div>
        </div>
      </div>
    </section>
  );
}
