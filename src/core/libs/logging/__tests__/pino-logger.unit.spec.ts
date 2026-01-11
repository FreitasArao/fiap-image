
import { PinoLoggerService } from '@core/libs/logging/pino-logger';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type pino from 'pino';

describe('PinoLoggerService - Unit', () => {
  let logger: PinoLoggerService;
  let mockPino: pino.Logger;

  beforeEach(() => {
    mockPino = {
      info: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
      trace: mock(),
      level: 'info',
    } as unknown as pino.Logger;

    logger = new PinoLoggerService(
      { suppressConsole: false },
      {} as any,
      mockPino,
      'TestContext',
    );
  });

  it('logs info with context', () => {
    logger.log('Test');

    expect(mockPino.info).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'TestContext' }),
      'Test',
    );
  });

  it('includes extra params', () => {
    logger.log('Test', { userId: 1 });

    expect(mockPino.info).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'TestContext',
        extra: { userId: 1 },
      }),
      'Test',
    );
  });

  it('creates new scoped logger with withContext()', () => {
    const scoped = logger.withContext('NewContext');

    expect(scoped).not.toBe(logger);
    expect(scoped.context).toBe('NewContext');
    expect(logger.context).toBe('TestContext');
  });

  it('does not log when suppressConsole=true', () => {
    const suppressed = new PinoLoggerService(
      { suppressConsole: true },
      {} as any,
      mockPino,
      'Silent',
    );

    suppressed.log('Nope');

    expect(mockPino.info).not.toHaveBeenCalled();
  });
});
