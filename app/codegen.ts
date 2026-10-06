import type { CodegenConfig } from '@graphql-codegen/cli';

// Reads the SDL the server prints from its own Drizzle-derived schema, so the
// typed documents here cannot drift from what the API actually serves.
const config: CodegenConfig = {
  schema: '../server/__generated__/schema.graphql',
  documents: ['./src/**/*.ts', './src/**/*.tsx', '!./src/__generated__/**'],
  ignoreNoDocuments: true,
  generates: {
    'src/__generated__/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        avoidOptionals: {
          field: true,
        },
        useTypeImports: true,
        // `enum` is not erasable syntax; a union of literals is.
        enumsAsTypes: true,
        defaultScalarType: 'unknown',
        skipTypeNameForRoot: true,
        scalars: {
          // Timestamps cross the wire as ISO strings; nothing here needs a Date.
          DateTime: 'string',
          UUID: 'string',
          // `entryDate` is a calendar day. The `Date` scalar *serialises* to a
          // `YYYY-MM-DD` string — JSON has no date type and Apollo does not parse
          // custom scalars — so `string` is what actually arrives, and it is what
          // lets the value be read off a row and put straight into a route path.
          // Mapping it to `Date` would typecheck `.getFullYear()` and throw.
          //
          // The scalar is only half-applied upstream: the same column is `Date` on
          // output and `String!` on input, so there is nothing to map on the way in.
          // https://github.com/cubicecho/drizzle-graphql/issues/174
          Date: 'string',
        },
      },
    },
  },
};

export default config;
