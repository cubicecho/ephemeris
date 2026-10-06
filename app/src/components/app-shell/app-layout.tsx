import { useApolloClient } from '@apollo/client/react';
import { BookOpen, CalendarDays, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ActionButton } from '@/components/action-button';
import { BarLink, SidebarLink } from '@/components/app-shell/sidebar-link';
import { RECENT_LIMIT, RecentDaysSection, useRecentEntries } from '@/components/entries/recent-days';
import { Sidebar, SidebarNavItem, SidebarSection } from '@/components/sidebar';
import { SidebarLayout } from '@/components/split-layout';
import { ThemePicker } from '@/components/ui/theme-picker';
import { clearToken } from '@/lib/auth';
import { todayIso } from '@/lib/date';
import type { SlotNode } from '@/lib/utils';

/**
 * Signing out, for shared machines: forgets the token and the cached entries, then goes to the login screen.
 *
 * The cache goes too because it outlives the token. Without that the next person to sign in on this tab is shown the
 * last person's days until their own arrive.
 *
 * @returns The function a Sign out control calls.
 */
function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  const client = useApolloClient();
  return async () => {
    clearToken();
    await client.clearStore();
    navigate('/login', { replace: true });
  };
}

interface AppLayoutProps {
  /** The page: the one part of the chrome that scrolls. */
  contentSlot: SlotNode;
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
export function AppLayout({ contentSlot }: AppLayoutProps) {
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
              contentSlot={[<SidebarLink key="today" to={`/${today}`} label="Today" iconSlot={<CalendarDays />} />]}
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
      contentSlot={<main className="min-h-0 flex-1 overflow-auto">{contentSlot}</main>}
    />
  );
}
