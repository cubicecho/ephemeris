import { BookOpen, CalendarDays, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { RECENT_LIMIT, RecentDaysNav, useRecentEntries } from '@/components/domain/recent-days';
import { ThemeSelect } from '@/components/domain/theme-select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { clearToken } from '@/lib/auth';
import { todayIso } from '@/lib/date';

/** Forgets the token and goes back to the login screen — for shared machines. */
function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Sign out"
          onClick={() => {
            clearToken();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Sign out</TooltipContent>
    </Tooltip>
  );
}

function HeaderStatus() {
  const { data, loading } = useRecentEntries();

  if (loading && !data) return <Skeleton className="h-4 w-36" />;
  if (!data) return null;
  return (
    <span className="text-muted-foreground text-sm">
      <span className="font-medium text-foreground">{data.entries.length}</span> of the last {RECENT_LIMIT} days written
    </span>
  );
}

/** The one link that is always the same place, wherever you have wandered to. */
function TodayLink({ today, compact = false }: { today: string; compact?: boolean }) {
  return (
    <NavLink
      to={`/${today}`}
      end
      aria-label="Today"
      className={({ isActive }) =>
        [
          compact ? 'rounded-md p-2' : 'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          isActive
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        ].join(' ')
      }
    >
      <CalendarDays className="size-4" />
      {compact ? null : 'Today'}
    </NavLink>
  );
}

function MobileNav({ today }: { today: string }) {
  return (
    <nav className="flex items-center gap-1 md:hidden" aria-label="Main">
      <BookOpen className="mr-1 size-5" aria-hidden />
      <TodayLink today={today} compact />
      <SignOutButton />
      <ThemeSelect className="w-auto" />
    </nav>
  );
}

/**
 * The chrome every signed-in screen sits in: a rail of days on the left, a thin
 * status bar across the top, and the page itself scrolling underneath.
 *
 * It is deliberately the same shell as the mcp-* apps — same 14rem sidebar on
 * `bg-sidebar`, same `h-14` bordered header, same `p-4 md:p-6` body — because
 * these are meant to read as one set of tools rather than as one app each. What
 * differs is only what fills the rail: those apps have sections, a journal has
 * days, so the days are the navigation.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const today = todayIso();

  return (
    <div className="flex h-svh">
      <aside className="hidden w-56 shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-4 py-4 font-semibold">
          <BookOpen className="size-5" />
          Ephemeris
        </div>
        <nav className="flex flex-col gap-1 px-2" aria-label="Main">
          <TodayLink today={today} />
        </nav>
        <div className="px-5 pt-4 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Recent</div>
        <RecentDaysNav today={today} />
        <div className="mt-auto flex items-center gap-2 border-sidebar-border border-t px-4 py-3">
          <ThemeSelect className="min-w-0 flex-1" />
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:justify-end md:px-6">
          <MobileNav today={today} />
          <HeaderStatus />
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
