import type { OnWriteConfig, WriteHookPayload } from '@vantreeseba/drizzle-graphql';
import { maxBodyChars } from '../core/config.ts';
import { parseOrThrow } from '../core/validation.ts';
import { writtenRows } from '../graphql/write-guards.ts';
import { createEntryInput } from './input.ts';

// Both rules are also database constraints, so this layer exists for the message, not for the guarantee.
// A caller who typed 6 should be told the scale is 1 to 5, not handed a check-constraint violation.

/** Validation hooks for `entries`. */
export const entryWriteHooks: OnWriteConfig = {
  entries: {
    /**
     * Validates the mood scale and the body limit.
     *
     * @param payload - The write about to run. A throw rolls it back.
     */
    before: async ({ args }: WriteHookPayload) => {
      const entryInput = createEntryInput({ maxBodyLength: maxBodyChars() });
      for (const row of writtenRows(args)) {
        parseOrThrow(entryInput, row);
      }
    },
  },
};
