import { describe, expect, it, mock } from 'bun:test'

import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

import { StoragePathBuilder } from '@modules/video-processor/infra/services/storage'
import type { Message } from '@aws-sdk/client-sqs'
import {
  EventEmitter,
  VideoProcessorService,
  VideoStatusEvent,
} from '@workers/abstractions'
import {
  PrintWorker,
  SegmentEvent,
  PrintWorkerDeps,
} from '@workers/print-worker'

function createMockLogger(): AbstractLoggerService {
  return {
    log: mock(),
    error: mock(),
    warn: mock(),
    debug: mock(),
  } as unknown as AbstractLoggerService
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

class TestPrintWorker extends PrintWorker {
  public testParseMessage(body: string): SegmentEvent | null {
    return this.parseMessage(body)
  }

  public async testHandleMessage(
    event: SegmentEvent,
    message: Message,
  ): Promise<void> {
    return this.handleMessage(event, message)
  }

  public async testOnError(
    error: Error,
    message: Message,
    payload?: SegmentEvent,
  ): Promise<void> {
    return this.onError(error, message, payload)
  }
}

function createTestWorker(deps: Partial<PrintWorkerDeps> = {}) {
  const logger = createMockLogger()
  const eventEmitter = createMockEventEmitter()
  const processor = createMockProcessor()

  const fullDeps: PrintWorkerDeps = {
    eventEmitter: deps.eventEmitter || eventEmitter,
    processorFactory: deps.processorFactory || (() => processor),
    pathBuilder: deps.pathBuilder || createTestPathBuilder(),
    outputBucket: deps.outputBucket || 'test-bucket',
    frameInterval: deps.frameInterval || 1,
  }

  const worker = new TestPrintWorker(
    { queueUrl: 'http://localhost:4566/000000000000/test-queue' },
    logger,
    fullDeps,
  )

  return { worker, logger, eventEmitter, processor, deps: fullDeps }
}

describe('PrintWorker', () => {
  describe('parseMessage', () => {
    it('should parse valid JSON', () => {
      const { worker } = createTestWorker()
      const validEvent: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          segmentNumber: 1,
          totalSegments: 10,
          startTime: 0,
          endTime: 10,
        },
      }

      const result = worker.testParseMessage(JSON.stringify(validEvent))

      expect(result).toEqual(validEvent)
    })

    it('should return null for invalid JSON', () => {
      const { worker } = createTestWorker()

      const result = worker.testParseMessage('not valid json {')

      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const { worker } = createTestWorker()

      const result = worker.testParseMessage('')

      expect(result).toBeNull()
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
      const { worker } = createTestWorker()

      const result = worker.isNonRetryableError(new Error(errorMessage))

      expect(result).toBe(expected)
    })
  })

  describe('checkAndUpdateProgress', () => {
    it('should return true when segment is the last one', () => {
      const { worker } = createTestWorker()

      const result = worker.checkAndUpdateProgress('video-123', 10, 10)

      expect(result).toBe(true)
    })

    it('should return false when segment is not the last one', () => {
      const { worker } = createTestWorker()

      const result = worker.checkAndUpdateProgress('video-123', 5, 10)

      expect(result).toBe(false)
    })

    it('should return true for single segment video', () => {
      const { worker } = createTestWorker()

      const result = worker.checkAndUpdateProgress('video-123', 1, 1)

      expect(result).toBe(true)
    })
  })

  describe('handleMessage', () => {
    it('should process segment and extract frames', async () => {
      const processor = createMockProcessor()
      const { worker } = createTestWorker({
        processorFactory: () => processor,
      })

      const event: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 1,
          totalSegments: 10,
          startTime: 0,
          endTime: 10,
        },
      }

      await worker.testHandleMessage(event, { MessageId: 'msg-1' } as Message)

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
      const { worker } = createTestWorker({ eventEmitter })

      const event: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 10,
          totalSegments: 10,
          startTime: 90,
          endTime: 100,
          userEmail: 'user@example.com',
          videoName: 'my-video.mp4',
        },
      }

      await worker.testHandleMessage(event, { MessageId: 'msg-1' } as Message)

      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0]).toMatchObject({
        videoId: 'video-123',
        status: 'COMPLETED',
        userEmail: 'user@example.com',
        videoName: 'my-video.mp4',
      })
    })

    it('should NOT emit event for non-last segments', async () => {
      const eventEmitter = createMockEventEmitter()
      const { worker } = createTestWorker({ eventEmitter })

      const event: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 5,
          totalSegments: 10,
          startTime: 40,
          endTime: 50,
        },
      }

      await worker.testHandleMessage(event, { MessageId: 'msg-1' } as Message)

      expect(eventEmitter.emittedEvents).toHaveLength(0)
    })

    it('should cleanup even if processing fails', async () => {
      const processor = createMockProcessor()
      processor.extractFramesFromUrl = mock(() =>
        Promise.reject(new Error('FFmpeg failed')),
      )

      const { worker } = createTestWorker({
        processorFactory: () => processor,
      })

      const event: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 1,
          totalSegments: 10,
          startTime: 0,
          endTime: 10,
        },
      }

      await expect(
        worker.testHandleMessage(event, { MessageId: 'msg-1' } as Message),
      ).rejects.toThrow('FFmpeg failed')

      expect(processor.cleanup).toHaveBeenCalled()
    })
  })

  describe('onError', () => {
    it('should emit FAILED event for non-retryable errors', async () => {
      const eventEmitter = createMockEventEmitter()
      const { worker } = createTestWorker({ eventEmitter })

      const error = new Error('NoSuchKey: The specified key does not exist')
      const payload: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 1,
          totalSegments: 10,
          startTime: 0,
          endTime: 10,
          userEmail: 'user@example.com',
          videoName: 'my-video.mp4',
        },
      }

      await worker.testOnError(
        error,
        { MessageId: 'msg-1' } as Message,
        payload,
      )

      expect(eventEmitter.emittedEvents).toHaveLength(1)
      expect(eventEmitter.emittedEvents[0]).toMatchObject({
        videoId: 'video-123',
        status: 'FAILED',
        errorReason: 'NoSuchKey: The specified key does not exist',
      })
    })

    it('should NOT emit event for retryable errors', async () => {
      const eventEmitter = createMockEventEmitter()
      const { worker } = createTestWorker({ eventEmitter })

      const error = new Error('Connection timeout')
      const payload: SegmentEvent = {
        detail: {
          videoId: 'video-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          segmentNumber: 1,
          totalSegments: 10,
          startTime: 0,
          endTime: 10,
        },
      }

      await worker.testOnError(
        error,
        { MessageId: 'msg-1' } as Message,
        payload,
      )

      expect(eventEmitter.emittedEvents).toHaveLength(0)
    })

    it('should NOT emit event when payload is missing', async () => {
      const eventEmitter = createMockEventEmitter()
      const { worker } = createTestWorker({ eventEmitter })

      const error = new Error('NoSuchKey: The specified key does not exist')

      await worker.testOnError(
        error,
        { MessageId: 'msg-1' } as Message,
        undefined,
      )

      expect(eventEmitter.emittedEvents).toHaveLength(0)
    })
  })
})
