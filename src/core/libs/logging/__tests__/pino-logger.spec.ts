
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger';
import { PinoLoggerService } from '@core/libs/logging/pino-logger';

import { context } from '@opentelemetry/api';
import { beforeEach, describe, expect, it } from 'bun:test';
class TestService {
  constructor(public readonly logger: AbstractLoggerService) {}

  someAction() {
    this.logger.log('action executed');
  }
}

describe('Logger Integration (Scoped, Immutable)', () => {
  let baseLogger: PinoLoggerService;
  let testService: TestService;

  beforeEach(() => {
    baseLogger = new PinoLoggerService(
      { suppressConsole: true },
      context.active()
    );

    const scopedLogger = baseLogger.withContext('TestService');

    testService = new TestService(scopedLogger);
  });

  it('injects a scoped logger with TestService context', () => {
    expect(testService.logger).toBeInstanceOf(PinoLoggerService);
    expect(testService.logger.context).toBe('TestService');
  });

  it('preserves context when logging', () => {
    testService.someAction();
    expect(testService.logger.context).toBe('TestService');
  });

  it('does not contaminate base logger', () => {
    expect(baseLogger.context).toBeUndefined();
  });
});
