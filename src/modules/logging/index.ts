import { AbstractLoggerService } from "@core/libs/logging/abstract-logger";
import { PinoLoggerService } from "@core/libs/logging/pino-logger";
import { context } from "@opentelemetry/api";

export const logger: AbstractLoggerService = new PinoLoggerService({
  suppressConsole: false,
}, context.active())