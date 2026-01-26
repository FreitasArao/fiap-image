import { type Message } from '@aws-sdk/client-sqs'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { context } from '@opentelemetry/api'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { AbstractSQSConsumer } from '@modules/messaging'
import {
  StoragePathBuilder,
  createStoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import { FFmpegProcessor } from './processors'
import type { VideoProcessorService, EventEmitter } from './abstractions'
import { EventBridgeEmitter } from './adapters'

export type SegmentEvent = {
  detail: {
    videoId: string
    presignedUrl: string
    segmentNumber: number
    totalSegments: number
    startTime: number
    endTime: number
    userEmail?: string
    videoName?: string
  }
}

export interface PrintWorkerDeps {
  eventEmitter: EventEmitter
  processorFactory: (videoId: string) => VideoProcessorService
  pathBuilder?: StoragePathBuilder
  outputBucket?: string
  frameInterval?: number
}

interface PrintWorkerConfig {
  queueUrl: string
  region?: string
  batchSize?: number
  visibilityTimeout?: number
  waitTimeSeconds?: number
  pollingWaitTimeMs?: number
}

export class PrintWorker extends AbstractSQSConsumer<SegmentEvent> {
  private readonly pathBuilder: StoragePathBuilder
  private readonly outputBucket: string
  private readonly frameInterval: number
  private readonly eventEmitter: EventEmitter
  private readonly processorFactory: (videoId: string) => VideoProcessorService

  constructor(
    config: PrintWorkerConfig,
    logger: AbstractLoggerService,
    deps: PrintWorkerDeps,
  ) {
    super(config, logger)
    this.eventEmitter = deps.eventEmitter
    this.processorFactory = deps.processorFactory
    this.pathBuilder = deps.pathBuilder || createStoragePathBuilder()
    this.outputBucket =
      deps.outputBucket || process.env.S3_OUTPUT_BUCKET || 'fiapx-video-frames'
    this.frameInterval =
      deps.frameInterval || parseInt(process.env.FRAME_INTERVAL || '1', 10)
  }

  protected parseMessage(body: string): SegmentEvent | null {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }

  protected async handleMessage(
    event: SegmentEvent,
    _message: Message,
  ): Promise<void> {
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

    this.logger.log(
      `[PRINT] Processing segment ${segmentNumber}/${totalSegments} for video: ${videoId}`,
    )
    this.logger.log(`[PRINT] Time range: ${startTime}s - ${endTime}s`)

    const processor = this.processorFactory(`${videoId}-seg${segmentNumber}`)

    try {
      await processor.setup()

      this.logger.log(`[PRINT] Extracting frames from URL (streaming)...`)

      const { outputDir, count } = await processor.extractFramesFromUrl(
        presignedUrl,
        startTime,
        endTime,
        this.frameInterval,
      )

      this.logger.log(`[PRINT] Extracted ${count} frames`)

      this.logger.log(`[PRINT] Uploading frames to S3...`)
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
      )

      if (isLastSegment) {
        const downloadUrl = `http://localhost:4566/${this.outputBucket}/${this.pathBuilder.videoPrint(videoId, '').key}`

        await this.emitStatusEvent(
          videoId,
          'COMPLETED',
          userEmail,
          videoName,
          downloadUrl,
        )

        this.logger.log(`[PRINT] Video ${videoId} completed!`)
      }

      this.logger.log(
        `[PRINT] Segment ${segmentNumber}/${totalSegments} complete`,
      )
    } finally {
      await processor.cleanup()
    }
  }

  checkAndUpdateProgress(
    videoId: string,
    segmentNumber: number,
    totalSegments: number,
  ): boolean {
    this.logger.log(
      `[PRINT] Segment ${segmentNumber}/${totalSegments} processed for video: ${videoId}`,
    )
    return segmentNumber === totalSegments
  }

  protected override async onError(
    error: Error,
    message: Message,
    payload?: SegmentEvent,
  ): Promise<void> {
    this.logger.error('[PRINT] Error processing segment', {
      error: error.message,
      videoId: payload?.detail?.videoId,
      segmentNumber: payload?.detail?.segmentNumber,
      messageId: message.MessageId,
    })

    const isNonRetryable = this.isNonRetryableError(error)

    if (isNonRetryable && payload?.detail?.videoId) {
      await this.emitStatusEvent(
        payload.detail.videoId,
        'FAILED',
        payload.detail.userEmail,
        payload.detail.videoName,
        undefined,
        error.message,
      )
    }
  }

  isNonRetryableError(error: Error): boolean {
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
    userEmail?: string,
    videoName?: string,
    downloadUrl?: string,
    errorReason?: string,
  ): Promise<void> {
    await this.eventEmitter.emitVideoStatus({
      videoId,
      status,
      userEmail,
      videoName,
      downloadUrl,
      errorReason,
    })
    this.logger.log(`[PRINT] Emitted event: ${status}`)
  }
}

// Bootstrap - only runs when executed directly
if (import.meta.main) {
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

  const queueUrl =
    process.env.SQS_QUEUE_URL ||
    'http://localhost:4566/000000000000/print-queue'

  const worker = new PrintWorker({ queueUrl }, logger, {
    eventEmitter: new EventBridgeEmitter(eventBridgeClient),
    processorFactory: (videoId) => new FFmpegProcessor(videoId),
  })

  logger.log('Starting Print Worker...')
  worker.start()
}
