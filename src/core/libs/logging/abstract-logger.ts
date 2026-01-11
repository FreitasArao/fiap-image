export type LogContext = {
  originClass: string;
  originMethod: string;
};

export type LogExtra = {
  defaultContext?: LogContext;
  [key: string]: unknown;
};

export type Config = {
  suppressConsole?: boolean;
};

export type LoggerParams = {
  extra: LogExtra;
  context?: string;
  trace?: string;
};

export type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'trace';

export type BaseLogMeta = {
  context?: string;
  [key: string]: unknown;
};

export abstract class AbstractLoggerService<TLogLevel = string> {
  protected constructor(
    protected readonly config?: Config,
    protected readonly _context?: string,
  ) {}

  get context(): string | undefined {
    return this._context;
  }

  abstract withContext(context: string): AbstractLoggerService<TLogLevel>;

  abstract log(message: string, ...optionalParams: unknown[]): void;
  abstract error(message: string, ...optionalParams: unknown[]): void;
  abstract warn(message: string, ...optionalParams: unknown[]): void;
  abstract debug(message: string, ...optionalParams: unknown[]): void;
  abstract verbose(message: string, ...optionalParams: unknown[]): void;

  protected abstract _handle(
    level: LogLevel,
    message: string,
    extra: LogExtra,
    context?: string,
    trace?: string,
  ): void;

  protected parseParams(params: unknown[]) {
    const extra =
      (params.find((p) => typeof p === 'object' && p !== null) as LogExtra) ?? {};
    const context = this._context ?? params.find((p) => typeof p === 'string');
    const trace = params.find(
      (p) => typeof p === 'string' && p !== context,
    ) as string | undefined;

    return { extra, context, trace };
  }

  protected handleLog(
    level: LogLevel,
    message: string,
    extra: LogExtra,
    context?: string,
    trace?: string,
  ): void {
    if (this.config?.suppressConsole) return;
    this._handle(level, message, extra, context, trace);
  }
}
