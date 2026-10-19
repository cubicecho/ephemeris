// Environment checks that run before anything opens a connection or signs a session. Imported for its side effects as
// the first import of index.ts, so a misconfigured instance fails with a sentence, not a stack trace.

import { isPrivateHost } from '@cubicecho/ephemeris-db/ssl';
import {
  allowsPublicLocalNet,
  appUrl,
  configuredAuthSecret,
  describeWeakSecret,
  isProduction,
  magicLinkRequired,
  OIDC_CLIENT_AUTH_METHODS,
  secureLocalNet,
} from './config.ts';

/**
 * Stops the process with one readable sentence.
 *
 * @param message - What is wrong and how to fix it.
 * @returns Never: the process has exited.
 */
function fatal(message: string): never {
  console.error(`[preflight] ${message}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fatal('DATABASE_URL is required. Copy .env.example to .env, then run `npm run db:up` for a local Postgres.');
}

if (isProduction()) {
  const weakness = describeWeakSecret(configuredAuthSecret());
  // Sessions, links and the OIDC state cookie are signed with this and nothing else.
  if (weakness !== undefined) {
    fatal(`BETTER_AUTH_SECRET ${weakness}. Set a strong random value: generate one with \`openssl rand -hex 32\`.`);
  }
}

// With no link to follow, typing any address signs in as that account, so the network is the whole credential. An
// APP_URL anyone can type is the clearest sign that the network is not one.
const isDirectSignIn = magicLinkRequired() === false;
if (isDirectSignIn) {
  const isExposed = isPrivateHost(new URL(appUrl()).hostname) === false && allowsPublicLocalNet() === false;
  if (isExposed) {
    const cause = secureLocalNet() ? 'SECURE_LOCAL_NET is on' : 'AUTH_MAGIC_LINK is off';
    fatal(
      `${cause} but APP_URL (${appUrl()}) is not a private address. Turn it off, or set I_KNOW_SECURE_LOCAL_NET_IS_PUBLIC=true if nothing hostile can reach this port.`,
    );
  }
}

// Half an OIDC setup leaves the login page without its button and no clue why, and a typo in the issuer would only
// show up at the first sign-in.
const oidcIssuer = (process.env.OIDC_ISSUER ?? '').trim();
const oidcClientId = (process.env.OIDC_CLIENT_ID ?? '').trim();
const hasIssuer = oidcIssuer !== '';
const hasClientId = oidcClientId !== '';
if (hasIssuer !== hasClientId) {
  fatal('OIDC_ISSUER and OIDC_CLIENT_ID go together: set both to sign in with an OIDC provider, or neither.');
}
if (hasIssuer && URL.canParse(oidcIssuer) === false) {
  fatal(`OIDC_ISSUER is not a URL: ${oidcIssuer}`);
}
const oidcClientAuth = (process.env.OIDC_CLIENT_AUTH ?? '').trim();
const isKnownClientAuth = (OIDC_CLIENT_AUTH_METHODS as readonly string[]).includes(oidcClientAuth);
if (oidcClientAuth !== '' && isKnownClientAuth === false) {
  fatal(`OIDC_CLIENT_AUTH must be one of ${OIDC_CLIENT_AUTH_METHODS.join(', ')}.`);
}
