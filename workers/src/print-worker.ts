import { SQSClient, type Message } from '@aws-sdk/client-sqs'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { AbstractSQSConsumer } from '../../src/modules/messaging/sqs/abstract-sqs-consumer'
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

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
})

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
})

class PrintWorker extends AbstractSQSConsumer<VideoEvent> {
  private inputBucket = process.env.S3_INPUT_BUCKET || 'fiapx-video-parts'
  private outputBucket = process.env.S3_OUTPUT_BUCKET || 'fiapx-video-frames'
  private frameInterval = parseInt(process.env.FRAME_INTERVAL || '1', 10)

  protected parseMessage(message: Message): VideoEvent {
    const body = JSON.parse(message.Body || '{}')
    return body
  }

  protected async handleMessage(event: VideoEvent): Promise<void> {
    try {
      const { videoId, videoPath, userEmail, videoName } = event.detail
      const s3Key = videoPath || videoId

      this.logger.log(`[PRINT] Processing video: ${videoId}`)

      const ffmpeg = new FFmpegService(videoId)

      try {
        await ffmpeg.setup()

        this.logger.log(
          `[PRINT] Downloading from s3://${this.inputBucket}/${s3Key}/`,
        )
        const inputPath = await ffmpeg.download(
          this.inputBucket,
          `${s3Key}/video.mp4`,
        )

        this.logger.log(
          `[PRINT] Extracting frames (1 every ${this.frameInterval}s)...`,
        )
        const { outputDir, count } = await ffmpeg.extractFrames(
          inputPath,
          this.frameInterval,
        )
        this.logger.log(`[PRINT] Extracted ${count} frames`)

        this.logger.log(`[PRINT] Uploading frames to S3...`)
        await ffmpeg.uploadDir(
          outputDir,
          this.outputBucket,
          `${videoId}/frames`,
          'frame_*.jpg',
        )

        const downloadUrl = `http://localhost:4566/${this.outputBucket}/${videoId}/frames/`

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
    } catch (error) {
      await this.onError(error as Error, event)
      return
    }
  }

  protected async onError(
    error: Error,
    message: VideoEvent | null,
  ): Promise<'retry' | 'discard'> {
    this.logger.error('[PRINT] Error processing video', {
      error: error.message,
      videoId: message?.detail?.videoId,
    })

    // Non-retryable errors: file not found, invalid format, etc.
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

    // Emit FAILED event for non-retryable errors
    if (isNonRetryable && message?.detail?.videoId) {
      await this.emitStatusEvent(
        message.detail.videoId,
        'FAILED',
        message.detail.userEmail,
        message.detail.videoName,
        undefined,
        error.message,
      )
      return 'discard'
    }

    return 'discard'
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

// Start worker
const queueUrl =
  process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/print-queue'
const worker = new PrintWorker(logger, sqsClient, queueUrl)

logger.log('Starting Print Worker...')
worker.start()
