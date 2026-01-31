import { type Message } from '@aws-sdk/client-sqs'
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { AbstractSQSConsumer } from '@modules/messaging/sqs/abstract-sqs-consumer'
import {
  createStoragePathBuilder,
  type StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'
import { calculateTimeRanges, getTotalSegments } from './time-range'
import { generatePresignedUrl } from './s3-presign.service'

type VideoEvent = {
  detail: {
    videoId: string
    videoPath?: string
    duration?: number
    userEmail?: string
    videoName?: string
  }
}

type SegmentMessage = {
  videoId: string
  presignedUrl: string
  segmentNumber: number
  totalSegments: number
  startTime: number
  endTime: number
  userEmail?: string
  videoName?: string
}

const logger = new PinoLoggerService(
  {
    suppressConsole: false,
  },
  context.active(),
)

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
})

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
})

export class OrchestratorWorker extends AbstractSQSConsumer<VideoEvent> {
  private readonly pathBuilder: StoragePathBuilder = createStoragePathBuilder()
  private segmentDuration = parseInt(process.env.SEGMENT_DURATION || '10', 10)
  private printQueueUrl =
    process.env.PRINT_QUEUE_URL ||
    'http://localhost:4566/000000000000/print-queue'

  protected parseMessage(body: string): VideoEvent | null {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }

  protected async handleMessage(
    event: VideoEvent,
    _message: Message,
  ): Promise<void> {
    const { videoId, videoPath, duration, userEmail, videoName } = event.detail

    if (!videoPath) {
      throw new Error(`Missing videoPath for video: ${videoId}`)
    }

    if (!duration || duration <= 0) {
      throw new Error(`Missing or invalid duration for video: ${videoId}`)
    }

    const inputBucket = this.pathBuilder.bucket
    const inputStoragePath = this.pathBuilder.parse(videoPath)

    if (!inputStoragePath) {
      throw new Error(`Invalid videoPath format: ${videoPath}`)
    }

    const s3Key = inputStoragePath.key

    this.logger.log(`[ORCHESTRATOR] Processing video: ${videoId}`)
    this.logger.log(`[ORCHESTRATOR] Duration: ${duration}s`)

    const ranges = calculateTimeRanges(duration, this.segmentDuration)
    const totalSegments = getTotalSegments(duration, this.segmentDuration)

    this.logger.log(`[ORCHESTRATOR] Calculated ${totalSegments} segments`)

    const presignedUrl = await generatePresignedUrl(inputBucket, s3Key, 7200)

    this.logger.log(`[ORCHESTRATOR] Generated presigned URL`)

    const messages: SegmentMessage[] = ranges.map((range) => ({
      videoId,
      presignedUrl,
      segmentNumber: range.segmentNumber,
      totalSegments,
      startTime: range.startTime,
      endTime: range.endTime,
      userEmail,
      videoName,
    }))

    await this.publishToQueue(messages)

    await this.emitStatusEvent(videoId, 'PROCESSING', userEmail, videoName)

    this.logger.log(
      `[ORCHESTRATOR] Published ${messages.length} messages to print queue`,
    )
  }

  private async publishToQueue(messages: SegmentMessage[]): Promise<void> {
    const batchSize = 10
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)

      const entries = batch.map((msg, index) => ({
        Id: `${msg.videoId}-${msg.segmentNumber}-${index}`,
        MessageBody: JSON.stringify({ detail: msg }),
      }))

      await sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: this.printQueueUrl,
          Entries: entries,
        }),
      )
    }
  }

  protected override async onError(
    error: Error,
    message: Message,
    payload?: VideoEvent,
  ): Promise<void> {
    this.logger.error('[ORCHESTRATOR] Error processing video', {
      error: error.message,
      videoId: payload?.detail?.videoId,
      messageId: message.MessageId,
    })
  }

  private async emitStatusEvent(
    videoId: string,
    status: string,
    userEmail?: string,
    videoName?: string,
  ): Promise<void> {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId,
              status,
              userEmail: userEmail || 'user@example.com',
              videoName: videoName || 'video',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )
    this.logger.log(`[ORCHESTRATOR] Emitted event: ${status}`)
  }
}

const queueUrl =
  process.env.SQS_QUEUE_URL ||
  'http://localhost:4566/000000000000/orchestrator-queue'
const worker = new OrchestratorWorker({ queueUrl }, logger)

logger.log('Starting Orchestrator Worker...')
worker.start()
