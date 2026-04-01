import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-stone-800 py-10">
      <div className="max-w-[1100px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-[13px] text-stone-500 font-['DM_Sans']">
          EchoBrief by OltaFlock AI — 2026
        </p>
        <div className="flex gap-6">
          <Link to="/privacy" className="text-[13px] text-stone-500 hover:text-stone-400 transition-colors">Privacy</Link>
          <Link to="/terms" className="text-[13px] text-stone-500 hover:text-stone-400 transition-colors">Terms</Link>
          <a href="#docs" className="text-[13px] text-stone-500 hover:text-stone-400 transition-colors">Docs</a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-[13px] text-stone-500 hover:text-stone-400 transition-colors">Twitter</a>
        </div>
      </div>
    </footer>
  );
}
