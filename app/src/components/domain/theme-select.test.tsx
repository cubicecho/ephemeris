import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeSelect } from '@/components/domain/theme-select';

beforeEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('ThemeSelect', () => {
  // The menu itself is Radix's, and opening it under jsdom would buy a
  // dependency to re-test somebody else's component. What is this file's is the
  // binding: the trigger has to open on the preference already in effect, or a
  // dark-theme reader is shown a control that disagrees with their own screen.
  it('shows the stored preference', () => {
    window.localStorage.setItem('ephemeris_theme', 'dark');
    render(<ThemeSelect />);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveTextContent('Dark');
  });

  it('shows System when nothing is stored', () => {
    render(<ThemeSelect />);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveTextContent('System');
  });
});
