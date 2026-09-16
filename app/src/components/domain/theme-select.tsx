import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { OptionSelect } from '@/components/option-select';
import { getThemePreference, setThemePreference, type ThemePreference } from '@/lib/theme';

const OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }>;

// The icon and the word both, in the trigger as well as the list. An icon alone
// is the usual shape for this control and it cannot say which of three states it
// is in — a sun means "it is light now" and "click for light" equally well, and
// neither of those is "following the system, which is currently light".
const ENTRIES = OPTIONS.map(({ value, label, icon: Icon }) => ({
  value,
  label: (
    <>
      <Icon aria-hidden />
      {label}
    </>
  ),
}));

/**
 * Light, dark, or whatever the machine says.
 *
 * A device preference, not an account one, so there is no mutation behind it and
 * it works signed out — which is why it sits on the login page too. cubeui's
 * `PageLayout` deliberately does not own this (it owns no chrome), so it is
 * passed into an `action` slot like any other page control.
 */
export function ThemeSelect({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference);

  return (
    <OptionSelect
      aria-label="Theme"
      className={className ?? 'w-auto'}
      options={ENTRIES}
      value={preference}
      onValueChange={(next) => {
        // The union is the only thing OptionSelect cannot know; the options it
        // was given are the only values it can emit.
        const choice = next as ThemePreference;
        setThemePreference(choice);
        setPreference(choice);
      }}
    />
  );
}
