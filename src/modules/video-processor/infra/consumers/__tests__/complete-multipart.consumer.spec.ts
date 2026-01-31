import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { Result } from '@core/domain/result'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import {
  CompleteMultipartMessageHandler,
  createCompleteMultipartConsumer,
} from '@modules/video-processor/infra/consumers/complete-multipart.consumer'
import { CompleteMultipartHandler } from '@modules/video-processor/infra/consumers/complete-multipart-handler'
import type { CompleteMultipartEvent } from '@core/messaging/schemas'
import type { MessageContext } from '@core/messaging'

function createMockHandler(): CompleteMultipartHandler {
  const mockLogger = new PinoLoggerService(
    { suppressConsole: true },
    context.active(),
  )

  const handler = new CompleteMultipartHandler(
    mockLogger,
    new InMemoryVideoRepository(),
  )

  return handler
}

describe('CompleteMultipartMessageHandler', () => {
  let messageHandler: CompleteMultipartMessageHandler
  let innerHandler: CompleteMultipartHandler
  let handleSpy: ReturnType<typeof spyOn>
  let logger: PinoLoggerService

  beforeEach(() => {
    logger = new PinoLoggerService({ suppressConsole: true }, context.active())
    innerHandler = createMockHandler()
    handleSpy = spyOn(innerHandler, 'handle').mockResolvedValue(Result.ok())
    messageHandler = new CompleteMultipartMessageHandler(logger, innerHandler)
  })

  describe('parse', () => {
    it('should parse valid S3 event payload', () => {
      const validPayload = {
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: 'bucket/video/video-id/video.mp4' },
          reason: 'CompleteMultipartUpload',
        },
      }

      const result = messageHandler.parse(validPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.detail.object.key).toBe(
          'bucket/video/video-id/video.mp4',
        )
        expect(result.data.detail.bucket.name).toBe('test-bucket')
      }
    })

    it('should return error when detail field is missing', () => {
      const invalidPayload = {
        bucket: { name: 'test-bucket' },
        object: { key: 'video-id/video.mp4' },
      }

      const result = messageHandler.parse(invalidPayload)

      expect(result.success).toBe(false)
    })

    it('should parse payload with minimal required fields', () => {
      const minimalPayload = {
        detail: {
          bucket: { name: 'bucket' },
          object: { key: 'key' },
          reason: 'reason',
        },
      }

      const result = messageHandler.parse(minimalPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.detail.bucket.name).toBe('bucket')
      }
    })
  })

  describe('handle', () => {
    const createS3Event = (key: string): CompleteMultipartEvent => ({
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key },
        reason: 'CompleteMultipartUpload',
      },
    })

    const createContext = (correlationId?: string): MessageContext => ({
      metadata: correlationId
        ? {
            messageId: 'msg-123',
            correlationId,
            traceId: 'trace-123',
            spanId: 'span-123',
            source: 'test',
            eventType: 'video.multipart.complete',
            version: '1.0',
            timestamp: new Date().toISOString(),
            retryCount: 0,
            maxRetries: 3,
          }
        : null,
      messageId: 'sqs-msg-123',
    })

    it('should call innerHandler.handle with the event and correlationId', async () => {
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-456')

      await messageHandler.handle(event, msgContext)

      expect(handleSpy).toHaveBeenCalledTimes(1)
      expect(handleSpy).toHaveBeenCalledWith(event, 'corr-456')
    })

    it('should use SQS messageId as correlationId when metadata is null', async () => {
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext() // no correlationId in metadata

      await messageHandler.handle(event, msgContext)

      expect(handleSpy).toHaveBeenCalledWith(event, 'sqs-msg-123')
    })

    it('should complete successfully when handler returns success', async () => {
      handleSpy.mockResolvedValue(Result.ok())
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-123')

      await expect(
        messageHandler.handle(event, msgContext),
      ).resolves.toBeUndefined()
    })

    it('should complete successfully even when handler returns failure', async () => {
      handleSpy.mockResolvedValue(Result.fail(new Error('Handler error')))
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-123')

      await expect(
        messageHandler.handle(event, msgContext),
      ).resolves.toBeUndefined()
    })
  })
})

describe('createCompleteMultipartConsumer', () => {
  const originalEnv = process.env.COMPLETE_MULTIPART_QUEUE_URL

  beforeEach(() => {
    process.env.COMPLETE_MULTIPART_QUEUE_URL =
      'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
  })

  afterEach(() => {
    process.env.COMPLETE_MULTIPART_QUEUE_URL = originalEnv
  })

  it('should create a consumer with the factory function', () => {
    const logger = new PinoLoggerService(
      { suppressConsole: true },
      context.active(),
    )
    const handler = createMockHandler()

    const consumer = createCompleteMultipartConsumer(logger, handler)

    expect(consumer).toBeDefined()
    expect(consumer.isRunning()).toBe(false)
  })

  it('should create a consumer with explicit queueUrl', () => {
    const logger = new PinoLoggerService(
      { suppressConsole: true },
      context.active(),
    )
    const handler = createMockHandler()

    const consumer = createCompleteMultipartConsumer(
      logger,
      handler,
      'https://custom.queue.url',
    )

    expect(consumer).toBeDefined()
  })
})
