import { describe, it, expect, beforeEach, mock } from 'bun:test'
import type { MessageHandler, MessageContext, ParseResult } from '@core/messaging'
import { createSQSConsumer } from '../abstract-sqs-consumer'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

class TestMessageHandler implements MessageHandler<{ id: string; value: number }> {
  public parsedPayloads: unknown[] = []
  public handledPayloads: Array<{ payload: unknown; context: MessageContext }> = []
  public shouldFailParse = false
  public shouldFailHandle = false

  parse(rawPayload: unknown): ParseResult<{ id: string; value: number }> {
    this.parsedPayloads.push(rawPayload)

    if (this.shouldFailParse) {
      return { success: false, error: 'Parse failed' }
    }

    const payload = rawPayload as { id?: string; value?: number }
    if (!payload.id || typeof payload.value !== 'number') {
      return { success: false, error: 'Invalid payload structure' }
    }

    return {
      success: true,
      data: { id: payload.id, value: payload.value },
    }
  }

  async handle(
    payload: { id: string; value: number },
    context: MessageContext,
  ): Promise<void> {
    this.handledPayloads.push({ payload, context })

    if (this.shouldFailHandle) {
      throw new Error('Handle failed')
    }
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

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('test-1')
        expect(result.data.value).toBe(100)
      }
    })

    it('should fail for invalid payload structure', () => {
      const result = handler.parse({ invalid: 'data' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid payload structure')
      }
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

      await handler.handle(payload, msgContext)

      expect(handler.handledPayloads.length).toBe(1)
      expect(handler.handledPayloads[0].payload).toEqual(payload)
      expect(handler.handledPayloads[0].context.metadata?.correlationId).toBe('corr-456')
    })
  })
})
