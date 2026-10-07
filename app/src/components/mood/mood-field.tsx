import { bindToForm, type FieldProps, useFieldContext, useFieldError } from '@/components/app-form';
import { FormField } from '@/components/form-field';
import { MoodSpectrum } from '@/components/mood/mood-scale';

type MoodFieldProps = Omit<FieldProps, 'asGroup' | 'htmlFor'>;

/** The mood picker over the field in context. The label names the group, since a `<label>` cannot name a radiogroup. */
function BoundMoodField(props: MoodFieldProps) {
  const field = useFieldContext<string>();
  const error = useFieldError();

  return (
    <FormField
      {...props}
      asGroup
      error={error}
      controlSlot={(control) => (
        <MoodSpectrum {...control} value={field.state.value} onValueChange={(next) => field.handleChange(next)} />
      )}
    />
  );
}

/**
 * The mood spectrum as a form field, in one line. Writes a step's number as a string, or `NO_MOOD`.
 *
 * ```tsx
 * <MoodField form={form} name="mood" label="Mood" />
 * ```
 */
export const MoodField = bindToForm<MoodFieldProps, string>(BoundMoodField, 'MoodField');
