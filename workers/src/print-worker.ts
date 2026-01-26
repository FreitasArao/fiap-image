import { type Message } from '@aws-sdk/client-sqs'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { AbstractSQSConsumer } from '../../src/modules/messaging/sqs/abstract-sqs-consumer'
import {
  createStoragePathBuilder,
  type StoragePathBuilder,
} from '../../src/modules/video-processor/infra/services/storage'
import { context } from '@opentelemetry/api'
import { FFmpegService } from './ffmpeg.service'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'

type VideoEvent = {
  detail: {
    videoId: string
    videoPath?: string
    userEmail?: string
    videoName?: string
  }
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

class PrintWorker extends AbstractSQSConsumer<VideoEvent> {
  private readonly pathBuilder: StoragePathBuilder = createStoragePathBuilder()
  private outputBucket = process.env.S3_OUTPUT_BUCKET || 'fiapx-video-frames'
  private frameInterval = parseInt(process.env.FRAME_INTERVAL || '1', 10)

  protected parseMessage(body: string): VideoEvent | null {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }

  protected async handleMessage(event: VideoEvent, _message: Message): Promise<void> {
    const { videoId, videoPath, userEmail, videoName } = event.detail

    if (!videoPath) {
      throw new Error(`Missing videoPath for video: ${videoId}`)
    }

    const inputBucket = this.pathBuilder.bucket
    const parsedPath = this.pathBuilder.parse(videoPath)

    if (!parsedPath) {
      throw new Error(`Invalid videoPath format: ${videoPath}`)
    }

    this.logger.log(`[PRINT] Processing video: ${videoId}`)

    const ffmpeg = new FFmpegService(videoId)

    try {
      await ffmpeg.setup()

      this.logger.log(
        `[PRINT] Downloading from s3://${inputBucket}/${parsedPath.key}`,
      )
      const inputPath = await ffmpeg.download(inputBucket, parsedPath.key)

      this.logger.log(
        `[PRINT] Extracting frames (1 every ${this.frameInterval}s)...`,
      )
      const { outputDir, count } = await ffmpeg.extractFrames(
        inputPath,
        this.frameInterval,
      )
      this.logger.log(`[PRINT] Extracted ${count} frames`)

      this.logger.log(`[PRINT] Uploading frames to S3...`)
      const printsPrefix = this.pathBuilder
        .videoPrint(videoId, '')
        .key.replace(/\/$/, '')
      await ffmpeg.uploadDir(
        outputDir,
        this.outputBucket,
        printsPrefix,
        'frame_*.jpg',
      )

      const downloadUrl = `http://localhost:4566/${this.outputBucket}/${printsPrefix}/`

      await this.emitStatusEvent(
        videoId,
        'COMPLETED',
        userEmail,
        videoName,
        downloadUrl,
      )

      this.logger.log(`[PRINT] Complete: ${videoId}`)
    } finally {
      await ffmpeg.cleanup()
    }
  }

  protected override async onError(
    error: Error,
    message: Message,
    payload?: VideoEvent,
  ): Promise<void> {
    this.logger.error('[PRINT] Error processing video', {
      error: error.message,
      videoId: payload?.detail?.videoId,
      messageId: message.MessageId,
    })

    const nonRetryablePatterns = [
      '404',
      'does not exist',
      'NoSuchKey',
      'invalid',
      'not found',
    ]

    const isNonRetryable = nonRetryablePatterns.some((pattern) =>
      error.message.toLowerCase().includes(pattern.toLowerCase()),
    )

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

  private async emitStatusEvent(
    videoId: string,
    status: string,
    userEmail?: string,
    videoName?: string,
    downloadUrl?: string,
    errorReason?: string,
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
              downloadUrl: downloadUrl || '',
              errorReason: errorReason || '',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )
    this.logger.log(`[PRINT] Emitted event: ${status}`)
  }
}

const queueUrl =
  process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/print-queue'
const worker = new PrintWorker({ queueUrl }, logger)

logger.log('Starting Print Worker...')
worker.start()
