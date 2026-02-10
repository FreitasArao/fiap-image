import { mock } from 'bun:test'
import {
  AbstractLoggerService,
  type Config,
  type LogExtra,
  type LogLevel,
} from '@core/libs/logging/abstract-logger'

/**
 * Test stub for AbstractLoggerService.
 * Provides mock functions for all abstract methods,
 * avoiding the need for `as unknown as` casts in tests.
 */
export class LoggerStub extends AbstractLoggerService {
  readonly log = mock<(message: string, ...params: unknown[]) => void>()
  readonly error = mock<(message: string, ...params: unknown[]) => void>()
  readonly warn = mock<(message: string, ...params: unknown[]) => void>()
  readonly debug = mock<(message: string, ...params: unknown[]) => void>()
  readonly verbose = mock<(message: string, ...params: unknown[]) => void>()

  constructor(config: Config = {}, context?: string) {
    super(config, context)
  }

  withContext(context: string): LoggerStub {
    return new LoggerStub(this.config, context)
  }

  protected _handle(
    _level: LogLevel,
    _message: string,
    _extra: LogExtra,
    _context?: string,
    _trace?: string,
  ): void {
    // no-op for stub
  }

  /**
   * Resets all mock functions.
   */
  reset(): void {
    this.log.mockClear()
    this.error.mockClear()
    this.warn.mockClear()
    this.debug.mockClear()
    this.verbose.mockClear()
  }
}
