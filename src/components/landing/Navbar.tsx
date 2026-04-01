import { Link } from 'react-router-dom';

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-stone-800 bg-[rgba(12,10,9,0.85)] backdrop-blur-[16px]">
      <div className="max-w-[1100px] mx-auto px-6 py-[18px] flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-[10px] no-underline">
          <svg width="32" height="32" viewBox="0 0 32 32" className="flex-shrink-0">
            <defs>
              <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="14" fill="none" stroke="url(#ng)" strokeWidth="1.2" opacity="0.25" />
            <circle cx="16" cy="16" r="9" fill="none" stroke="url(#ng)" strokeWidth="1.2" opacity="0.55" />
            <circle cx="16" cy="16" r="4.5" fill="url(#ng)" />
          </svg>
          <span className="font-['Outfit'] font-semibold text-[18px] text-stone-50 tracking-[-0.3px]">
            echo<em className="not-italic text-orange-400">brief</em>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-7">
          <a href="#features" className="text-sm text-stone-400 hover:text-stone-50 transition-colors">Features</a>
          <a href="#languages" className="text-sm text-stone-400 hover:text-stone-50 transition-colors">Languages</a>
          <a href="#pricing" className="text-sm text-stone-400 hover:text-stone-50 transition-colors">Pricing</a>
          <a href="#docs" className="text-sm text-stone-400 hover:text-stone-50 transition-colors">Docs</a>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 px-[18px] py-2 rounded-xl text-[13px] font-semibold text-white bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_2px_12px_rgba(249,115,22,0.25)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.4)] hover:-translate-y-px transition-all"
          >
            Get started free
          </Link>
        </div>
      </div>
    </nav>
  );
}
