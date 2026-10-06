import { useMutation } from '@apollo/client/react';
import { BookOpen } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { graphql } from '@/__generated__';
import { CenteredLayout } from '@/components/centered-layout';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemePicker } from '@/components/ui/theme-picker';
import { getToken, setToken } from '@/lib/auth';

const RequestMagicLink = graphql(`
  mutation RequestMagicLink($email: String!) {
    requestMagicLink(email: $email) {
      ok
      magicLink
      token
    }
  }
`);

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ magicLink: string | null } | null>(null);
  const [requestLink, { loading, error }] = useMutation(RequestMagicLink);

  if (getToken()) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { data } = await requestLink({ variables: { email } }).catch(() => ({ data: undefined }));
    if (!data) return;
    const result = data.requestMagicLink;
    // AUTH_MAGIC_LINK=false: the server signed us straight in.
    if (result.token) {
      setToken(result.token);
      navigate('/', { replace: true });
      return;
    }
    setSent({ magicLink: result.magicLink });
  }

  // The link is built from APP_URL, which in development points at the server
  // rather than at Vite. Follow it in this tab, on this origin, instead.
  const localLink = sent?.magicLink ? `/auth/verify${new URL(sent.magicLink).search}` : null;

  return (
    <CenteredLayout
      iconSlot={<BookOpen />}
      title="Sign in to Ephemeris"
      // The card is the whole page here, so its title is the page's heading.
      level={1}
      description={
        sent ? `We sent a sign-in link to ${email}.` : 'A journal of one. We will email you a link to sign in.'
      }
      contentSlot={
        sent ? (
          localLink ? (
            <p className="text-sm">
              This instance exposes sign-in links.{' '}
              <Link className="font-medium underline" to={localLink}>
                Sign in now
              </Link>
            </p>
          ) : (
            <p className="text-foreground/60 text-sm">Open the link in that email to finish signing in.</p>
          )
        ) : (
          <form id="login" onSubmit={submit} className="flex flex-col gap-4">
            <FormField
              label="Email"
              required
              error={error?.message}
              controlSlot={<Input type="email" autoComplete="email" required value={email} onChangeText={setEmail} />}
            />
          </form>
        )
      }
      // The theme is a device preference, so it has to be reachable signed out.
      footerSlot={<ThemePicker variant="compact" className="w-28" />}
      footerActionsSlot={
        sent ? (
          <Button variant="outline" content="Use a different email" onClick={() => setSent(null)} />
        ) : (
          <Button type="submit" form="login" content="Send sign-in link" loading={loading} loadingLabel="Sending…" />
        )
      }
    />
  );
}
