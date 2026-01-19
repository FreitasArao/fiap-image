import { SQSClient, type Message } from '@aws-sdk/client-sqs'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { AbstractSQSConsumer } from '../../src/modules/messaging/sqs/abstract-sqs-consumer'

import { FFmpegService } from './ffmpeg.service'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'

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

class SplitWorker extends AbstractSQSConsumer<VideoEvent> {
  private inputBucket = process.env.S3_INPUT_BUCKET || 'fiapx-video-parts'
  private outputBucket = process.env.S3_OUTPUT_BUCKET || 'fiapx-video-frames'
  private segmentDuration = parseInt(process.env.SEGMENT_DURATION || '10', 10)

  protected parseMessage(message: Message): VideoEvent {
    const body = JSON.parse(message.Body || '{}')
    return body
  }

  protected async handleMessage(event: VideoEvent): Promise<void> {
    const { videoId, videoPath, userEmail, videoName } = event.detail
    const s3Key = videoPath || videoId

    this.logger.log(`[SPLIT] Processing video: ${videoId}`)

    const ffmpeg = new FFmpegService(videoId)

    try {
      await ffmpeg.setup()

      // Download video
      this.logger.log(
        `[SPLIT] Downloading from s3://${this.inputBucket}/${s3Key}/`,
      )
      const inputPath = await ffmpeg.download(
        this.inputBucket,
        `${s3Key}/video.mp4`,
      )

      // Split into segments
      this.logger.log(
        `[SPLIT] Splitting into ${this.segmentDuration}s segments...`,
      )
      const { outputDir, count } = await ffmpeg.split(
        inputPath,
        this.segmentDuration,
      )
      this.logger.log(`[SPLIT] Created ${count} segments`)

      // Upload segments
      this.logger.log(`[SPLIT] Uploading segments to S3...`)
      await ffmpeg.uploadDir(
        outputDir,
        this.outputBucket,
        `${videoId}/segments`,
        'segment_*.mp4',
      )

      // Emit SPLITTING event
      await this.emitStatusEvent(videoId, 'SPLITTING', userEmail, videoName)

      this.logger.log(`[SPLIT] Complete: ${videoId}`)
    } finally {
      await ffmpeg.cleanup()
    }
  }

  protected async onError(
    error: Error,
    message: VideoEvent | null,
  ): Promise<'retry' | 'discard'> {
    this.logger.error('[SPLIT] Error processing video', {
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

    if (isNonRetryable) {
      this.logger.warn('[SPLIT] Non-retryable error, discarding message', {
        videoId: message?.detail?.videoId,
      })
      // TODO: Emit FAILED event to update video status
      return 'discard'
    }

    return 'retry'
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
    this.logger.log(`[SPLIT] Emitted event: ${status}`)
  }
}

// Start worker
const queueUrl =
  process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/split-queue'
const worker = new SplitWorker(logger, sqsClient, queueUrl)

logger.log('Starting Split Worker...')
worker.start()
