import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { todayIso } from '@/lib/date';
import { EntryForm, SaveEntry } from './entry-form.tsx';

const meta = {
  component: EntryForm,
  args: { date: todayIso(), entry: null },
  render: (args) => (
    <div className="max-w-2xl p-4">
      <EntryForm {...args} />
    </div>
  ),
} satisfies Meta<typeof EntryForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const UnwrittenDay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save entry' });

    // Nothing typed is nothing to save.
    await expect(save).toBeDisabled();
    await expect(canvas.getByRole('radio', { name: 'Not recorded' })).toBeChecked();

    await userEvent.type(canvas.getByRole('textbox', { name: 'How the day went' }), 'A quiet one.');

    await expect(save).toBeEnabled();
  },
};

export const WrittenDay: Story = {
  args: { entry: { body: 'Walked to the harbour before work.', mood: 4 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('textbox', { name: 'How the day went' })).toHaveValue(
      'Walked to the harbour before work.',
    );
    await expect(canvas.getByRole('radio', { name: 'Good' })).toBeChecked();
    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    // The mood alone is a change worth saving.
    await userEvent.click(canvas.getByRole('radio', { name: 'Great' }));

    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  },
};

export const SaveFails: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        {
          request: { query: SaveEntry, variables: { date: todayIso(), body: 'A quiet one.', mood: null } },
          error: new Error('Failed to fetch'),
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const words = canvas.getByRole('textbox', { name: 'How the day went' });

    await userEvent.type(words, 'A quiet one.');
    await userEvent.click(canvas.getByRole('button', { name: 'Save entry' }));

    await expect(await canvas.findByText('This entry was not saved')).toBeVisible();
    // What was typed is still there, and still saveable.
    await expect(words).toHaveValue('A quiet one.');
    await expect(canvas.getByRole('button', { name: 'Save entry' })).toBeEnabled();
    await expect(canvas.queryByText('Saved.')).not.toBeInTheDocument();
  },
};
