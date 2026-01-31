import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import {
  createStoragePathBuilder,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'

export type CompleteMultipartEvent = {
  detail: {
    bucket: {
      name: string
    }
    object: {
      key: string
    }
    reason: string
  }
}

export interface EventBridgeEmitter {
  send(command: PutEventsCommand): Promise<unknown>
}

export class CompleteMultipartHandler {
  private readonly pathBuilder: StoragePathBuilder
  private readonly eventBridgeClient: EventBridgeEmitter

  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly videoRepository: VideoRepository,
    eventBridgeClient?: EventBridgeEmitter,
  ) {
    this.pathBuilder = createStoragePathBuilder()
    this.eventBridgeClient =
      eventBridgeClient ||
      new EventBridgeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT || process.env.AWS_ENDPOINT_URL,
      })
  }

  async handle(
    event: CompleteMultipartEvent,
    correlationId?: string,
  ): Promise<Result<void, Error>> {
    const { key } = event.detail.object
    const { name: bucket } = event.detail.bucket

    this.logger.log('Received S3 CompleteMultipartUpload event', {
      key,
      bucket,
      correlationId,
    })

    const fullPath = `${bucket}/${key}`
    const parsed = this.pathBuilder.parse(fullPath)

    if (!parsed) {
      this.logger.error('Invalid storage path format', {
        key,
        fullPath,
        correlationId,
        event: JSON.stringify(event),
      })
      return Result.fail(new Error('Invalid storage path format'))
    }

    const { videoId } = parsed

    const result = await this.videoRepository.findById(videoId)
    if (result.isFailure || !result.value) {
      this.logger.error(`Video not found for reconciliation: ${videoId}`, {
        key,
        videoId,
        correlationId,
        event: JSON.stringify(event),
      })
      return Result.fail(
        new Error(`Video not found for reconciliation: ${videoId}`),
      )
    }

    const video = result.value

    if (video.isAlreadyUploaded()) {
      this.logger.log(
        'Video already uploaded/processing, skipping reconciliation',
        {
          videoId,
          correlationId,
          event: JSON.stringify(event),
        },
      )
      return Result.fail(
        new Error('Video already uploaded/processing, skipping reconciliation'),
      )
    }

    video.reconcileAllPartsAsUploaded()
    const transitionResult = video.completeUpload()

    if (transitionResult.isFailure) {
      this.logger.error(
        'Failed to transition video status during reconciliation',
        {
          videoId,
          currentStatus: video.status.value,
          error: transitionResult.error,
        },
      )
      return Result.fail(
        new Error('Failed to transition video status during reconciliation'),
      )
    }

    await Promise.all([
      ...video.parts.map((part) =>
        this.videoRepository.updateVideoPart(video, part.partNumber),
      ),
      this.videoRepository.updateVideo(video),
    ])

    this.logger.log('Video status updated to UPLOADED', {
      videoId,
      correlationId,
    })

    // Emit UPLOADED event to trigger orchestrator-worker
    await this.eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId,
              videoPath: video.thirdPartyVideoIntegration?.path || videoId,
              duration: video.metadata.durationMs,
              videoName: video.metadata.value.filename,
              status: 'UPLOADED',
              correlationId: correlationId || crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )

    this.logger.log('Emitted UPLOADED event to EventBridge', {
      videoId,
      correlationId,
    })

    return Result.ok()
  }
}
