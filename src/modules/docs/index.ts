import openapi, { fromTypes } from '@elysiajs/openapi'

export const docs = openapi({
  path: '/docs',
  references: fromTypes(
    Bun.env.NODE_ENV === 'production' ? 'dist/index.d.ts' : 'src/index.ts',
  ),
})
