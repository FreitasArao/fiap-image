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

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
})

class SplitWorker extends AbstractSQSConsumer<VideoEvent> {
  private readonly pathBuilder: StoragePathBuilder = createStoragePathBuilder()
  private outputBucket = process.env.S3_OUTPUT_BUCKET || 'fiapx-video-frames'
  private segmentDuration = parseInt(process.env.SEGMENT_DURATION || '10', 10)

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
    const inputStoragePath = this.pathBuilder.parse(videoPath)

    if (!inputStoragePath) {
      throw new Error(`Invalid videoPath format: ${videoPath}`)
    }

    const s3Key = inputStoragePath.key

    this.logger.log(`[SPLIT] Processing video: ${videoId}`)

    const ffmpeg = new FFmpegService(videoId)

    try {
      await ffmpeg.setup()

      this.logger.log(`[SPLIT] Downloading from s3://${inputBucket}/${s3Key}`)
      const inputPath = await ffmpeg.download(inputBucket, s3Key)

      this.logger.log(
        `[SPLIT] Splitting into ${this.segmentDuration}s segments...`,
      )
      const { outputDir, count } = await ffmpeg.split(
        inputPath,
        this.segmentDuration,
      )
      this.logger.log(`[SPLIT] Created ${count} segments`)

      this.logger.log(`[SPLIT] Uploading segments to S3...`)
      const partsPrefix = this.pathBuilder.videoPart(videoId, '').key.replace(/\/$/, '')
      await ffmpeg.uploadDir(
        outputDir,
        this.outputBucket,
        partsPrefix,
        'segment_*.mp4',
      )

      await this.emitStatusEvent(videoId, 'SPLITTING', userEmail, videoName)

      this.logger.log(`[SPLIT] Complete: ${videoId}`)
    } finally {
      await ffmpeg.cleanup()
    }
  }

  protected override async onError(
    error: Error,
    message: Message,
    payload?: VideoEvent,
  ): Promise<void> {
    this.logger.error('[SPLIT] Error processing video', {
      error: error.message,
      videoId: payload?.detail?.videoId,
      messageId: message.MessageId,
    })
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

const queueUrl =
  process.env.SQS_QUEUE_URL || 'http://localhost:4566/000000000000/split-queue'
const worker = new SplitWorker({ queueUrl }, logger)

logger.log('Starting Split Worker...')
worker.start()
