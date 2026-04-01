import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageTransition } from './PageTransition';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen" style={{ background: "#0C0A09", color: "#FAFAF9" }}>
      <Sidebar onCollapsedChange={setSidebarCollapsed} />
      <div className={cn(
        "min-h-screen transition-all duration-200 relative z-10",
        sidebarCollapsed ? "ml-14" : "ml-[220px]"
      )}>
        <Header />
        <main className="p-6">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
