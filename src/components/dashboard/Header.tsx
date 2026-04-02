import { useState, useEffect, useRef } from 'react';
import { Search, Bell, LogOut, User, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalSearch } from './GlobalSearch';

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const userInitial = user?.email?.[0]?.toUpperCase() || '?';
  const userName = user?.email?.split('@')[0] || 'User';

  // Close profile menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleSignOut = () => {
    setProfileMenuOpen(false);
    signOut();
  };

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
          <div ref={profileRef} style={{ position: 'relative' }}>
            {/* Avatar button */}
            <button
              onClick={() => setProfileMenuOpen(prev => !prev)}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                border: profileMenuOpen ? '2px solid #F97316' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: profileMenuOpen ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
              }}
            >
              {userInitial}
            </button>

            {/* Dropdown menu */}
            {profileMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 44,
                  right: 0,
                  width: 220,
                  background: '#1C1917',
                  border: '1px solid #292524',
                  borderRadius: 14,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                  zIndex: 1000,
                  overflow: 'hidden',
                  animation: 'fadeScaleIn 0.15s ease-out',
                }}
              >
                {/* User info header */}
                <div
                  style={{
                    padding: '16px 16px 12px',
                    borderBottom: '1px solid #292524',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {userInitial}
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: 'Outfit, sans-serif',
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#FAFAF9',
                        }}
                      >
                        {userName}
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C' }}>
                        {user?.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                {[
                  { icon: <User size={14} />, label: 'Profile', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                  { icon: <Settings size={14} />, label: 'Settings', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                  { icon: <Bell size={14} />, label: 'Notifications', action: () => setProfileMenuOpen(false) },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.action}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '11px 16px',
                      background: 'none',
                      border: 'none',
                      color: '#A8A29E',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '#292524';
                      (e.currentTarget as HTMLElement).style.color = '#FAFAF9';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'none';
                      (e.currentTarget as HTMLElement).style.color = '#A8A29E';
                    }}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}

                {/* Divider */}
                <div style={{ height: 1, background: '#292524', margin: '4px 0' }} />

                {/* Sign out */}
                <button
                  onClick={handleSignOut}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 16px',
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'none';
                  }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Animation styles */}
      <style>{`
        @keyframes fadeScaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}
