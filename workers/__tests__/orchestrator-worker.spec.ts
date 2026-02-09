import { describe, expect, it, mock, beforeEach } from 'bun:test'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import { StoragePathBuilder } from '@modules/video-processor/infra/services/storage'
import type { MessageContext } from '@core/messaging'
import type { VideoEvent, SegmentMessage } from '@core/messaging/schemas'
import { Result } from '@core/domain/result'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import type {
  EventBusEmitter,
  VideoStatusChangedEvent,
} from '@core/abstractions/messaging'
import type { AbstractSQSPublisher } from '@modules/messaging/sqs'
import {
  VideoEventHandler,
  type OrchestratorWorkerDeps,
} from '@workers/orchestrator-worker'
import { calculateTimeRanges, getTotalSegments } from '@workers/time-range'

function createMockLogger(): AbstractLoggerService {
  return new PinoLoggerService({ suppressConsole: true }, context.active())
}

function createMockEventEmitter(): EventBusEmitter & {
  emittedEvents: VideoStatusChangedEvent[]
} {
  const emittedEvents: VideoStatusChangedEvent[] = []
  return {
    emittedEvents,
    emitVideoStatusChanged: mock((event: VideoStatusChangedEvent) => {
      emittedEvents.push(event)
      return Promise.resolve()
    }),
  }
}

function createMockPublisher(): AbstractSQSPublisher<SegmentMessage> & {
  publishedMessages: SegmentMessage[][]
} {
  const publishedMessages: SegmentMessage[][] = []
  return {
    publishedMessages,
    publish: mock(() => Promise.resolve(Result.ok(undefined))),
    publishBatch: mock((messages: SegmentMessage[]) => {
      publishedMessages.push(messages)
      return Promise.resolve(Result.ok(undefined))
    }),
  } as unknown as AbstractSQSPublisher<SegmentMessage> & {
    publishedMessages: SegmentMessage[][]
  }
}

function createTestPathBuilder(): StoragePathBuilder {
  return new StoragePathBuilder({
    videoBucket: 'test-bucket',
    region: 'us-east-1',
  })
}

function createTestHandler(deps: Partial<OrchestratorWorkerDeps> = {}) {
  const logger = createMockLogger()
  const eventEmitter = deps.eventEmitter ?? createMockEventEmitter()
  const publisher = createMockPublisher()

  const fullDeps: OrchestratorWorkerDeps = {
    logger,
    eventEmitter,
    printQueuePublisher:
      (deps.printQueuePublisher as AbstractSQSPublisher<SegmentMessage>) ??
      publisher,
    pathBuilder: deps.pathBuilder ?? createTestPathBuilder(),
  }

  const handler = new VideoEventHandler(fullDeps)

  return {
    handler,
    logger,
    eventEmitter: eventEmitter as EventBusEmitter & {
      emittedEvents: VideoStatusChangedEvent[]
    },
    publisher,
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
          eventType: 'video.orchestrator.triggered',
          version: '1.0',
          timestamp: new Date().toISOString(),
          retryCount: 0,
          maxRetries: 3,
        }
      : null,
    messageId: 'sqs-msg-123',
  }
}

