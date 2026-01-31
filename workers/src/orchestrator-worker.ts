import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import {
  createStoragePathBuilder,
  type StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import {
  createSQSConsumer,
  createSQSPublisher,
  type AbstractSQSPublisher,
} from '@modules/messaging/sqs'
import type { MessageHandler, MessageContext } from '@core/messaging'
import {
  VideoEventSchema,
  VIDEO_EVENT_TYPES,
  type VideoEvent,
  type SegmentMessage,
} from '@core/messaging/schemas'
import { Result } from '@core/domain/result'
import type { EventBusEmitter } from '@core/abstractions/messaging'
import { calculateTimeRanges, getTotalSegments } from './time-range'
import { generatePresignedUrl } from './s3-presign.service'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import { EventBridgeEmitter } from './adapters'

/** Default segment duration: 10 seconds */
const DEFAULT_SEGMENT_DURATION_MS = 10_000

export interface OrchestratorWorkerDeps {
  logger: AbstractLoggerService
  eventEmitter: EventBusEmitter
  printQueuePublisher: AbstractSQSPublisher<SegmentMessage>
  pathBuilder?: StoragePathBuilder
}

export class VideoEventHandler implements MessageHandler<VideoEvent> {
  private readonly pathBuilder: StoragePathBuilder

  constructor(private readonly deps: OrchestratorWorkerDeps) {
    this.pathBuilder = deps.pathBuilder ?? createStoragePathBuilder()
  }

  parse(rawPayload: unknown): Result<VideoEvent, Error> {
    const result = VideoEventSchema.safeParse(rawPayload)
    if (!result.success) {
      return Result.fail(new Error(result.error.message))
    }
    return Result.ok(result.data)
  }

  async handle(
    event: VideoEvent,
    context: MessageContext,
  ): Promise<Result<void, Error>> {
    const { videoId, videoPath, duration, userEmail, videoName } = event.detail

    const correlationId =
      CorrelationStore.correlationId ??
      context.metadata?.correlationId ??
      event.detail.correlationId ??
      context.messageId ??
      ''
    const traceId =
      CorrelationStore.traceId ??
      context.metadata?.traceId ??
      event.detail.traceId
    const spanId = CorrelationStore.spanId ?? context.metadata?.spanId

    this.deps.logger.log('[ORCHESTRATOR] Processing video', { videoId })

    if (!videoPath) {
      return Result.fail(
        new NonRetryableError(`Missing videoPath for video: ${videoId}`),
      )
    }

    if (!duration || duration <= 0) {
      return Result.fail(
        new NonRetryableError(
          `Missing or invalid duration for video: ${videoId}`,
        ),
      )
    }

    const inputBucket = this.pathBuilder.bucket
    const inputStoragePath = this.pathBuilder.parse(videoPath)

    if (!inputStoragePath) {
      return Result.fail(
        new NonRetryableError(`Invalid videoPath format: ${videoPath}`),
      )
    }

    const s3Key = inputStoragePath.key

    this.deps.logger.log(
      `[ORCHESTRATOR] Duration: ${duration}ms (${duration / 1000}s)`,
    )

    const ranges = calculateTimeRanges(duration, DEFAULT_SEGMENT_DURATION_MS)
    const totalSegments = getTotalSegments(
      duration,
      DEFAULT_SEGMENT_DURATION_MS,
    )

    this.deps.logger.log(`[ORCHESTRATOR] Calculated ${totalSegments} segments`)

    const presignedUrl = await generatePresignedUrl(inputBucket, s3Key, 7200)

    this.deps.logger.log('[ORCHESTRATOR] Generated presigned URL')

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
      return Result.fail(
        new Error(
          `Failed to publish segments: ${publishResult.error?.message}`,
        ),
      )
    }

    await this.deps.eventEmitter.emitVideoStatusChanged({
      videoId,
      status: 'PROCESSING',
      correlationId,
      userEmail,
      videoName,
      traceId,
    })

    this.deps.logger.log(
      `[ORCHESTRATOR] Published ${messages.length} messages to print queue`,
    )

    return Result.ok(undefined)
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
    eventEmitter: new EventBridgeEmitter(eventBridgeClient),
    printQueuePublisher,
  })

  const queueUrl =
    process.env.SQS_QUEUE_URL ??
    'http://localhost:4566/000000000000/orchestrator-queue'

  const consumer = createSQSConsumer<VideoEvent>({ queueUrl }, logger, handler)

  logger.log('Starting Orchestrator Worker...')
  consumer.start()
}
