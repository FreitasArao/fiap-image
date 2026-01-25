import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { Result } from '@core/domain/result'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import { CompleteMultipartConsumer } from '@modules/video-processor/infra/consumers/complete-multipart.consumer'
import { CompleteMultipartHandler } from '@modules/video-processor/infra/consumers/complete-multipart-handler'
import { CompleteMultipartEvent } from '@modules/video-processor/infra/consumers/complete-multipart-handler'

class TestableCompleteMultipartConsumer extends CompleteMultipartConsumer {
  public testParseMessage(body: string): CompleteMultipartEvent | null {
    return this.parseMessage(body)
  }

  public async testHandleMessage(event: CompleteMultipartEvent): Promise<void> {
    return this.handleMessage(event)
  }
}

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

describe('CompleteMultipartConsumer', () => {
  let consumer: TestableCompleteMultipartConsumer
  let handler: CompleteMultipartHandler
  let handleSpy: ReturnType<typeof spyOn>
  const originalEnv = process.env.COMPLETE_MULTIPART_QUEUE_URL

  beforeEach(() => {
    process.env.COMPLETE_MULTIPART_QUEUE_URL =
      'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'

    handler = createMockHandler()

    handleSpy = spyOn(handler, 'handle').mockResolvedValue(Result.ok())

    consumer = new TestableCompleteMultipartConsumer(
      new PinoLoggerService({ suppressConsole: true }, context.active()),
      handler,
    )
  })

  afterEach(() => {
    process.env.COMPLETE_MULTIPART_QUEUE_URL = originalEnv
  })

  describe('parseMessage', () => {
    it('should parse valid S3 event message', () => {
      const validMessage = JSON.stringify({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: 'bucket/video/video-id/video.mp4' },
          reason: 'CompleteMultipartUpload',
        },
      })

      const result = consumer.testParseMessage(validMessage)

      expect(result).not.toBeNull()
      expect(result?.detail.object.key).toBe('bucket/video/video-id/video.mp4')
      expect(result?.detail.bucket.name).toBe('test-bucket')
    })

    it('should return null when detail field is missing', () => {
      const invalidMessage = JSON.stringify({
        bucket: { name: 'test-bucket' },
        object: { key: 'video-id/video.mp4' },
      })

      const result = consumer.testParseMessage(invalidMessage)

      expect(result).toBeNull()
    })

    it('should throw error for malformed JSON', () => {
      const malformedMessage = 'not valid json {'

      expect(() => consumer.testParseMessage(malformedMessage)).toThrow()
    })

    it('should parse message with minimal required fields', () => {
      const minimalMessage = JSON.stringify({
        detail: {
          bucket: { name: 'bucket' },
          object: { key: 'key' },
          reason: 'reason',
        },
      })

      const result = consumer.testParseMessage(minimalMessage)

      expect(result).not.toBeNull()
      expect(result?.detail.bucket.name).toBe('bucket')
    })
  })

  describe('handleMessage', () => {
    const createS3Event = (key: string): CompleteMultipartEvent => ({
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key },
        reason: 'CompleteMultipartUpload',
      },
    })

    it('should call handler.handle with the event', async () => {
      const event = createS3Event('bucket/video/video-123/video.mp4')

      await consumer.testHandleMessage(event)

      expect(handleSpy).toHaveBeenCalledTimes(1)
      expect(handleSpy).toHaveBeenCalledWith(event)
    })

    it('should pass correct bucket and key to handler', async () => {
      const event = createS3Event('test-bucket/video/abc-123/file.mp4')

      await consumer.testHandleMessage(event)

      const calledWith = handleSpy.mock.calls[0][0] as CompleteMultipartEvent
      expect(calledWith.detail.bucket.name).toBe('test-bucket')
      expect(calledWith.detail.object.key).toBe(
        'test-bucket/video/abc-123/file.mp4',
      )
    })

    it('should complete successfully when handler returns success', async () => {
      handleSpy.mockResolvedValue(Result.ok())
      const event = createS3Event('bucket/video/video-123/video.mp4')

      await expect(consumer.testHandleMessage(event)).resolves.toBeUndefined()
    })

    it('should complete successfully even when handler returns failure', async () => {
      handleSpy.mockResolvedValue(Result.fail(new Error('Handler error')))
      const event = createS3Event('bucket/video/video-123/video.mp4')

      await expect(consumer.testHandleMessage(event)).resolves.toBeUndefined()
    })
  })
})