describe('VideoEventHandler', () => {
  describe('parse', () => {
    it('should parse valid event with all fields', () => {
      const { handler } = createTestHandler()
      const validEvent: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 120000,
          userEmail: 'user@example.com',
          videoName: 'test-video.mp4',
        },
      }

      const result = handler.parse(validEvent)

      expect(result.isSuccess).toBe(true)
      expect(result.value).toEqual(validEvent)
    })

    it('should parse valid event with only required fields', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({
        detail: { videoId: 'video-123' },
      })

      expect(result.isSuccess).toBe(true)
    })

    it('should fail for invalid payload', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({ invalid: 'data' })

      expect(result.isFailure).toBe(true)
    })

    it('should fail for empty videoId', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({ detail: { videoId: '' } })

      expect(result.isFailure).toBe(true)
    })

    it('should fail for negative duration', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({
        detail: { videoId: 'video-123', duration: -100 },
      })

      expect(result.isFailure).toBe(true)
    })

    it('should fail for invalid email format', () => {
      const { handler } = createTestHandler()

      const result = handler.parse({
        detail: { videoId: 'video-123', userEmail: 'not-an-email' },
      })

      expect(result.isFailure).toBe(true)
    })
  })

  describe('handle', () => {
    it('should return NonRetryableError when videoPath is missing', async () => {
      const { handler } = createTestHandler()
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          duration: 120000,
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
      expect(result.error.message).toContain('Missing videoPath')
    })

    it('should return NonRetryableError when duration is missing', async () => {
      const { handler } = createTestHandler()
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
      expect(result.error.message).toContain('Missing or invalid duration')
    })

    it('should return NonRetryableError when duration is zero', async () => {
      const { handler } = createTestHandler()
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 0,
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
    })

    it('should return NonRetryableError when duration is negative', async () => {
      const { handler } = createTestHandler()
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: -100,
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
    })

    it('should return NonRetryableError when videoPath format is invalid', async () => {
      const { handler } = createTestHandler()
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'invalid-path',
          duration: 120000,
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(NonRetryableError.isNonRetryable(result.error)).toBe(true)
      expect(result.error.message).toContain('Invalid videoPath format')
    })

    it('should publish segment messages to print queue', async () => {
      const publisher = createMockPublisher()
      const { handler } = createTestHandler({
        printQueuePublisher: publisher,
      })
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 30000,
          userEmail: 'user@example.com',
          videoName: 'test.mp4',
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isSuccess).toBe(true)
      expect(publisher.publishBatch).toHaveBeenCalled()
      expect(publisher.publishedMessages).toHaveLength(1)

      const messages = publisher.publishedMessages[0]
      expect(messages.length).toBe(3)
      expect(messages[0].videoId).toBe('video-123')
      expect(messages[0].segmentNumber).toBe(1)
      expect(messages[0].totalSegments).toBe(3)
    })

    it('should emit PROCESSING status event', async () => {
      const eventEmitter = createMockEventEmitter()
      const { handler } = createTestHandler({ eventEmitter })
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 30000,
          userEmail: 'user@example.com',
          videoName: 'test.mp4',
        },
      }

      // correlationId is resolved from CorrelationStore (set by SQS consumer in production)
      const result = await CorrelationStore.run(
        { correlationId: 'corr-123', traceId: 'trace-123' },
        () => handler.handle(event, createContext('corr-123')),
      )

      expect(result.isSuccess).toBe(true)
      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0]).toMatchObject({
        videoId: 'video-123',
        status: 'PROCESSING',
        correlationId: 'corr-123',
        userEmail: 'user@example.com',
        videoName: 'test.mp4',
      })
    })

    it('should return failure when publishBatch fails', async () => {
      const publisher = createMockPublisher()
      publisher.publishBatch = mock(() =>
        Promise.resolve(Result.fail(new Error('SQS error'))),
      )

      const { handler } = createTestHandler({
        printQueuePublisher: publisher,
      })
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 30000,
        },
      }

      const result = await handler.handle(event, createContext('corr-123'))

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('Failed to publish segments')
    })

    it('should use CorrelationStore correlationId when metadata is null', async () => {
      const eventEmitter = createMockEventEmitter()
      const { handler } = createTestHandler({ eventEmitter })
      const event: VideoEvent = {
        detail: {
          videoId: 'video-123',
          videoPath: 'test-bucket/video/video-123/file/video.mp4',
          duration: 10000,
        },
      }

      // In production, AbstractSQSConsumer sets CorrelationStore before calling handle
      const result = await CorrelationStore.run(
        { correlationId: 'store-corr-id', traceId: 'store-trace-id' },
        () => handler.handle(event, createContext()),
      )

      expect(result.isSuccess).toBe(true)
      expect(eventEmitter.emittedEvents[0].correlationId).toBe('store-corr-id')
    })
  })
})

describe('Time Range Calculation', () => {
  describe('calculateTimeRanges', () => {
    it('should calculate correct ranges for 100s video', () => {
      const durationMs = 100000
      const segmentDurationMs = 10000
      const ranges = calculateTimeRanges(durationMs, segmentDurationMs)
      const total = getTotalSegments(durationMs, segmentDurationMs)

      expect(total).toBe(10)
      expect(ranges).toHaveLength(10)
      expect(ranges[0]).toEqual({
        segmentNumber: 1,
        startTime: 0,
        endTime: 10,
      })
      expect(ranges[9]).toEqual({
        segmentNumber: 10,
        startTime: 90,
        endTime: 100,
      })
    })

    it('should handle video shorter than segment duration', () => {
      const durationMs = 5000
      const segmentDurationMs = 10000
      const ranges = calculateTimeRanges(durationMs, segmentDurationMs)
      const total = getTotalSegments(durationMs, segmentDurationMs)

      expect(total).toBe(1)
      expect(ranges).toHaveLength(1)
      expect(ranges[0]).toEqual({
        segmentNumber: 1,
        startTime: 0,
        endTime: 5,
      })
    })

    it.each([
      { durationMs: 95000, segmentDurationMs: 10000, expected: 10 },
      { durationMs: 300000, segmentDurationMs: 30000, expected: 10 },
      { durationMs: 60000, segmentDurationMs: 60000, expected: 1 },
      { durationMs: 61000, segmentDurationMs: 60000, expected: 2 },
      { durationMs: 120000, segmentDurationMs: 10000, expected: 12 },
    ])('should generate $expected segments for $durationMs ms / $segmentDurationMs ms', ({
      durationMs,
      segmentDurationMs,
      expected,
    }) => {
      const total = getTotalSegments(durationMs, segmentDurationMs)
      expect(total).toBe(expected)
    })
  })
})
