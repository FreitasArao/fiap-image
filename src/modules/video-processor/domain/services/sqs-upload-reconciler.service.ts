import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import type { Video } from '@modules/video-processor/domain/entities/video'
import {
  ReconcileUploadService,
  type ReconcileResult,
} from './reconcile-upload.service'

export type SqsReconcileParams = {
  videoId: string
  objectKey: string
  correlationId: string
  traceId?: string
}

export type SqsReconcileResult = Omit<ReconcileResult, 'reason'> & {
  reason?: 'already_processed' | 'concurrent_update' | 'video_not_found'
}

export class SqsUploadReconciler {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly videoRepository: VideoRepository,
    private readonly reconcileService: ReconcileUploadService,
  ) {}

  private static readonly resource = 'SqsUploadReconcilerService'

  async execute(
    params: SqsReconcileParams,
  ): Promise<Result<SqsReconcileResult, Error>> {
    const { videoId, objectKey, correlationId, traceId } = params

    this.logger.log('SQS reconciliation started', {
      event: 'video.reconcile.started',
      resource: SqsUploadReconciler.resource,
      message: 'Starting SQS reconciliation',
      'video.id': videoId,
      's3.objectKey': objectKey,
    })

    const videoResult = await this.videoRepository.findByObjectKey(objectKey)

    if (videoResult.isFailure) {
      this.logger.error('SQS reconciliation failed (find video)', {
        event: 'video.reconcile.completed',
        resource: SqsUploadReconciler.resource,
        message: 'Failed to find video',
        status: 'failure',
        error:
          videoResult.error instanceof Error
            ? {
                message: videoResult.error.message,
                kind: videoResult.error.constructor.name,
                stack: videoResult.error.stack,
              }
            : { message: String(videoResult.error), kind: 'Error' },
        'video.id': videoId,
        's3.objectKey': objectKey,
      })
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      this.logger.warn('SQS reconciliation skipped (video not found)', {
        event: 'video.reconcile.completed',
        resource: SqsUploadReconciler.resource,
        message: 'Video not found',
        status: 'skipped',
        'video.id': videoId,
        's3.objectKey': objectKey,
      })
      return Result.ok({
        skipped: true,
        reason: 'video_not_found',
        videoId,
      })
    }

    video.reconcileAllPartsAsUploaded()

    const reconcileResult = await this.reconcileService.reconcile({
      video,
      correlationId,
      traceId,
    })

    if (reconcileResult.isFailure) {
      return Result.fail(reconcileResult.error)
    }

    if (!reconcileResult.value.skipped) {
      await this.persistReconciledParts(video)
    }

    return reconcileResult as Result<SqsReconcileResult, Error>
  }

  private async persistReconciledParts(video: Video): Promise<void> {
    await Promise.all(
      video.parts.map((part) =>
        this.videoRepository.updateVideoPart(video, part.partNumber),
      ),
    )
  }
}
