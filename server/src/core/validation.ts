import type { z } from 'zod';
import { badInput } from './errors.ts';

/**
 * Parses with zod, turning a failure into BAD_USER_INPUT.
 *
 * @typeParam T - What the schema parses to.
 * @param schema - The zod schema.
 * @param value - Untrusted input.
 * @returns The parsed value.
 * @throws BAD_USER_INPUT with the first issue's message.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  const isInvalid = result.success === false;
  if (isInvalid) {
    const [firstIssue] = result.error.issues;
    throw badInput(firstIssue?.message ?? 'Invalid input');
  }
  return result.data;
}
