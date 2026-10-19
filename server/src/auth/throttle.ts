import type { Context } from '../core/context.ts';

/** The sign-in steps that are throttled. Each has its own budget. */
export const AuthFlow = {
  SignInMagicLink: 'sign-in-magic-link',
  MagicLinkVerify: 'magic-link-verify',
  VerifyOneTimeToken: 'verify-one-time-token',
} as const;
export type AuthFlow = (typeof AuthFlow)[keyof typeof AuthFlow];

/**
 * Counts one sign-in attempt, by client address and by account, and throws once the caller has made too many.
 *
 * @param context - The request's context, for its limiter and client address.
 * @param flow - Which sign-in step this is.
 * @param [email] - The normalized address, when the step names one.
 * @throws A TOO_MANY_REQUESTS error when the address or the account is over its budget.
 *
 * @remarks
 * Every sign-in step is unauthenticated. Unthrottled, anyone who can reach the port can bury one inbox in links, walk
 * through addresses, or guess at tokens as fast as they can send them. Two keys, because each stops what the other
 * cannot: the account stops many machines burying one inbox, and the address stops one machine walking many accounts.
 * better-auth's own limiter only runs on its REST routes, which are not mounted, so this is the only one there is.
 */
export function throttle(context: Context, flow: AuthFlow, email?: string): void {
  const keys = [`${flow}:ip:${context.ip}`];
  if (email !== undefined) {
    keys.push(`${flow}:email:${email}`);
  }
  context.limiter.hit(...keys);
}
