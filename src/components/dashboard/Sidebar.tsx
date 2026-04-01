import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Mic,
  Calendar, 
  CheckSquare, 
  Settings, 
  LogOut,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import echoBriefLogo from '@/assets/echobrief-logo.png';

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { icon: Home, label: 'Home', path: '/dashboard' },
  { icon: Mic, label: 'Recordings', path: '/recordings' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Action Items', path: '/action-items' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const handleCollapsedChange = (newCollapsed: boolean) => {
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar-collapsed', String(newCollapsed));
    onCollapsedChange?.(newCollapsed);
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Header with Logo */}
      <div className={cn(
        "h-14 flex items-center border-b border-sidebar-border px-3",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <Link to="/dashboard" className="logo-container">
            <img 
              src={echoBriefLogo} 
              alt="EchoBrief" 
              className="w-7 h-7"
              onError={(e) => {
                console.error('Logo failed to load');
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-sm font-semibold" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <span className="text-white">echo</span><span className="text-orange-400">brief</span>
            </span>
          </Link>
        )}
        {collapsed && (
          <Link to="/dashboard">
            <img 
              src={echoBriefLogo} 
              alt="EchoBrief" 
              className="w-7 h-7 rounded-lg"
              onError={(e) => {
                console.error('Logo failed to load');
                e.currentTarget.style.display = 'none';
              }}
            />
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => handleCollapsedChange(!collapsed)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="p-2">
          <button
            onClick={() => handleCollapsedChange(false)}
            className="w-full p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors flex items-center justify-center"
            title="Expand sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "nav-item",
                isActive && "active",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className={cn(
        "p-2 border-t border-sidebar-border",
        collapsed && "flex flex-col items-center"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1">
            <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-accent">
                {user?.email?.[0].toUpperCase()}
              </span>
            </div>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {user?.email?.split('@')[0]}
            </span>
          </div>
        )}
        <button
          onClick={signOut}
          className={cn(
            "nav-item w-full text-muted-foreground hover:text-foreground",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}