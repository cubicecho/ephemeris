import type { ComponentProps } from 'react';
import { useLinkClickHandler, useLocation } from 'react-router';
import { BarNavItem, SidebarNavItem } from '@/components/sidebar';

type RailLinkProps = Pick<ComponentProps<typeof SidebarNavItem>, 'label' | 'iconSlot' | 'status'> & { to: string };

/**
 * cubeui's rail row, bound to react-router. The row is a real `<a href>` — so
 * middle-click, copy-link and the status bar all work — and the router only
 * takes over the plain left click, which is what `useLinkClickHandler` is.
 * `active` is the URL's own answer rather than state: every day is a URL.
 */
export function RailLink({ to, ...row }: RailLinkProps) {
  const onClick = useLinkClickHandler<HTMLButtonElement>(to);
  const active = useLocation().pathname === to;
  return <SidebarNavItem href={to} active={active} onClick={onClick} {...row} />;
}

type BarLinkProps = Pick<ComponentProps<typeof BarNavItem>, 'label' | 'iconSlot'> & { to: string };

/** The same binding for the phone bar, where a place is only its icon. */
export function BarLink({ to, ...item }: BarLinkProps) {
  const onClick = useLinkClickHandler<HTMLButtonElement>(to);
  const active = useLocation().pathname === to;
  return <BarNavItem href={to} active={active} onClick={onClick} {...item} />;
}
