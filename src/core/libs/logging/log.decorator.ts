import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export interface LoggerContainer {
  logger: AbstractLoggerService
}

/** Convert milliseconds to nanoseconds (Datadog standard) */
const msToNs = (ms: number): number => Math.round(ms * 1_000_000)

export function Log(): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (
      this: LoggerContainer,
      ...args: unknown[]
    ) {
      const logger = this.logger
      const methodName = String(propertyKey)
      const startTime = performance.now()

      if (logger) {
        logger.log(`method.execution.start`, {
          originMethod: methodName,
          component: 'decorator',
        })
      }

      try {
        const result = await originalMethod.apply(this, args)

        if (logger) {
          logger.log(`method.execution.end`, {
            originMethod: methodName,
            duration: msToNs(performance.now() - startTime),
            status: 'success',
            component: 'decorator',
          })
        }

        return result
      } catch (error) {
        if (logger) {
          logger.error(`method.execution.end`, {
            error: error instanceof Error ? error.message : String(error),
            originMethod: methodName,
            duration: msToNs(performance.now() - startTime),
            status: 'error',
            component: 'decorator',
          })
        }
        throw error
      }
    }

    return descriptor
  }
}
