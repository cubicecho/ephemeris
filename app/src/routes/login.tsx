import { useMutation } from '@apollo/client/react';
import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { graphql } from '@/__generated__';
import { InputField, useAppForm } from '@/components/app-form';
import { CenteredLayout } from '@/components/centered-layout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/ui/theme-picker';
import { getToken, setToken } from '@/lib/auth';

export const RequestMagicLink = graphql(`
  mutation RequestMagicLink($email: String!) {
    requestMagicLink(email: $email) {
      ok
      magicLink
      token
    }
  }
`);

const FORM_ID = 'login';

/** A sign-in link that has been asked for. */
interface SentLink {
  /** The address it went to. */
  email: string;
  /** The link itself, on an instance that exposes it instead of emailing it. */
  magicLink: string | null;
}

/** The theme is a device preference, so it has to be reachable signed out. */
const THEME_SLOT = <ThemePicker variant="compact" className="w-28" />;

/**
 * The sign-in screen: asks for an email, then says where the link went.
 *
 * Someone already signed in is sent on to their journal.
 */
export function LoginPage() {
  const [sent, setSent] = useState<SentLink | null>(null);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }
  if (sent) {
    return <LinkSent sent={sent} onStartOver={() => setSent(null)} />;
  }
  return <RequestLink onSent={setSent} />;
}

/** The form that asks for a sign-in link. `onSent` is called with the link once the server has taken the request. */
function RequestLink({ onSent }: { onSent: (sent: SentLink) => void }) {
  const navigate = useNavigate();
  const [requestLink, { error }] = useMutation(RequestMagicLink);

  const form = useAppForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      // A refused request is said by `error` below; the rejection has nowhere else to go.
      const result = await requestLink({ variables: { email: value.email } }).catch(() => null);
      const link = result?.data?.requestMagicLink;
      if (!link) {
        return;
      }
      // AUTH_MAGIC_LINK=false: the server signed us straight in.
      if (link.token) {
        setToken(link.token);
        navigate('/', { replace: true });
        return;
      }
      onSent({ email: value.email, magicLink: link.magicLink ?? null });
    },
  });

  return (
    <CenteredLayout
      iconSlot={<BookOpen />}
      title="Sign in to Ephemeris"
      // The card is the whole page here, so its title is the page's heading.
      level={1}
      description="A journal of one. We will email you a link to sign in."
      contentSlot={
        <form
          id={FORM_ID}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          {error && <Alert variant="destructive" title="We could not send a link" description={error.message} />}
          <InputField form={form} name="email" label="Email" type="email" autoComplete="email" required />
        </form>
      }
      footerSlot={THEME_SLOT}
      footerActionsSlot={
        <form.AppForm>
          <form.SubmitButton form={FORM_ID} content="Send sign-in link" pendingLabel="Sending…" />
        </form.AppForm>
      }
    />
  );
}

/** What the screen says once a link is on its way, with the way back to ask for another. */
function LinkSent({ sent, onStartOver }: { sent: SentLink; onStartOver: () => void }) {
  // The link is built from APP_URL, which in development points at the server rather than at Vite. Follow it in this
  // tab, on this origin, instead.
  const localLink = sent.magicLink ? `/auth/verify${new URL(sent.magicLink).search}` : null;

  return (
    <CenteredLayout
      iconSlot={<BookOpen />}
      title="Sign in to Ephemeris"
      level={1}
      description={`We sent a sign-in link to ${sent.email}.`}
      contentSlot={
        localLink ? (
          <p className="text-sm">
            This instance exposes sign-in links.{' '}
            <Link className="font-medium text-info underline" to={localLink}>
              Sign in now
            </Link>
          </p>
        ) : (
          <p className="text-foreground/60 text-sm">Open the link in that email to finish signing in.</p>
        )
      }
      footerSlot={THEME_SLOT}
      footerActionsSlot={<Button variant="outline" content="Use a different email" onClick={onStartOver} />}
    />
  );
}
