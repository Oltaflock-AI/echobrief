import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Mic, 
  Calendar, 
  CheckSquare, 
  Settings, 
  ChevronLeft,
  Menu
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { useThemeTokens } from '@/lib/theme';

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { icon: Mic, label: 'Meetings', path: '/dashboard' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Action Items', path: '/action-items' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const T = useThemeTokens();
  const location = useLocation();
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
        "fixed left-0 top-0 bottom-0 flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-14" : "w-[220px]"
      )}
      style={{ 
        background: T.bg, 
        borderRight: `1px solid ${T.border}` 
      }}
    >
      {/* Header with Logo */}
      <div className={cn(
        "flex items-center px-3",
        collapsed ? "h-14 justify-center" : "h-14 justify-between"
      )}
      style={{ borderBottom: `1px solid ${T.border}` }}
      >
        {!collapsed && (
          <Logo size="md" linkTo="/dashboard" className="px-2" />
        )}
        {collapsed && (
          <Link to="/dashboard">
            <LogoMark size="md" />
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => handleCollapsedChange(!collapsed)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: T.textM }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.bgCardH; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textM; }}
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
            className="w-full p-1.5 rounded-md transition-colors flex items-center justify-center"
            style={{ color: T.textM }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.bgCardH; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textM; }}
            title="Expand sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation: prototype exact match */}
      <nav className="flex-1 p-3 mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2.5 text-sm font-medium transition-all duration-150",
                collapsed && "justify-center px-0"
              )}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: isActive ? 'hsl(var(--accent) / 0.08)' : 'transparent',
                color: isActive ? 'hsl(var(--accent))' : T.textS,
                border: 'none',
                width: '100%',
                textAlign: 'left' as const,
                marginBottom: 2,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = T.text;
                  e.currentTarget.style.background = T.bgCardH;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = T.textS;
                  e.currentTarget.style.background = 'transparent';
                }
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>


    </aside>
  );
}
