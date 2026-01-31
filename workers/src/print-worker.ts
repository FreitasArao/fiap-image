import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  StoragePathBuilder,
  createStoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { createSQSConsumer } from '@modules/messaging/sqs'
import type {
  MessageHandler,
  MessageContext,
  ParseResult,
} from '@core/messaging'
import { SegmentEventSchema, type SegmentEvent } from '@core/messaging/schemas'
import { FFmpegProcessor } from './processors'
import type { VideoProcessorService, EventEmitter } from './abstractions'
import { EventBridgeEmitter } from './adapters'

export interface PrintWorkerDeps {
  logger: AbstractLoggerService
  eventEmitter: EventEmitter
  processorFactory: (videoId: string) => VideoProcessorService
  pathBuilder?: StoragePathBuilder
  outputBucket?: string
  frameInterval?: number
}

export class SegmentEventHandler implements MessageHandler<SegmentEvent> {
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

  parse(rawPayload: unknown): ParseResult<SegmentEvent> {
    const result = SegmentEventSchema.safeParse(rawPayload)
    if (!result.success) {
      return { success: false, error: result.error.message }
    }
    return { success: true, data: result.data }
  }

  async handle(event: SegmentEvent, context: MessageContext): Promise<void> {
    const {
      videoId,
      presignedUrl,
      segmentNumber,
      totalSegments,
      startTime,
      endTime,
      userEmail,
      videoName,
    } = event.detail

    const correlationId =
      context.metadata?.correlationId ?? context.messageId ?? ''
    const traceId = context.metadata?.traceId

    this.deps.logger.log(
      `[PRINT] Processing segment ${segmentNumber}/${totalSegments} for video: ${videoId}`,
      { correlationId, traceId },
    )
    this.deps.logger.log(`[PRINT] Time range: ${startTime}s - ${endTime}s`, {
      correlationId,
    })

    const processor = this.deps.processorFactory(
      `${videoId}-seg${segmentNumber}`,
    )

    try {
      await processor.setup()

      this.deps.logger.log(
        '[PRINT] Extracting frames from URL (streaming)...',
        { correlationId },
      )

      const { outputDir, count } = await processor.extractFramesFromUrl(
        presignedUrl,
        startTime,
        endTime,
        this.frameInterval,
      )

      this.deps.logger.log(`[PRINT] Extracted ${count} frames`, {
        correlationId,
      })

      this.deps.logger.log('[PRINT] Uploading frames to S3...', {
        correlationId,
      })
      const printsPrefix = this.pathBuilder
        .videoPrint(
          videoId,
          `segment_${String(segmentNumber).padStart(3, '0')}`,
        )
        .key.replace(/\/$/, '')

      await processor.uploadDir(
        outputDir,
        this.outputBucket,
        printsPrefix,
        'frame_*.jpg',
      )

      const isLastSegment = this.checkAndUpdateProgress(
        videoId,
        segmentNumber,
        totalSegments,
        correlationId,
      )

      if (isLastSegment) {
        const downloadUrl = `http://localhost:4566/${this.outputBucket}/${this.pathBuilder.videoPrint(videoId, '').key}`

        await this.emitStatusEvent(
          videoId,
          'COMPLETED',
          correlationId,
          userEmail,
          videoName,
          downloadUrl,
        )

        this.deps.logger.log(`[PRINT] Video ${videoId} completed!`, {
          correlationId,
        })
      }

      this.deps.logger.log(
        `[PRINT] Segment ${segmentNumber}/${totalSegments} complete`,
        { correlationId },
      )
    } catch (error) {
      this.deps.logger.error('[PRINT] Error processing segment', {
        error: error instanceof Error ? error.message : String(error),
        videoId,
        segmentNumber,
        correlationId,
      })

      const isNonRetryable = this.isNonRetryableError(
        error instanceof Error ? error : new Error(String(error)),
      )

      if (isNonRetryable) {
        await this.emitStatusEvent(
          videoId,
          'FAILED',
          correlationId,
          userEmail,
          videoName,
          undefined,
          error instanceof Error ? error.message : String(error),
        )
      }

      throw error
    } finally {
      await processor.cleanup()
    }
  }

  private checkAndUpdateProgress(
    videoId: string,
    segmentNumber: number,
    totalSegments: number,
    correlationId: string,
  ): boolean {
    this.deps.logger.log(
      `[PRINT] Segment ${segmentNumber}/${totalSegments} processed for video: ${videoId}`,
      { correlationId },
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
    await this.deps.eventEmitter.emitVideoStatus({
      videoId,
      status,
      correlationId,
      userEmail,
      videoName,
      downloadUrl,
      errorReason,
    })
    this.deps.logger.log(`[PRINT] Emitted event: ${status}`, { correlationId })
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

  const consumer = createSQSConsumer<SegmentEvent>(
    { queueUrl },
    logger,
    handler,
  )

  logger.log('Starting Print Worker...')
  consumer.start()
}
