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

  /** Convert milliseconds to nanoseconds (Datadog standard) */
  private msToNs(ms: number): number {
    return Math.round(ms * 1_000_000)
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
    const segmentStartTime = performance.now()
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

    this.deps.logger.log('segment.processing.start', {
      'video.id': videoId,
      'segment.number': segmentNumber,
      'segment.total': totalSegments,
      'segment.start_time': startTime,
      'segment.end_time': endTime,
      component: 'print-worker',
    })

    const processor = this.deps.processorFactory(
      `${videoId}-seg${segmentNumber}`,
    )

    try {
      await processor.setup()

      const extractStartTime = performance.now()

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
          segmentStartTime,
          userEmail,
          videoName,
        )
      }

      const { outputDir, count } = extractResult.value

      this.deps.logger.log('segment.processing.frames_extracted', {
        'video.id': videoId,
        'segment.number': segmentNumber,
        'frames.count': count,
        duration: this.msToNs(performance.now() - extractStartTime),
        component: 'print-worker',
      })

      const uploadStartTime = performance.now()
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
          segmentStartTime,
          userEmail,
          videoName,
        )
      }

      this.deps.logger.log('segment.processing.upload_complete', {
        'video.id': videoId,
        'segment.number': segmentNumber,
        'frames.count': count,
        duration: this.msToNs(performance.now() - uploadStartTime),
        component: 'print-worker',
      })

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

        this.deps.logger.log('video.processing.complete', {
          'video.id': videoId,
          'video.segments.total': totalSegments,
          duration: this.msToNs(performance.now() - segmentStartTime),
          status: 'completed',
          component: 'print-worker',
        })
      }

      this.deps.logger.log('segment.processing.end', {
        'video.id': videoId,
        'segment.number': segmentNumber,
        'segment.total': totalSegments,
        duration: this.msToNs(performance.now() - segmentStartTime),
        status: 'success',
        component: 'print-worker',
      })

      await processor.cleanup()
      return Result.ok(undefined)
    } catch (error) {
      await processor.cleanup()
      return this.handleProcessingError(
        error instanceof Error ? error : new Error(String(error)),
        videoId,
        segmentNumber,
        correlationId,
        segmentStartTime,
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
    segmentStartTime: number,
    userEmail?: string,
    videoName?: string,
  ): Promise<Result<void, Error>> {
    this.deps.logger.error('segment.processing.end', {
      'video.id': videoId,
      'segment.number': segmentNumber,
      error: error.message,
      duration: this.msToNs(performance.now() - segmentStartTime),
      status: 'error',
      component: 'print-worker',
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
    this.deps.logger.log('segment.processing.progress', {
      'video.id': videoId,
      'segment.number': segmentNumber,
      'segment.total': totalSegments,
      component: 'print-worker',
    })
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
    this.deps.logger.log('video.status.changed', {
      'video.id': videoId,
      'video.status': status,
      component: 'print-worker',
    })
  }
}

if (import.meta.main) {
  const logger = new PinoLoggerService(
    { suppressConsole: false, serviceName: 'fiap-image-print' },
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
