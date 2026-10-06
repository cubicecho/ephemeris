import { db } from '@cubicecho/ephemeris-db';
import { createSchema } from './build-schema.ts';

const { schema, entities } = createSchema(db);

export { entities, schema };
