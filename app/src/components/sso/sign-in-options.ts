import { graphql } from '@/__generated__';

/**
 * What the sign-in page asks before it draws anything else: whether an address alone signs in, the OIDC provider to
 * offer, and whether this caller may pair one. Readable signed out. One document, so the page asks once.
 */
export const SignInOptions = graphql(`
  query SignInOptions {
    authConfig {
      secureLocalNet
      sso {
        name
        signInUrl
      }
    }
    ssoSetup {
      source
      canPair
    }
  }
`);
