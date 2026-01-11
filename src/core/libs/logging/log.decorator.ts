import { AbstractLoggerService } from "@core/libs/logging/abstract-logger";


export interface LoggerContainer {
  logger: AbstractLoggerService;
}

export function Log(): MethodDecorator {
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: LoggerContainer,
      ...args: unknown[]
    ) {
      const logger = this.logger;
      const methodName = String(propertyKey);

      if (logger) {
        logger.log(`Executing ${methodName}`, {
          args,
          originMethod: methodName,
        });
      }

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (error) {
        if (logger) {
          logger.error(`Error executing ${methodName}`, {
            error,
            originMethod: methodName,
          });
        }
        throw error;
      }
    };

    return descriptor;
  };
}
