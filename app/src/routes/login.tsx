import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { graphql } from '@/__generated__';
import { InputField, useAppForm } from '@/components/app-form';
import { CenteredLayout } from '@/components/centered-layout';
import { PairSsoForm } from '@/components/sso/pair-sso-form';
import { SignInOptions } from '@/components/sso/sign-in-options';
import { SsoSignIn } from '@/components/sso/sso-sign-in';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ThemePicker } from '@/components/ui/theme-picker';
import { BookOpen } from '@/lib/app-icons';
import { getToken, setToken } from '@/lib/auth';

export const SignInMagicLink = graphql(`
  mutation SignInMagicLink($email: String!) {
    signInMagicLink(email: $email) {
      status
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
 * The sign-in screen: asks for an email, then says where the link went. Where the instance has an OIDC provider, its
 * button comes first, and a sign-in there that failed comes back here with `?error=`. A new instance, with no
 * accounts and no provider, also offers to pair one, so whoever installs it can set sign-in up before there is an
 * admin to ask.
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
  const [params] = useSearchParams();
  const [requestLink, { error }] = useMutation(SignInMagicLink);
  const options = useQuery(SignInOptions).data;
  const [isPairing, setIsPairing] = useState(false);
  const [paired, setPaired] = useState<string | null>(null);
  const isLocalNet = options?.authConfig.secureLocalNet === true;
  const canOfferPairing = options?.ssoSetup.canPair === true && options.ssoSetup.source === 'NONE';

  const form = useAppForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      // A refused request is said by `error` below; the rejection has nowhere else to go.
      const result = await requestLink({ variables: { email: value.email } }).catch(() => null);
      const link = result?.data?.signInMagicLink;
      if (!link) {
        return;
      }
      // SECURE_LOCAL_NET or AUTH_MAGIC_LINK=false: the server signed us straight in.
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
      description={
        isLocalNet
          ? 'A journal of one. Enter your email to sign in.'
          : 'A journal of one. We will email you a link to sign in.'
      }
      contentSlot={
        <div className="flex flex-col gap-4">
          {paired && (
            <Alert
              variant="info"
              title={`Paired with ${paired}`}
              description="Sign in with it below. The first account to sign in runs this instance."
            />
          )}
          <SsoSignIn provider={options?.authConfig.sso ?? null} error={params.get('error')} />
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
          {canOfferPairing &&
            (isPairing ? (
              <PairSsoForm
                onPaired={(name) => {
                  setPaired(name);
                  setIsPairing(false);
                }}
              />
            ) : (
              <Button variant="link" content="Set up sign-in with a provider" onClick={() => setIsPairing(true)} />
            ))}
        </div>
      }
      footerSlot={THEME_SLOT}
      footerActionsSlot={
        <form.AppForm>
          <form.SubmitButton
            form={FORM_ID}
            content={isLocalNet ? 'Sign in' : 'Send sign-in link'}
            pendingLabel={isLocalNet ? 'Signing in…' : 'Sending…'}
          />
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
