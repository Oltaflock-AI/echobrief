import { Link } from 'react-router-dom';
import echoBriefLogo from '@/assets/echobrief-logo.png';

export function Footer() {
  return (
    <footer className="py-12 bg-card border-t border-border">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src={echoBriefLogo} alt="EchoBrief" className="h-10 w-10 rounded-lg object-cover" />
            <span className="text-lg font-bold text-foreground">EchoBrief</span>
          </Link>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} EchoBrief. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
