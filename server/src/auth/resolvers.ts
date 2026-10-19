import { extendSchema, type GraphQLSchema, parse } from 'graphql';
import { magicLinkRequired, serverUrl } from '../core/config.ts';
import type { Context } from '../core/context.ts';
import { objectType } from '../graphql/object-type.ts';
import { SSO_START_PATH } from '../http/sso.ts';
import { effectiveOidc } from '../sso/settings.ts';

const QUERY_TYPE = 'Query';

const AUTH_SDL = parse(`
  """Which ways of signing in this instance offers, so the sign-in page shows only those."""
  type AuthConfig {
    """
    Any email address signs in at once, with no link (SECURE_LOCAL_NET, or AUTH_MAGIC_LINK=false). Private networks
    only. False means signing in by address sends a link to follow.
    """
    secureLocalNet: Boolean!
    """The OIDC provider to sign in with (OIDC_ISSUER, or the paired one), or null when there is none."""
    sso: SsoProvider
  }

  """An OpenID Connect provider the sign-in page offers."""
  type SsoProvider {
    """What the button calls it (OIDC_NAME, or the name in the setup URL)."""
    name: String!
    """Where the button sends the browser. Absolute: in development the server is not the app's origin."""
    signInUrl: String!
  }

  extend type Query {
    """Readable signed out: the sign-in page asks it first."""
    authConfig: AuthConfig!
  }
`);

/**
 * Adds `authConfig` to the schema. Signing in and out are better-auth's own endpoints (endpoints.ts).
 *
 * @param schema - The schema so far.
 * @returns The schema with `authConfig` resolved.
 */
export function applyAuthExtension(schema: GraphQLSchema): GraphQLSchema {
  const extendedSchema = extendSchema(schema, AUTH_SDL);
  const queries = objectType(extendedSchema, QUERY_TYPE).getFields();

  queries.authConfig.resolve = async (_parent: unknown, _args: unknown, context: Context) => {
    const { config: oidc } = await effectiveOidc(context.db);
    return {
      secureLocalNet: magicLinkRequired() === false,
      sso: oidc === null ? null : { name: oidc.name, signInUrl: `${serverUrl()}${SSO_START_PATH}` },
    };
  };

  return extendedSchema;
}
