import { useState, useEffect, useRef } from 'react';
import { Search, Bell, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalSearch } from './GlobalSearch';

export function Header() {
  const { user, signOut } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const userInitial = user?.email?.[0]?.toUpperCase() || '?';

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  return (
    <>
      <header className="h-14 border-b border-border bg-background flex items-center justify-between gap-4 px-8 sticky top-0 z-40">
        {/* Search bar */}
        <div className="flex items-center flex-1 max-w-[360px]">
          <div className="relative w-full">
            <Search className="w-[15px] h-[15px] text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search meetings, people, decisions..."
              className="w-full py-2 pl-9 pr-3 rounded-[10px] border border-border bg-card text-foreground text-[13px] font-sans outline-none placeholder:text-muted-foreground focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20 transition-all"
              onFocus={() => setSearchOpen(true)}
              readOnly
            />
          </div>
        </div>

        {/* Right side: notification + profile dropdown */}
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Bell className="w-[18px] h-[18px]" />
            <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-orange-500" />
          </button>
          
          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary transition-colors"
            >
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}
              >
                {userInitial}
              </div>
              <ChevronDown 
                className="w-4 h-4 text-muted-foreground transition-transform"
                style={{ transform: profileMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>
            
            {/* Dropdown Menu */}
            {profileMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50"
                style={{
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)',
                }}
              >
                {/* User Info */}
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground">Logged in as</p>
                  <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
                </div>
                
                {/* Sign Out */}
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    signOut();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
