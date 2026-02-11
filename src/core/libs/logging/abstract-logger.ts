export type LogContext = {
  originClass: string
  originMethod: string
}

export type LogExtra = {
  defaultContext?: LogContext
  [key: string]: unknown
}

export type Config = {
  suppressConsole?: boolean
  serviceName?: string
}

export type LoggerParams = {
  extra: LogExtra
  context?: string
  trace?: string
}

export type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'trace'

export type BaseLogMeta = {
  context?: string
  [key: string]: unknown
}

/**
 * Datadog standard attributes for log-based metrics.
 * @see https://docs.datadoghq.com/standard-attributes/
 * @see https://docs.datadoghq.com/logs/log_configuration/attributes_naming_convention
 */
export type DatadogLogMeta = {
  /** Datadog trace correlation */
  'dd.trace_id'?: string
  'dd.span_id'?: string
  'dd.correlation_id'?: string

  /** Duration in nanoseconds (Datadog standard) */
  duration?: number

  /** HTTP standard attributes */
  'http.method'?: string
  'http.status_code'?: number
  'http.url'?: string
  'http.url_details.path'?: string

  /** Network attributes */
  'network.client.ip'?: string

  /** Service identification */
  service?: string
  env?: string
  version?: string

  /** Custom business attributes */
  component?: string
  status?: string
  [key: string]: unknown
}

export abstract class AbstractLoggerService<TLogLevel = string> {
  protected constructor(
    protected readonly config: Config,
    protected readonly _context?: string,
  ) {}

  get context(): string | undefined {
    return this._context
  }

  abstract withContext(context: string): AbstractLoggerService<TLogLevel>

  abstract log(message: string, ...optionalParams: unknown[]): void
  abstract error(message: string, ...optionalParams: unknown[]): void
  abstract warn(message: string, ...optionalParams: unknown[]): void
  abstract debug(message: string, ...optionalParams: unknown[]): void
  abstract verbose(message: string, ...optionalParams: unknown[]): void

  protected abstract _handle(
    level: LogLevel,
    message: string,
    extra: LogExtra,
    context?: string,
    trace?: string,
  ): void

  protected parseParams(params: unknown[]) {
    const extra =
      (params.find((p) => typeof p === 'object' && p !== null) as LogExtra) ??
      {}
    const context = this._context ?? params.find((p) => typeof p === 'string')
    const trace = params.find((p) => typeof p === 'string' && p !== context) as
      | string
      | undefined

    return { extra, context, trace }
  }

  protected handleLog(
    level: LogLevel,
    message: string,
    extra: LogExtra,
    context?: string,
    trace?: string,
  ): void {
    if (this.config?.suppressConsole) return
    this._handle(level, message, extra, context, trace)
  }
}
