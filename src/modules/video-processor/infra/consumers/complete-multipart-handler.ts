import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import {
  createStoragePathBuilder,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'

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

export class CompleteMultipartHandler {
  private readonly pathBuilder: StoragePathBuilder

  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly videoRepository: VideoRepository,
  ) {
    this.pathBuilder = createStoragePathBuilder()
  }

  async handle(event: CompleteMultipartEvent): Promise<Result<void, Error>> {
    const { key } = event.detail.object
    const { name: bucket } = event.detail.bucket

    this.logger.log('Received S3 CompleteMultipartUpload event', {
      key,
      bucket,
    })

    const fullPath = `${bucket}/${key}`
    const parsed = this.pathBuilder.parse(fullPath)

    if (!parsed) {
      this.logger.error('Invalid storage path format', {
        key,
        fullPath,
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

    this.logger.log('Video reconciled successfully', {
      videoId,
    })

    return Result.ok()
  }
}
