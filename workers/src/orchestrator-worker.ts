import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  createStoragePathBuilder,
  type StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import {
  createSQSConsumer,
  createSQSPublisher,
  type AbstractSQSPublisher,
} from '@modules/messaging/sqs'
import type {
  MessageHandler,
  MessageContext,
  ParseResult,
} from '@core/messaging'
import {
  VideoEventSchema,
  VIDEO_EVENT_TYPES,
  type VideoEvent,
  type SegmentMessage,
} from '@core/messaging/schemas'
import { calculateTimeRanges, getTotalSegments } from './time-range'
import { generatePresignedUrl } from './s3-presign.service'
import { NonRetryableError } from '@core/errors/non-retryable.error'

export interface OrchestratorWorkerDeps {
  logger: AbstractLoggerService
  eventBridgeClient: EventBridgeClient
  printQueuePublisher: AbstractSQSPublisher<SegmentMessage>
  pathBuilder?: StoragePathBuilder
  /** Segment duration in milliseconds (default: 10000ms = 10s) */
  segmentDurationMs?: number
}

export class VideoEventHandler implements MessageHandler<VideoEvent> {
  private readonly pathBuilder: StoragePathBuilder
  /** Segment duration in milliseconds */
  private readonly segmentDurationMs: number

  constructor(private readonly deps: OrchestratorWorkerDeps) {
    this.pathBuilder = deps.pathBuilder ?? createStoragePathBuilder()
    // SEGMENT_DURATION env var is now in milliseconds (default: 10000ms = 10s)
    this.segmentDurationMs =
      deps.segmentDurationMs ??
      parseInt(process.env.SEGMENT_DURATION ?? '10000', 10)
  }

  parse(rawPayload: unknown): ParseResult<VideoEvent> {
    const result = VideoEventSchema.safeParse(rawPayload)
    if (!result.success) {
      return { success: false, error: result.error.message }
    }
    return { success: true, data: result.data }
  }

  async handle(event: VideoEvent, context: MessageContext): Promise<void> {
    const { videoId, videoPath, duration, userEmail, videoName } = event.detail

    const correlationId =
      context.metadata?.correlationId ??
      event.detail.correlationId ??
      context.messageId ??
      ''
    const traceId = context.metadata?.traceId ?? event.detail.traceId
    const spanId = context.metadata?.spanId

    this.deps.logger.log('[ORCHESTRATOR] Processing video', {
      videoId,
      correlationId,
      traceId,
    })

    if (!videoPath) {
      throw new NonRetryableError(`Missing videoPath for video: ${videoId}`)
    }

    if (!duration || duration <= 0) {
      throw new NonRetryableError(
        `Missing or invalid duration for video: ${videoId}`,
      )
    }

    const inputBucket = this.pathBuilder.bucket
    const inputStoragePath = this.pathBuilder.parse(videoPath)

    if (!inputStoragePath) {
      throw new NonRetryableError(`Invalid videoPath format: ${videoPath}`)
    }

    const s3Key = inputStoragePath.key

    this.deps.logger.log(
      `[ORCHESTRATOR] Duration: ${duration}ms (${duration / 1000}s)`,
      { correlationId },
    )

    const ranges = calculateTimeRanges(duration, this.segmentDurationMs)
    const totalSegments = getTotalSegments(duration, this.segmentDurationMs)

    this.deps.logger.log(
      `[ORCHESTRATOR] Calculated ${totalSegments} segments`,
      { correlationId },
    )

    const presignedUrl = await generatePresignedUrl(inputBucket, s3Key, 7200)

    this.deps.logger.log('[ORCHESTRATOR] Generated presigned URL', {
      correlationId,
    })

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

    const publishResult = await this.deps.printQueuePublisher.publishBatch(
      messages,
      {
        eventType: VIDEO_EVENT_TYPES.SEGMENT_PRINT,
        correlationId,
        traceId,
        spanId,
      },
    )

    if (publishResult.isFailure) {
      throw new Error(
        `Failed to publish segments: ${publishResult.error?.message}`,
      )
    }

    await this.emitStatusEvent(
      videoId,
      'PROCESSING',
      correlationId,
      userEmail,
      videoName,
    )

    this.deps.logger.log(
      `[ORCHESTRATOR] Published ${messages.length} messages to print queue`,
      { correlationId },
    )
  }

  private async emitStatusEvent(
    videoId: string,
    status: string,
    correlationId: string,
    userEmail?: string,
    videoName?: string,
  ): Promise<void> {
    await this.deps.eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId,
              status,
              correlationId,
              userEmail: userEmail ?? 'user@example.com',
              videoName: videoName ?? 'video',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )
    this.deps.logger.log(`[ORCHESTRATOR] Emitted event: ${status}`, {
      correlationId,
    })
  }
}

if (import.meta.main) {
  const logger = new PinoLoggerService(
    { suppressConsole: false },
    context.active(),
  )

  const eventBridgeClient = new EventBridgeClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT_URL,
  })

  const printQueueUrl =
    process.env.PRINT_QUEUE_URL ??
    'http://localhost:4566/000000000000/print-queue'

  const printQueuePublisher = createSQSPublisher<SegmentMessage>(
    { queueUrl: printQueueUrl, source: 'fiapx.orchestrator' },
    logger,
  )

  const handler = new VideoEventHandler({
    logger,
    eventBridgeClient,
    printQueuePublisher,
  })

  const queueUrl =
    process.env.SQS_QUEUE_URL ??
    'http://localhost:4566/000000000000/orchestrator-queue'

  const consumer = createSQSConsumer<VideoEvent>({ queueUrl }, logger, handler)

  logger.log('Starting Orchestrator Worker...')
  consumer.start()
}
