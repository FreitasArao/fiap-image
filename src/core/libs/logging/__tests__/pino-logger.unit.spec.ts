import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'
import { beforeEach, describe, expect, it } from 'bun:test'
import type { Logger as PinoBaseLogger } from 'pino'
import { createPinoStub } from './pino.stub'

describe('PinoLoggerService - Unit', () => {
  let logger: PinoLoggerService
  let mockPino: PinoBaseLogger

  beforeEach(() => {
    mockPino = createPinoStub()

    logger = new PinoLoggerService(
      { suppressConsole: false },
      context.active(),
      mockPino,
      'TestContext',
    )
  })

  it('logs info with context', () => {
    logger.log('Test')

    expect(mockPino.info).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'TestContext' }),
      'Test',
    )
  })

  it('includes extra params', () => {
    logger.log('Test', { userId: 1 })

    expect(mockPino.info).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'TestContext',
        extra: { userId: 1 },
      }),
      'Test',
    )
  })

  it('creates new scoped logger with withContext()', () => {
    const scoped = logger.withContext('NewContext')

    expect(scoped).not.toBe(logger)
    expect(scoped.context).toBe('NewContext')
    expect(logger.context).toBe('TestContext')
  })

  it('does not log when suppressConsole=true', () => {
    const suppressed = new PinoLoggerService(
      { suppressConsole: true },
      context.active(),
      mockPino,
      'Silent',
    )

    suppressed.log('Nope')

    expect(mockPino.info).not.toHaveBeenCalled()
  })
})
