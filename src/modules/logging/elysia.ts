import { Elysia } from 'elysia'
import { logger } from './index'

export const loggerPlugin = (app: Elysia) =>
  app.derive(({ path, request: { method } }) => {
    return {
      logger: logger.withContext(`${method} ${path}`),
    }
  })
