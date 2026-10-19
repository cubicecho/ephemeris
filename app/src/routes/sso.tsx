import { useMutation } from '@apollo/client/react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { graphql } from '@/__generated__';
import { CenteredLayout } from '@/components/centered-layout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { setToken } from '@/lib/auth';

export const VerifyOneTimeToken = graphql(`
  mutation VerifyOneTimeToken($token: String!) {
    verifyOneTimeToken(token: $token) {
      token
      userId
    }
  }
`);

/**
 * Where a sign-in through the OIDC provider lands. The server's callback opened a session and put a one-time token
 * for it on this URL; this swaps the token for the session, once, then goes to the journal.
 *
 * A token that is missing, spent or too old says so and offers the way back to sign in again.
 */
export function SsoPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [verify, { error }] = useMutation(VerifyOneTimeToken);
  // The token is spent on first use, and StrictMode mounts effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    started.current = true;
    verify({ variables: { token } })
      .then(({ data }) => {
        if (!data) {
          return;
        }
        setToken(data.verifyOneTimeToken.token);
        navigate('/', { replace: true });
      })
      .catch(() => {});
  }, [token, verify, navigate]);

  if (!token || error) {
    return (
      <CenteredLayout
        title="That sign-in didn't work."
        level={1}
        description="A sign-in through a provider has to be finished within a few minutes, and only once."
        footerActionsSlot={<Button variant="outline" content="Sign in again" linkSlot={<Link to="/login" />} />}
      />
    );
  }
  return (
    <CenteredLayout
      title="Signing you in…"
      level={1}
      contentSlot={<Spinner label="Signing you in" className="mx-auto" />}
    />
  );
}
