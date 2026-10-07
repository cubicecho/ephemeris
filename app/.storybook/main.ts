import type { StorybookConfig } from '@storybook/react-vite';

// Stories sit beside what they draw. Nothing under components/ui has one: that tree is cubeui's, and its stories live
// where it is maintained.
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
};

export default config;
