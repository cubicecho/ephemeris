import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { NO_MOOD } from '@/lib/mood';
import { MoodDot, MoodSpectrum } from './mood-scale.tsx';

const meta = {
  component: MoodSpectrum,
} satisfies Meta<typeof MoodSpectrum>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The picker over a value it is handed, as every caller holds it. */
function HeldSpectrum({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="max-w-md p-6">
      <MoodSpectrum aria-label="Mood" value={value} onValueChange={setValue} />
    </div>
  );
}

export const NothingRecorded: Story = {
  render: () => <HeldSpectrum initialValue={NO_MOOD} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Mood' });

    await expect(within(group).getAllByRole('radio')).toHaveLength(6);
    await expect(canvas.getByRole('radio', { name: 'Not recorded' })).toBeChecked();
  },
};

export const ChoosingAStep: Story = {
  render: () => <HeldSpectrum initialValue={NO_MOOD} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('radio', { name: 'Good' }));

    await expect(canvas.getByRole('radio', { name: 'Good' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Not recorded' })).not.toBeChecked();
  },
};

export const EveryStepKeepsItsColour: Story = {
  render: () => <HeldSpectrum initialValue="4" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fills = ['Rough', 'Low', 'Even', 'Good', 'Great'].map(
      (name) => getComputedStyle(canvas.getByRole('radio', { name })).backgroundColor,
    );

    // The chosen step is ringed, not the only one left in colour: five steps, five fills.
    await expect(new Set(fills).size).toBe(fills.length);
  },
};

export const DotWording: Story = {
  render: () => (
    <div className="flex flex-col gap-2 p-6">
      <MoodDot mood={4} wording="printed" />
      <MoodDot mood={2} />
      <MoodDot mood={null} wording="printed" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Good')).toBeVisible();
    // Spoken, not printed: in the tree for a screen reader and clipped to nothing on screen.
    await expect(canvas.getByText('Low')).toHaveClass('sr-only');
    await expect(canvasElement.querySelectorAll('[aria-hidden]')).toHaveLength(2);
  },
};
