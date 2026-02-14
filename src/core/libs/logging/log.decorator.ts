import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { msToNs } from '@core/libs/logging/log-event'

export interface LoggerContainer {
  logger: AbstractLoggerService
}

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
        logger.log('Method execution started', {
          event: 'method.execution.start',
          resource: 'LogDecorator',
          originMethod: methodName,
        })
      }

      try {
        const result = await originalMethod.apply(this, args)

        if (logger) {
          logger.log('Method execution ended', {
            event: 'method.execution.end',
            resource: 'LogDecorator',
            originMethod: methodName,
            duration: msToNs(performance.now() - startTime),
            status: 'success',
          })
        }

        return result
      } catch (error) {
        if (logger) {
          logger.error('Method execution failed', {
            event: 'method.execution.end',
            resource: 'LogDecorator',
            originMethod: methodName,
            duration: msToNs(performance.now() - startTime),
            status: 'failure',
            error: {
              message: error instanceof Error ? error.message : String(error),
              kind: error instanceof Error ? error.constructor.name : 'Error',
              stack: error instanceof Error ? error.stack : undefined,
            },
          })
        }
        throw error
      }
    }

    return descriptor
  }
}
