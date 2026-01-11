import { AbstractLoggerService, BaseLogMeta, Config, LogExtra, LogLevel } from "@core/libs/logging/abstract-logger";

import { Context, trace as otelTrace } from '@opentelemetry/api';
import pino, { Logger as PinoBaseLogger } from "pino";

export class PinoLoggerService extends AbstractLoggerService<pino.Level> {
  private readonly logger: PinoBaseLogger;

  constructor(
    config: Config,
    private readonly otelContext: Context,
    loggerInstance?: PinoBaseLogger,
    context?: string,
  ) {
    super(config, context);

    this.logger =
      loggerInstance ??
      pino({
        level: process.env.LOG_LEVEL || 'info',
        serializers: {
          err: pino.stdSerializers.err,
          error: pino.stdSerializers.err,
        },
        mixin: () => {
          const span = otelTrace.getSpan(otelContext);
          if (!span) return {};
          const { traceId, spanId } = span.spanContext();
          return { traceId, spanId };
        },
        transport: this.resolveTransport(),
      });
  }

  withContext(context: string): PinoLoggerService {
    return new PinoLoggerService(
      this.config!,
      this.otelContext,
      this.logger,
      context,
    );
  }

  protected _handle(level: LogLevel, message: string, extra: LogExtra): void {
    const handleLevel = this.getLogLevel()[level];

    const base: BaseLogMeta = {
      context: this._context,
      extra,
    };

    this.logger[handleLevel](base, message);
  }

  getLogLevel(): Record<LogLevel, pino.Level> {
    return {
      error: 'error',
      warn: 'warn',
      info: 'info',
      debug: 'debug',
      trace: 'trace',
    };
  }

  log(message: string, ...params: unknown[]) {
    const { extra, context, trace } = this.parseParams(params);
    this.handleLog('info', message, extra, context, trace);
  }

  error(message: string, ...params: unknown[]) {
    const { extra, context, trace } = this.parseParams(params);
    this.handleLog('error', message, extra, context, trace);
  }

  warn(message: string, ...params: unknown[]) {
    const { extra, context } = this.parseParams(params);
    this.handleLog('warn', message, extra, context);
  }

  debug(message: string, ...params: unknown[]) {
    const { extra, context } = this.parseParams(params);
    this.handleLog('debug', message, extra, context);
  }

  verbose(message: string, ...params: unknown[]) {
    const { extra, context } = this.parseParams(params);
    this.handleLog('trace', message, extra, context);
  }

  getTraceIdFromContext(): string | undefined {
    const span = otelTrace.getSpan(this.otelContext);
    return span?.spanContext().traceId;
  }

  private resolveTransport() {
    if (process.env.NODE_ENV === 'development') {
      return {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      };
    }

    return undefined;
  }
}
