import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import echoBriefLogo from '@/assets/echobrief-logo.png';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-white/5">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={echoBriefLogo}
              alt="EchoBrief"
              className="h-9 w-9 rounded-lg object-cover"
            />
            <span className="text-lg font-bold text-white tracking-tight">
              EchoBrief
            </span>
          </Link>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="https://chromewebstore.google.com/detail/echobrief-meeting-recorde/feilmpoccaneccgbkankibcfkamacbag"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-white/5"
              >
                Add to Chrome
              </Button>
            </a>
            <Link to="/auth">
              <Button
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-white/5"
              >
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <Button
                className="bg-[#4C7DFF] hover:bg-[#3d6ae6] text-white font-medium"
                size="sm"
              >
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
