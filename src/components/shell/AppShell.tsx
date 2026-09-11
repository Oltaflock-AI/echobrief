import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileTabBar } from "./MobileTabBar";

/**
 * The Console frame — DESIGN_SPEC §1. Fixed 232px sidebar, 60px header, content
 * padded 16/32/32.
 *
 * Below `lg` the rail is replaced by the bottom tab bar (DESIGN_SPEC §2) —
 * Meetings, Calendar, Tasks, Ask, More — with the drawer kept as the way to
 * reach a destination the five tabs do not carry. The frame is light-only, as
 * every mockup is; dark mode is still unresolved for V2.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="relative min-h-screen bg-eb-bg text-eb-text" data-clarity-mask="true">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed bottom-0 left-0 top-0 z-40 hidden lg:block">
        <Sidebar />
      </aside>

      {/* Below lg the rail becomes a drawer, reached from the header. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[232px] border-0 bg-eb-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">EchoBrief sections</SheetDescription>
          <Sidebar onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="min-h-screen lg:ml-[232px]">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        {/* The 68px bar plus the home indicator, so the last row clears both.
            A flat pb-24 was 6px short on a device with a safe-area inset. */}
        <main
          id="main-content"
          tabIndex={-1}
          key={location.pathname}
          className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:px-8 lg:pb-8"
        >
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
