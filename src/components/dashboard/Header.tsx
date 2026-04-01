import { useState, useEffect } from 'react';
import { Sun, Moon, Search, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { GlobalSearch } from './GlobalSearch';
import { cn } from '@/lib/utils';

export function Header() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    if (theme === 'system') {
      setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
    } else {
      setTheme(theme === 'light' ? 'dark' : 'light');
    }
  };

  return (
    <>
      <header className="h-12 border-b border-border bg-background flex items-center justify-between gap-2 px-4 sticky top-0 z-40">
        {/* Logo text for narrow/collapsed sidebar contexts */}
        <div className="flex items-center">
          <span className="text-sm font-semibold font-heading" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <span className="text-foreground">echo</span><span className="text-orange-400">brief</span>
          </span>
        </div>
        {/* Search trigger */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearchOpen(true)}
          className="h-8 gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline text-sm">Search</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            <Command className="w-3 h-3" />K
          </kbd>
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <Sun className={cn(
            "h-4 w-4 transition-all",
            resolvedTheme === 'dark' ? "rotate-90 scale-0" : "rotate-0 scale-100"
          )} />
          <Moon className={cn(
            "absolute h-4 w-4 transition-all",
            resolvedTheme === 'dark' ? "rotate-0 scale-100" : "-rotate-90 scale-0"
          )} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}