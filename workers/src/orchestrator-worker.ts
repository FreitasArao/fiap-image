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
import {
  type MessageHandler,
  type MessageContext,
  type PublishOptions,
} from '@core/messaging'
import {
  VideoEventSchema,
  VIDEO_EVENT_TYPES,
  type VideoEvent,
  type SegmentMessage,
} from '@core/messaging/schemas'
import { Result } from '@core/domain/result'

import { calculateTimeRanges, getTotalSegments } from './time-range'
import { generatePresignedUrl } from './s3-presign.service'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import { EventBridgeEmitter } from './adapters'
import type { EventBusEmitter } from '@core/abstractions/messaging'

/** Default segment duration: 10 seconds */
const DEFAULT_SEGMENT_DURATION_MS = 10_000

export type OrchestratorWorkerDeps = {
  logger: AbstractLoggerService
  eventEmitter: EventBusEmitter
  printQueuePublisher: AbstractSQSPublisher<SegmentMessage>
  pathBuilder?: StoragePathBuilder
}

/**
 * VideoEventHandler - Processes video events and fans out segment messages.
 *
 * All correlation context (correlationId, traceId, spanId) is automatically
 * propagated via CorrelationStore (AsyncLocalStorage), set by the SQS consumer.
 * Logs automatically include these fields via the Pino mixin.
 */
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
    _context: MessageContext,
  ): Promise<Result<void, Error>> {
    const { videoId, videoPath, duration, userEmail, videoName } = event.detail

    // correlationId is automatically injected by Pino mixin via CorrelationStore
    // Obtain explicit values only for downstream propagation (e.g. publishing to SQS/EventBridge)
    const correlationId =
      CorrelationStore.correlationId ??
      event.detail.correlationId ??
      crypto.randomUUID()
    const traceId =
      CorrelationStore.traceId ?? event.detail.traceId

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

    // Publish segment messages using the Envelope pattern via SQS publisher
    const publishOptions: PublishOptions = {
      correlationId,
      eventType: VIDEO_EVENT_TYPES.SEGMENT_PRINT,
      source: 'fiapx.orchestrator',
      traceId,
    }

    const publishResult = await this.deps.printQueuePublisher.publishBatch(
      messages,
      publishOptions,
    )

    if (publishResult.isFailure) {
      return Result.fail(
        new Error(
          `Failed to publish segments: ${publishResult.error?.message}`,
        ),
      )
    }

    // Emit status change event via EventBridge (also uses Envelope pattern internally)
    await this.deps.eventEmitter.emitVideoStatusChanged({
      videoId,
      status: 'PROCESSING',
      correlationId,
      userEmail,
      videoName,
      traceId,
    })

    this.deps.logger.log(
      `[ORCHESTRATOR] Published ${messages.length} segment messages`,
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
