import { describe, expect, it, mock, beforeEach, spyOn } from 'bun:test'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { StoragePathBuilder } from '@modules/video-processor/infra/services/storage'
import type { MessageContext } from '@core/messaging'
import type { SegmentMessage } from '@core/messaging/schemas'
import type {
  EventEmitter,
  VideoProcessorService,
  VideoStatusEvent,
} from '@workers/abstractions'
import { SegmentEventHandler, PrintWorkerDeps } from '@workers/print-worker'

function createMockLogger(): AbstractLoggerService {
  return new PinoLoggerService({ suppressConsole: true }, context.active())
}

function createMockProcessor(): VideoProcessorService {
  return {
    setup: mock(() => Promise.resolve()),
    cleanup: mock(() => Promise.resolve()),
    extractFramesFromUrl: mock(() =>
      Promise.resolve({ outputDir: '/tmp/frames', count: 10 }),
    ),
    uploadDir: mock(() => Promise.resolve()),
  }
}

function createMockEventEmitter(): EventEmitter & {
  emittedEvents: VideoStatusEvent[]
} {
  const emittedEvents: VideoStatusEvent[] = []
  return {
    emittedEvents,
    emitVideoStatus: mock((event: VideoStatusEvent) => {
      emittedEvents.push(event)
      return Promise.resolve()
    }),
  }
}

function createTestPathBuilder(): StoragePathBuilder {
  return new StoragePathBuilder({
    videoBucket: 'test-bucket',
    region: 'us-east-1',
  })
}

function createTestHandler(deps: Partial<PrintWorkerDeps> = {}) {
  const logger = createMockLogger()
  const eventEmitter = deps.eventEmitter ?? createMockEventEmitter()
  const processor = createMockProcessor()

  const fullDeps: PrintWorkerDeps = {
    logger,
    eventEmitter,
    processorFactory: deps.processorFactory ?? (() => processor),
    pathBuilder: deps.pathBuilder ?? createTestPathBuilder(),
    outputBucket: deps.outputBucket ?? 'test-bucket',
    frameInterval: deps.frameInterval ?? 1,
  }

  const handler = new SegmentEventHandler(fullDeps)

  return {
    handler,
    logger,
    eventEmitter: eventEmitter as EventEmitter & {
      emittedEvents: VideoStatusEvent[]
    },
    processor,
    deps: fullDeps,
  }
}

function createContext(correlationId?: string): MessageContext {
  return {
    metadata: correlationId
      ? {
          messageId: 'msg-123',
          correlationId,
          traceId: 'trace-123',
          spanId: 'span-123',
          source: 'test',
          eventType: 'video.segment.print',
          version: '1.0',
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 3,
        }
      : null,
    messageId: 'sqs-msg-123',
  }
}

