import { useMutation } from '@apollo/client/react';
import { graphql } from '@/__generated__';
import { InputField, useAppForm } from '@/components/app-form';
import { Alert } from '@/components/ui/alert';

export const PairSso = graphql(`
  mutation PairSso($setupUrl: String!) {
    pairSso(setupUrl: $setupUrl) {
      source
      name
      canPair
    }
  }
`);

const FORM_ID = 'pair-sso';
/** What a provider with no name of its own is called. Matches the server's default. */
const UNNAMED = 'SSO';

interface PairSsoFormProps {
  /** Called with the provider's name once it is paired. */
  onPaired: (name: string) => void;
}

/**
 * Pairs the instance with an OpenID Connect provider (heautou, or any that supports Dynamic Client Registration) from
 * the setup URL its admin made. The server decides who may pair; this only asks. The sign-in options are asked again
 * afterwards, because the provider's button is part of them and the answer has no id to update in place.
 */
export function PairSsoForm({ onPaired }: PairSsoFormProps) {
  const [pairSso, { error }] = useMutation(PairSso, {
    refetchQueries: ['SignInOptions'],
    awaitRefetchQueries: true,
  });

  const form = useAppForm({
    defaultValues: { setupUrl: '' },
    onSubmit: async ({ value }) => {
      // A refused pairing is said by `error` below; the rejection has nowhere else to go.
      const result = await pairSso({ variables: { setupUrl: value.setupUrl.trim() } }).catch(() => null);
      const paired = result?.data?.pairSso;
      if (paired) {
        onPaired(paired.name ?? UNNAMED);
      }
    },
  });

  return (
    <form
      id={FORM_ID}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      {error && <Alert variant="destructive" title="Could not pair" description={error.message} />}
      <InputField
        form={form}
        name="setupUrl"
        label="Setup URL"
        type="url"
        placeholder="https://id.example.com/oidc#setup=…"
        description="Your provider's admin makes this for Ephemeris. It works once, and only for a short while."
        required
      />
      <form.AppForm>
        <form.SubmitButton form={FORM_ID} variant="outline" content="Connect" pendingLabel="Connecting…" />
      </form.AppForm>
    </form>
  );
}
