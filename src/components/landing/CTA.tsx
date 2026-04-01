import { Link } from 'react-router-dom';

export function CTA() {
  return (
    <section className="py-20 text-center">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="relative overflow-hidden rounded-3xl p-14 bg-gradient-to-br from-[rgba(249,115,22,0.08)] to-[rgba(245,158,11,0.06)] border border-[rgba(249,115,22,0.15)]">
          {/* Decorative circles */}
          <div className="pointer-events-none absolute top-[-100px] right-[-100px] w-[300px] h-[300px] rounded-full border border-[rgba(249,115,22,0.08)]" />
          <div className="pointer-events-none absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full border border-[rgba(249,115,22,0.05)]" />

          <h2 className="font-['Outfit'] text-[32px] font-semibold tracking-[-0.03em] text-stone-50 mb-3 relative">
            Stop taking notes. Start making decisions.
          </h2>
          <p className="text-[16px] text-stone-400 max-w-[420px] mx-auto mb-8 font-['DM_Sans'] relative">
            Connect your calendar and let EchoBrief handle the rest. Free to start — no credit card required.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[16px] font-semibold text-white bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_2px_12px_rgba(249,115,22,0.25)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.4)] hover:-translate-y-px transition-all relative"
          >
            Start recording free
          </Link>
        </div>
      </div>
    </section>
  );
}
