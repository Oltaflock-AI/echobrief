/**
 * The mobile tab bar — DESIGN_SPEC §2.
 *
 * Five destinations, and everything else lives under More: Contacts, Coaching,
 * Workspace and Settings. Only rendered below `lg`, where the desktop rail is
 * hidden.
 *
 * The active tab is matched by path prefix so a meeting page keeps Meetings lit
 * and a settings sub-tab keeps More lit — a bar that goes blank as soon as you
 * open a detail page tells the reader they have left the app.
 */
import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, CheckSquare, MessageCircle, Mic, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/dashboard', label: 'Meetings', icon: Mic, match: ['/dashboard', '/meeting', '/recordings'] },
  { to: '/calendar', label: 'Calendar', icon: Calendar, match: ['/calendar'] },
  { to: '/action-items', label: 'Tasks', icon: CheckSquare, match: ['/action-items'] },
  { to: '/chat', label: 'Ask', icon: MessageCircle, match: ['/chat'] },
  {
    to: '/more',
    label: 'More',
    icon: MoreHorizontal,
    match: ['/more', '/settings', '/contacts', '/coaching', '/workspace'],
  },
];

export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-eb-border bg-[color-mix(in_srgb,var(--eb-card)_92%,transparent)] backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="m-0 flex list-none items-stretch justify-around p-0">
        {TABS.map((tab) => {
          const active = tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          const Icon = tab.icon;
          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className="flex h-[68px] flex-col items-center justify-center gap-1 no-underline"
              >
                <span
                  className={cn(
                    'flex h-7 w-11 items-center justify-center rounded-pill transition-colors',
                    active ? 'bg-eb-accent-soft text-eb-accent' : 'text-eb-nav-icon',
                  )}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <span
                  className={cn(
                    'font-dmsans text-[10.5px] leading-none',
                    active ? 'font-semibold text-eb-accent' : 'text-eb-secondary',
                  )}
                >
                  {tab.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
