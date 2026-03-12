import { Link } from 'react-router-dom';
import echoBriefLogo from '@/assets/echobrief-logo.png';

export function Footer() {
  return (
    <footer className="py-12 bg-card border-t border-border">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={echoBriefLogo}
              alt="EchoBrief"
              className="h-9 w-9 rounded-lg object-cover"
            />
            <span className="text-lg font-bold text-foreground">EchoBrief</span>
          </Link>

          <div className="flex flex-wrap items-center gap-6">
            <a
              href="https://chromewebstore.google.com/detail/echobrief-meeting-recorde/feilmpoccaneccgbkankibcfkamacbag"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Chrome Web Store
            </a>
            <Link
              to="/privacy-policy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} EchoBrief. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
