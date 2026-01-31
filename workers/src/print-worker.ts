import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CorrelationStore } from '@core/libs/context'
import {
  StoragePathBuilder,
  createStoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { createSQSConsumer } from '@modules/messaging/sqs'
import type { MessageHandler, MessageContext } from '@core/messaging'
import {
  SegmentMessageSchema,
  type SegmentMessage,
} from '@core/messaging/schemas'
import { Result } from '@core/domain/result'
import type { EventBusEmitter } from '@core/abstractions/messaging'
import { NonRetryableError } from '@core/errors/non-retryable.error'
import { FFmpegProcessor } from './processors'
import type { VideoProcessorService } from './abstractions'
import { EventBridgeEmitter } from './adapters'

export interface PrintWorkerDeps {
  logger: AbstractLoggerService
  eventEmitter: EventBusEmitter
  processorFactory: (videoId: string) => VideoProcessorService
  pathBuilder?: StoragePathBuilder
  outputBucket?: string
  frameInterval?: number
}

export class SegmentEventHandler implements MessageHandler<SegmentMessage> {
  private readonly pathBuilder: StoragePathBuilder
  private readonly outputBucket: string
  private readonly frameInterval: number

  constructor(private readonly deps: PrintWorkerDeps) {
    this.pathBuilder = deps.pathBuilder ?? createStoragePathBuilder()
    this.outputBucket =
      deps.outputBucket ?? process.env.S3_OUTPUT_BUCKET ?? 'fiapx-video-frames'
    this.frameInterval =
      deps.frameInterval ?? parseInt(process.env.FRAME_INTERVAL ?? '1', 10)
  }

  parse(rawPayload: unknown): Result<SegmentMessage, Error> {
    const result = SegmentMessageSchema.safeParse(rawPayload)
    if (!result.success) {
      return Result.fail(new Error(result.error.message))
    }
    return Result.ok(result.data)
  }

  async handle(
    message: SegmentMessage,
    context: MessageContext,
  ): Promise<Result<void, Error>> {
    const {
      videoId,
      presignedUrl,
      segmentNumber,
      totalSegments,
      startTime,
      endTime,
      userEmail,
      videoName,
    } = message

    // Get correlation context from AsyncLocalStorage (set by consumer)
    // Fallback to message context for backwards compatibility
    const correlationId =
      CorrelationStore.correlationId ??
      context.metadata?.correlationId ??
      context.messageId ??
      ''

    // correlationId is now automatically included in logs via Pino mixin
    this.deps.logger.log(
      `[PRINT] Processing segment ${segmentNumber}/${totalSegments} for video: ${videoId}`,
    )
    this.deps.logger.log(`[PRINT] Time range: ${startTime}s - ${endTime}s`)

    const processor = this.deps.processorFactory(
      `${videoId}-seg${segmentNumber}`,
    )

    try {
      await processor.setup()

      this.deps.logger.log('[PRINT] Extracting frames from URL (streaming)...')

      const extractResult = await processor.extractFramesFromUrl(
        presignedUrl,
        startTime,
        endTime,
        this.frameInterval,
      )

      if (extractResult.isFailure) {
        await processor.cleanup()
        return this.handleProcessingError(
          extractResult.error,
          videoId,
          segmentNumber,
          correlationId,
          userEmail,
          videoName,
        )
      }

      const { outputDir, count } = extractResult.value

      this.deps.logger.log(`[PRINT] Extracted ${count} frames`)

      this.deps.logger.log('[PRINT] Uploading frames to S3...')
      const printsPrefix = this.pathBuilder
        .videoPrint(
          videoId,
          `segment_${String(segmentNumber).padStart(3, '0')}`,
        )
        .key.replace(/\/$/, '')

      const uploadResult = await processor.uploadDir(
        outputDir,
        this.outputBucket,
        printsPrefix,
        'frame_*.jpg',
      )

      if (uploadResult.isFailure) {
        await processor.cleanup()
        return this.handleProcessingError(
          uploadResult.error,
          videoId,
          segmentNumber,
          correlationId,
          userEmail,
          videoName,
        )
      }

      const isLastSegment = this.checkAndUpdateProgress(
        videoId,
        segmentNumber,
        totalSegments,
      )

      if (isLastSegment) {
        const baseUrl =
          process.env.AWS_PUBLIC_ENDPOINT ??
          process.env.AWS_ENDPOINT_URL ??
          'http://localhost:4566'
        const downloadUrl = `${baseUrl}/${this.outputBucket}/${this.pathBuilder.videoPrint(videoId, '').key}`

        await this.emitStatusEvent(
          videoId,
          'COMPLETED',
          correlationId,
          userEmail,
          videoName,
          downloadUrl,
        )

        this.deps.logger.log(`[PRINT] Video ${videoId} completed!`)
      }

      this.deps.logger.log(
        `[PRINT] Segment ${segmentNumber}/${totalSegments} complete`,
      )

      await processor.cleanup()
      return Result.ok(undefined)
    } catch (error) {
      await processor.cleanup()
      return this.handleProcessingError(
        error instanceof Error ? error : new Error(String(error)),
        videoId,
        segmentNumber,
        correlationId,
        userEmail,
        videoName,
      )
    }
  }

  private async handleProcessingError(
    error: Error,
    videoId: string,
    segmentNumber: number,
    correlationId: string,
    userEmail?: string,
    videoName?: string,
  ): Promise<Result<void, Error>> {
    // correlationId is automatically included via Pino mixin
    this.deps.logger.error('[PRINT] Error processing segment', {
      error: error.message,
      videoId,
      segmentNumber,
    })

    const isNonRetryable = this.isNonRetryableError(error)

    if (isNonRetryable) {
      await this.emitStatusEvent(
        videoId,
        'FAILED',
        correlationId,
        userEmail,
        videoName,
        undefined,
        error.message,
      )
      return Result.fail(new NonRetryableError(error.message))
    }

    return Result.fail(error)
  }

  private checkAndUpdateProgress(
    videoId: string,
    segmentNumber: number,
    totalSegments: number,
  ): boolean {
    // correlationId is automatically included via Pino mixin
    this.deps.logger.log(
      `[PRINT] Segment ${segmentNumber}/${totalSegments} processed for video: ${videoId}`,
    )
    return segmentNumber === totalSegments
  }

  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      '404',
      'does not exist',
      'NoSuchKey',
      'invalid',
      'not found',
    ]

    return nonRetryablePatterns.some((pattern) =>
      error.message.toLowerCase().includes(pattern.toLowerCase()),
    )
  }

  private async emitStatusEvent(
    videoId: string,
    status: 'COMPLETED' | 'FAILED',
    correlationId: string,
    userEmail?: string,
    videoName?: string,
    downloadUrl?: string,
    errorReason?: string,
  ): Promise<void> {
    await this.deps.eventEmitter.emitVideoStatusChanged({
      videoId,
      status,
      correlationId,
      userEmail,
      videoName,
      downloadUrl,
      errorReason,
    })
    // correlationId is automatically included via Pino mixin
    this.deps.logger.log(`[PRINT] Emitted event: ${status}`)
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

  const handler = new SegmentEventHandler({
    logger,
    eventEmitter: new EventBridgeEmitter(eventBridgeClient),
    processorFactory: (videoId) => new FFmpegProcessor(videoId),
  })

  const queueUrl =
    process.env.SQS_QUEUE_URL ??
    'http://localhost:4566/000000000000/print-queue'

  const consumer = createSQSConsumer<SegmentMessage>(
    { queueUrl },
    logger,
    handler,
  )

  logger.log('Starting Print Worker...')
  consumer.start()
}
