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

  async execute(
    params: SqsReconcileParams,
  ): Promise<Result<SqsReconcileResult, Error>> {
    const { videoId, objectKey, correlationId, traceId } = params

    this.logger.log(`[SqsReconciler] Starting SQS reconciliation`, {
      videoId,
      objectKey,
    })

    const videoResult = await this.videoRepository.findByObjectKey(objectKey)

    if (videoResult.isFailure) {
      this.logger.error(`[SqsReconciler] Failed to find video`, {
        videoId,
        objectKey,
        error: videoResult.error,
      })
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      this.logger.warn(`[SqsReconciler] Video not found`, {
        videoId,
        objectKey,
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
