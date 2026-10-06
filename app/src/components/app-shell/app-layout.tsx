import { BookOpen, CalendarDays, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ActionButton } from '@/components/action-button';
import { BarLink, RailLink } from '@/components/app-shell/rail-link';
import { RECENT_LIMIT, RecentDaysSection, useRecentEntries } from '@/components/entries/recent-days';
import { Sidebar, SidebarNavItem, SidebarSection } from '@/components/sidebar';
import { SidebarLayout } from '@/components/split-layout';
import { ThemePicker } from '@/components/ui/theme-picker';
import { clearToken } from '@/lib/auth';
import { todayIso } from '@/lib/date';

/** Forgets the token and goes back to the login screen — for shared machines. */
function useSignOut() {
  const navigate = useNavigate();
  return () => {
    clearToken();
    navigate('/login', { replace: true });
  };
}

/**
 * The chrome every signed-in screen sits in, and all of it is cubeui's: a
 * `SidebarLayout` with a `Sidebar` of days at the start edge, and — under `md`,
 * where a rail has no room — the layout's own bar standing in for it.
 *
 * What fills the rail is the only thing that is this app's. Other tools have
 * sections; a journal has days, so the days are the navigation.
 *
 * The bar exists only under the breakpoint, so the count of days written is said
 * twice: as the bar's `status` on a phone, and by the Recent section's heading
 * in the rail.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const today = todayIso();
  const signOut = useSignOut();
  const { data } = useRecentEntries();

  return (
    <SidebarLayout
      className="h-svh"
      sidebarPosition="start"
      sidebarWidth="auto"
      divider="none"
      sidebarHideBelow="md"
      sidebarSlot={
        <Sidebar
          label="Main"
          headerSlot={
            <div className="flex items-center gap-2 px-2 py-1 font-semibold">
              <BookOpen className="size-5" aria-hidden />
              Ephemeris
            </div>
          }
          contentSlot={[
            <SidebarSection
              key="main"
              as="nav"
              label="Main"
              // The one link that is always the same place, wherever you have wandered to.
              contentSlot={[<RailLink key="today" to={`/${today}`} label="Today" iconSlot={<CalendarDays />} />]}
            />,
            <RecentDaysSection key="recent" today={today} />,
          ]}
          footerSlot={[
            <ThemePicker key="theme" variant="compact" />,
            <SidebarNavItem key="sign-out" label="Sign out" iconSlot={<LogOut />} onClick={signOut} />,
          ]}
        />
      }
      brandSlot={<BookOpen className="size-5" aria-hidden />}
      navLabel="Main"
      navSlot={<BarLink to={`/${today}`} label="Today" iconSlot={<CalendarDays />} />}
      status={data ? `${data.entries.length} of the last ${RECENT_LIMIT} days written` : undefined}
      actionSlot={[
        <ThemePicker key="theme" variant="compact" className="w-28" />,
        <ActionButton
          key="sign-out"
          label="Sign out"
          variant="outline"
          size="icon-sm"
          iconSlot={<LogOut />}
          onClick={signOut}
        />,
      ]}
      contentSlot={<main className="min-h-0 flex-1 overflow-auto">{children}</main>}
    />
  );
}
