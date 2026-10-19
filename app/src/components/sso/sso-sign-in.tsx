import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** What `?error=` says when the provider's button was followed after it was disconnected (server/src/http/sso.ts). */
const SSO_OFF = 'sso_off';

/** An OIDC provider the sign-in page offers. */
export interface SsoProvider {
  /** What the button calls it. */
  name: string;
  /** Where the button sends the browser: the server's start route, absolute. */
  signInUrl: string;
}

interface SsoSignInProps {
  /** The provider to offer, or null when the instance has none. */
  provider: SsoProvider | null;
  /** The `?error=` a failed sign-in came back to the login page with, or null. */
  error: string | null;
}

/**
 * The sign-in page's provider half: a button that leaves for the provider, and what to say when a sign-in there came
 * back refused. Draws nothing when there is neither.
 */
export function SsoSignIn({ provider, error }: SsoSignInProps) {
  return (
    <>
      {error === SSO_OFF ? (
        <Alert
          variant="warning"
          title="That sign-in button is gone"
          description="This instance no longer signs in through a provider. Sign in by email instead."
        />
      ) : error ? (
        <Alert
          variant="destructive"
          title={provider ? `Signing in with ${provider.name} didn't work` : "Signing in didn't work"}
          description={`The sign-in came back with "${error}". Try again, or ask whoever runs this instance.`}
        />
      ) : null}
      {provider ? (
        <>
          {/* A plain link, not the router's: the server sends the browser on to the provider. */}
          <Button content={`Sign in with ${provider.name}`} linkSlot={<a href={provider.signInUrl} />} />
          <p className="text-center text-foreground/60 text-sm">or sign in by email</p>
        </>
      ) : null}
    </>
  );
}
