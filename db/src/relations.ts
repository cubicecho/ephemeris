import { defineRelations } from 'drizzle-orm';
import * as schema from './schema.ts';

// This config — not the table list — is what drizzle-graphql reads, so a table
// with no entry here gets no relation fields in the API.
export const relations = defineRelations(schema, (r) => ({
  users: {
    entries: r.many.entries({ from: r.users.id, to: r.entries.userId }),
  },

  entries: {
    user: r.one.users({ from: r.entries.userId, to: r.users.id }),
  },
}));
