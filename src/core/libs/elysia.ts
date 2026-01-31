import { loggerPlugin } from '@modules/logging/elysia'
import { correlationMiddleware } from '@modules/telemetry/correlation-context'
import { Elysia } from 'elysia'

export class BaseElysia {
  static create(options: ConstructorParameters<typeof Elysia>[0] = {}) {
    return new Elysia(options).use(loggerPlugin).use(correlationMiddleware)
  }
}