describe('SegmentEventHandler', () => {
  describe('parse', () => {
    it('should parse valid payload', () => {
      const { handler } = createTestHandler()
      const validPayload: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        segmentNumber: 1,
        totalSegments: 10,
        startTime: 0,
        endTime: 10,
      }

      const result = handler.parse(validPayload)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validPayload)
      }
    })

    it('should fail for invalid payload', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({ invalid: 'data' })

      expect(result.success).toBe(false)
    })

    it('should fail for payload missing required fields', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({
        videoId: 'video-123',
        // missing presignedUrl and other required fields
      })

      expect(result.success).toBe(false)
    })
  })

  describe('isNonRetryableError', () => {
    it.each([
      ['404 Not Found', true],
      ['NoSuchKey: The specified key does not exist', true],
      ['Resource does not exist', true],
      ['Invalid parameter value', true],
      ['File not found on server', true],
      ['Connection timeout', false],
      ['Internal server error', false],
      ['Rate limit exceeded', false],
    ])('should return %s for error "%s"', (errorMessage, expected) => {
      const { handler } = createTestHandler()

      // Access private method via any
      const result = (
        handler as unknown as { isNonRetryableError: (e: Error) => boolean }
      ).isNonRetryableError(new Error(errorMessage))

      expect(result).toBe(expected)
    })
  })

  describe('checkAndUpdateProgress', () => {
    it('should return true when segment is the last one', () => {
      const { handler } = createTestHandler()

      // Access private method via any
      const result = (
        handler as unknown as {
          checkAndUpdateProgress: (
            v: string,
            s: number,
            t: number,
            c: string,
          ) => boolean
        }
      ).checkAndUpdateProgress('video-123', 10, 10, 'corr-123')

      expect(result).toBe(true)
    })

    it('should return false when segment is not the last one', () => {
      const { handler } = createTestHandler()

      const result = (
        handler as unknown as {
          checkAndUpdateProgress: (
            v: string,
            s: number,
            t: number,
            c: string,
          ) => boolean
        }
      ).checkAndUpdateProgress('video-123', 5, 10, 'corr-123')

      expect(result).toBe(false)
    })

    it('should return true for single segment video', () => {
      const { handler } = createTestHandler()

      const result = (
        handler as unknown as {
          checkAndUpdateProgress: (
            v: string,
            s: number,
            t: number,
            c: string,
          ) => boolean
        }
      ).checkAndUpdateProgress('video-123', 1, 1, 'corr-123')

      expect(result).toBe(true)
    })
  })

  describe('handle', () => {
    it('should process segment and extract frames', async () => {
      const processor = createMockProcessor()
      const { handler } = createTestHandler({
        processorFactory: () => processor,
      })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 1,
        totalSegments: 10,
        startTime: 0,
        endTime: 10,
      }

      await handler.handle(message, createContext('corr-123'))

      expect(processor.setup).toHaveBeenCalled()
      expect(processor.extractFramesFromUrl).toHaveBeenCalledWith(
        'https://s3.amazonaws.com/bucket/video.mp4',
        0,
        10,
        1,
      )
      expect(processor.uploadDir).toHaveBeenCalled()
      expect(processor.cleanup).toHaveBeenCalled()
    })

    it('should emit COMPLETED event when last segment is processed', async () => {
      const eventEmitter = createMockEventEmitter()
      const { handler } = createTestHandler({ eventEmitter })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 10,
        totalSegments: 10,
        startTime: 90,
        endTime: 100,
        userEmail: 'user@example.com',
        videoName: 'my-video.mp4',
      }

      await handler.handle(message, createContext('corr-123'))

      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0]).toMatchObject({
        videoId: 'video-123',
        status: 'COMPLETED',
        userEmail: 'user@example.com',
        videoName: 'my-video.mp4',
        correlationId: 'corr-123',
      })
    })

    it('should NOT emit event for non-last segments', async () => {
      const eventEmitter = createMockEventEmitter()
      const { handler } = createTestHandler({ eventEmitter })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 5,
        totalSegments: 10,
        startTime: 40,
        endTime: 50,
      }

      await handler.handle(message, createContext('corr-123'))

      expect(eventEmitter.emittedEvents).toHaveLength(0)
    })

    it('should cleanup even if processing fails', async () => {
      const processor = createMockProcessor()
      processor.extractFramesFromUrl = mock(() =>
        Promise.reject(new Error('FFmpeg failed')),
      )

      const { handler } = createTestHandler({
        processorFactory: () => processor,
      })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 1,
        totalSegments: 10,
        startTime: 0,
        endTime: 10,
      }

      await expect(
        handler.handle(message, createContext('corr-123')),
      ).rejects.toThrow('FFmpeg failed')

      expect(processor.cleanup).toHaveBeenCalled()
    })

    it('should emit FAILED event for non-retryable errors', async () => {
      const eventEmitter = createMockEventEmitter()
      const processor = createMockProcessor()
      processor.extractFramesFromUrl = mock(() =>
        Promise.reject(
          new Error('NoSuchKey: The specified key does not exist'),
        ),
      )

      const { handler } = createTestHandler({
        eventEmitter,
        processorFactory: () => processor,
      })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 1,
        totalSegments: 10,
        startTime: 0,
        endTime: 10,
        userEmail: 'user@example.com',
        videoName: 'my-video.mp4',
      }

      await expect(
        handler.handle(message, createContext('corr-123')),
      ).rejects.toThrow()

      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0]).toMatchObject({
        videoId: 'video-123',
        status: 'FAILED',
        correlationId: 'corr-123',
        errorReason: 'NoSuchKey: The specified key does not exist',
      })
    })

    it('should NOT emit FAILED event for retryable errors', async () => {
      const eventEmitter = createMockEventEmitter()
      const processor = createMockProcessor()
      processor.extractFramesFromUrl = mock(() =>
        Promise.reject(new Error('Connection timeout')),
      )

      const { handler } = createTestHandler({
        eventEmitter,
        processorFactory: () => processor,
      })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 1,
        totalSegments: 10,
        startTime: 0,
        endTime: 10,
      }

      await expect(
        handler.handle(message, createContext('corr-123')),
      ).rejects.toThrow()

      expect(eventEmitter.emittedEvents).toHaveLength(0)
    })

    it('should use SQS messageId as correlationId when metadata is null', async () => {
      const eventEmitter = createMockEventEmitter()
      const { handler } = createTestHandler({ eventEmitter })

      const message: SegmentMessage = {
        videoId: 'video-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
        segmentNumber: 10,
        totalSegments: 10,
        startTime: 90,
        endTime: 100,
      }

      // Context without metadata (legacy format)
      await handler.handle(message, createContext())

      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0].correlationId).toBe('sqs-msg-123')
    })
  })
})
