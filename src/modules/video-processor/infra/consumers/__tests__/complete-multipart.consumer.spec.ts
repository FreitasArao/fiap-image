import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs'
import { CompleteMultipartConsumer } from '../complete-multipart.consumer'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { InMemoryVideoRepository } from '../../../__tests__/factories/in-memory-video.repository'
import { VideoFactory } from '../../../__tests__/factories/video.factory'

const sqsMock = mockClient(SQSClient)

describe('CompleteMultipartConsumer', () => {
  let consumer: CompleteMultipartConsumer
  let logger: AbstractLoggerService
  let videoRepository: InMemoryVideoRepository

  beforeEach(() => {
    sqsMock.reset()

    // Default mock responses
    sqsMock.on(ReceiveMessageCommand).resolves({ Messages: [] })
    sqsMock.on(DeleteMessageCommand).resolves({})

    logger = {
      log: mock(),
      error: mock(),
      warn: mock(),
      debug: mock(),
    } as unknown as AbstractLoggerService

    videoRepository = new InMemoryVideoRepository()

    consumer = new CompleteMultipartConsumer(
      logger,
      new SQSClient({ region: 'us-east-1' }),
      'http://queue.url',
      videoRepository,
    )
  })

  afterEach(() => {
    sqsMock.reset()
  })

  const createS3Event = (key: string) => ({
    detail: {
      bucket: { name: 'test-bucket' },
      object: { key: key },
      reason: 'CompleteMultipartUpload',
    },
  })

  it('should reconcile video status when event is received', async () => {
    // 1. Setup Video in UPLOADING state
    const video = VideoFactory.create({ status: 'UPLOADING' })
    await videoRepository.createVideo(video)

    const event = createS3Event(`${video.id.value}/video.mp4`)

    // 2. Run handleMessage directly (bypass infinite loop of start())
    // We use type assertion to access protected method for testing core logic
    await (consumer as unknown as { handleMessage: (e: typeof event) => Promise<void> }).handleMessage(event)

    // 3. Verify
    const updatedVideo = await videoRepository.findById(video.id.value)
    expect(updatedVideo.value?.status.value).toBe('UPLOADED')
  })

  it('should skip if video is already uploaded', async () => {
    const video = VideoFactory.create({ status: 'UPLOADED' })
    await videoRepository.createVideo(video)

    const event = createS3Event(`${video.id.value}/video.mp4`)

    await (consumer as unknown as { handleMessage: (e: typeof event) => Promise<void> }).handleMessage(event)

    // Should not throw and log info (mock verification ideally)
    const updatedVideo = await videoRepository.findById(video.id.value)
    expect(updatedVideo.value?.status.value).toBe('UPLOADED')
  })

  it('should handle video not found gracefully', async () => {
    const event = createS3Event('non-existent-id/video.mp4')

    // Should not throw
    await (consumer as unknown as { handleMessage: (e: typeof event) => Promise<void> }).handleMessage(event)

    // Logger should have been called with warning/error
    expect(logger.warn).toHaveBeenCalled()
  })

  it('should consume messages from SQS queue', async () => {
    const video = VideoFactory.create({ status: 'UPLOADING' })
    await videoRepository.createVideo(video)

    const event = createS3Event(`${video.id.value}/video.mp4`)

    // Mock SQS to return a message
    sqsMock
      .on(ReceiveMessageCommand)
      .resolvesOnce({
        Messages: [
          {
            MessageId: 'msg-1',
            ReceiptHandle: 'handle-1',
            Body: JSON.stringify(event),
          },
        ],
      })
      .resolves({ Messages: [] })

    // Use the consume generator directly
    const iterator = consumer.consume()
    const result = await iterator.next()

    expect(result.value).toBeDefined()
    expect(result.value.receiptHandle).toBe('handle-1')
  })
})
