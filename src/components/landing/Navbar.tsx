import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import echoBriefLogo from '@/assets/echobrief-logo.png';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-primary/80 backdrop-blur-xl border-b border-white/10">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src={echoBriefLogo} alt="EchoBrief" className="h-10 w-10 rounded-lg object-cover" />
            <span className="text-lg font-bold text-white">EchoBrief</span>
          </Link>

          {/* CTA */}
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="accent" size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
