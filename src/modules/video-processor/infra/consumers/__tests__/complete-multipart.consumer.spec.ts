import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { Result } from '@core/domain/result'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { CorrelationStore } from '@core/libs/context'
import { context } from '@opentelemetry/api'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import {
  CompleteMultipartMessageHandler,
  createCompleteMultipartConsumer,
} from '@modules/video-processor/infra/consumers/complete-multipart.consumer'
import { CompleteMultipartHandler } from '@modules/video-processor/infra/consumers/complete-multipart-handler'
import { ReconcileUploadService } from '@modules/video-processor/domain/services/reconcile-upload.service'
import { SqsUploadReconciler } from '@modules/video-processor/domain/services/sqs-upload-reconciler.service'
import type { CompleteMultipartEvent } from '@core/messaging/schemas'
import type { MessageContext } from '@core/messaging'

function createMockEventBridge() {
  return {
    eventBusName: 'test-bus',
    send: async () => Result.ok({ FailedEntryCount: 0 }),
  }
}

function createMockHandler(): CompleteMultipartHandler {
  const mockLogger = new PinoLoggerService(
    { suppressConsole: true },
    context.active(),
  )

  const videoRepository = new InMemoryVideoRepository()
  const eventBridge = createMockEventBridge()
  const reconcileService = new ReconcileUploadService(
    mockLogger,
    videoRepository,
    eventBridge as unknown as Parameters<
      typeof ReconcileUploadService.prototype.reconcile
    >[0] extends { eventBridge: infer E }
      ? E
      : never,
  )

  const sqsReconciler = new SqsUploadReconciler(
    mockLogger,
    videoRepository,
    reconcileService,
  )

  const handler = new CompleteMultipartHandler(mockLogger, sqsReconciler)

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

      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.detail.object.key).toBe(
          'bucket/video/video-id/video.mp4',
        )
        expect(result.value.detail.bucket.name).toBe('test-bucket')
      }
    })

    it('should return error when detail field is missing', () => {
      const invalidPayload = {
        bucket: { name: 'test-bucket' },
        object: { key: 'video-id/video.mp4' },
      }

      const result = messageHandler.parse(invalidPayload)

      expect(result.isFailure).toBe(true)
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

      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.detail.bucket.name).toBe('bucket')
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

    const createContext = (correlationId = 'default-corr'): MessageContext => ({
      metadata: {
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
      },
      messageId: 'sqs-msg-123',
    })

    it('should call innerHandler.handle with the event (correlationId is implicit via CorrelationStore)', async () => {
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-456')

      await CorrelationStore.run(
        { correlationId: 'corr-456', traceId: 'trace-123' },
        () => messageHandler.handle(event, msgContext),
      )

      expect(handleSpy).toHaveBeenCalledTimes(1)
      expect(handleSpy).toHaveBeenCalledWith(event)
    })

    it('should delegate to handler with default correlationId', async () => {
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext()

      await CorrelationStore.run({ correlationId: 'default-corr' }, () =>
        messageHandler.handle(event, msgContext),
      )

      expect(handleSpy).toHaveBeenCalledWith(event)
    })

    it('should return success Result when handler returns success', async () => {
      handleSpy.mockResolvedValue(Result.ok())
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-123')

      const result = await CorrelationStore.run(
        { correlationId: 'corr-123' },
        () => messageHandler.handle(event, msgContext),
      )
      expect(result.isSuccess).toBeTrue()
    })

    it('should return failure Result when handler returns failure', async () => {
      handleSpy.mockResolvedValue(Result.fail(new Error('Handler error')))
      const event = createS3Event('bucket/video/video-123/video.mp4')
      const msgContext = createContext('corr-123')

      const result = await CorrelationStore.run(
        { correlationId: 'corr-123' },
        () => messageHandler.handle(event, msgContext),
      )
      expect(result.isFailure).toBeTrue()
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
