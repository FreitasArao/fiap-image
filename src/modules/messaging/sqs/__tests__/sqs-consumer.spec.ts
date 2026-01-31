import { describe, it, expect, beforeEach, mock } from 'bun:test'
import type { MessageHandler, MessageContext } from '@core/messaging'
import { Result } from '@core/domain/result'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import { createSQSConsumer } from '../abstract-sqs-consumer'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

type TestPayload = { id: string; value: number }

class TestMessageHandler implements MessageHandler<TestPayload> {
  public parsedPayloads: unknown[] = []
  public handledPayloads: Array<{
    payload: TestPayload
    context: MessageContext
  }> = []
  public shouldFailParse = false
  public shouldFailHandle = false
  public shouldFailWithNonRetryable = false

  parse(rawPayload: unknown): Result<TestPayload, Error> {
    this.parsedPayloads.push(rawPayload)

    if (this.shouldFailParse) {
      return Result.fail(new Error('Parse failed'))
    }

    const payload = rawPayload as { id?: string; value?: number }
    if (!payload.id || typeof payload.value !== 'number') {
      return Result.fail(new Error('Invalid payload structure'))
    }

    return Result.ok({ id: payload.id, value: payload.value })
  }

  async handle(
    payload: TestPayload,
    context: MessageContext,
  ): Promise<Result<void, Error>> {
    this.handledPayloads.push({ payload, context })

    if (this.shouldFailWithNonRetryable) {
      return Result.fail(new NonRetryableError('Non-retryable error'))
    }

    if (this.shouldFailHandle) {
      return Result.fail(new Error('Handle failed'))
    }

    return Result.ok(undefined)
  }
}

describe('AbstractSQSConsumer', () => {
  let logger: AbstractLoggerService
  let handler: TestMessageHandler

  beforeEach(() => {
    logger = {
      log: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
    } as unknown as AbstractLoggerService
    handler = new TestMessageHandler()
  })

  describe('constructor', () => {
    it('should create consumer with handler', () => {
      const consumer = createSQSConsumer(
        { queueUrl: 'http://test.url' },
        logger,
        handler,
      )

      expect(consumer).toBeDefined()
      expect(consumer.isRunning()).toBe(false)
    })
  })

  describe('handler integration', () => {
    it('should parse valid payload structure', () => {
      const result = handler.parse({ id: 'test-1', value: 100 })

      expect(result.isSuccess).toBe(true)
      expect(result.value.id).toBe('test-1')
      expect(result.value.value).toBe(100)
    })

    it('should fail for invalid payload structure', () => {
      const result = handler.parse({ invalid: 'data' })

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toBe('Invalid payload structure')
    })

    it('should handle payload with context', async () => {
      const payload = { id: 'test-1', value: 42 }
      const msgContext: MessageContext = {
        metadata: {
          messageId: 'msg-123',
          correlationId: 'corr-456',
          traceId: 'trace-789',
          spanId: 'span-012',
          source: 'test',
          eventType: 'test.event',
          version: '1.0',
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 3,
        },
        messageId: 'sqs-msg-id',
      }

      const result = await handler.handle(payload, msgContext)

      expect(result.isSuccess).toBe(true)
      expect(handler.handledPayloads.length).toBe(1)
      expect(handler.handledPayloads[0].payload).toEqual(payload)
      expect(handler.handledPayloads[0].context.metadata?.correlationId).toBe(
        'corr-456',
      )
    })
  })

  describe('non-retryable behavior', () => {
    it('should return failure Result when parse fails', () => {
      handler.shouldFailParse = true

      const result = handler.parse({ id: 'test', value: 1 })

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toBe('Parse failed')
    })

    it('should return failure Result with NonRetryableError', async () => {
      handler.shouldFailWithNonRetryable = true
      const msgContext: MessageContext = { metadata: null, messageId: 'msg-1' }

      const result = await handler.handle({ id: 'test', value: 1 }, msgContext)

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
    })

    it('should return failure Result with retryable Error', async () => {
      handler.shouldFailHandle = true
      const msgContext: MessageContext = { metadata: null, messageId: 'msg-1' }

      const result = await handler.handle({ id: 'test', value: 1 }, msgContext)

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(false)
    })
  })
})
