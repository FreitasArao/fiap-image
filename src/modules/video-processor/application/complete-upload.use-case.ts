import { Result } from '@core/domain/result'
import { CorrelationStore } from '@core/libs/context'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import type { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'
import type { ReconcileUploadService } from '@modules/video-processor/domain/services/reconcile-upload.service'

export type CompleteUploadParams = {
  videoId: string
  correlationId?: string
  traceId?: string
}

export type CompleteUploadResult = {
  status: string
  location: string
  etag: string
}

/**
 * CompleteUploadUseCase - Orchestrates the completion of a multipart upload.
 *
 * This use case is responsible for:
 * 1. Validating the video is ready for completion (all parts uploaded)
 * 2. Calling S3 to complete the multipart upload
 * 3. Delegating status transition and event emission to ReconcileUploadService
 *
 * The actual status transition and event emission is handled by ReconcileUploadService
 * which implements the Idempotent Receiver pattern to prevent race conditions.
 */
export class CompleteUploadUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly uploadService: UploadVideoPartsService,
    private readonly reconcileService: ReconcileUploadService,
  ) {}

  async execute(
    params: CompleteUploadParams,
  ): Promise<Result<CompleteUploadResult, Error>> {
    const { videoId } = params

    // Prefer implicit correlationId from CorrelationStore (set by HTTP middleware)
    // Fallback to explicit params for backwards compatibility
    const effectiveCorrelationId =
      CorrelationStore.correlationId ??
      params.correlationId ??
      crypto.randomUUID()
    const effectiveTraceId =
      CorrelationStore.traceId ?? params.traceId ?? crypto.randomUUID()

    // 1. Find and validate video
    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) return Result.fail(videoResult.error)

    const video = videoResult.value
    if (!video) return Result.fail(new Error(`Video not found: ${videoId}`))

    // 2. Validate video is in correct status
    if (!video.status.isUploading()) {
      return Result.fail(
        new Error(
          `Cannot complete upload for video in status: ${video.status.value}`,
        ),
      )
    }

    // 3. Validate all parts are uploaded
    if (!video.isFullyUploaded()) {
      const progress = video.getUploadProgress()
      return Result.fail(
        new Error(
          `Cannot complete upload: only ${progress.uploadedParts}/${progress.totalParts} parts uploaded`,
        ),
      )
    }

    const parts = video.getUploadedPartsEtags()
    if (parts.length === 0)
      return Result.fail(new Error('No parts with ETags found'))

    const uploadId = video.thirdPartyVideoIntegration?.uploadId
    const key = video.thirdPartyVideoIntegration?.key
    const isMissingUploadIdOrKey = !uploadId || !key
    if (isMissingUploadIdOrKey)
      return Result.fail(new Error('Missing upload ID or key'))

    // 4. Complete multipart upload in S3
    const completeResult = await this.uploadService.completeMultipartUpload({
      key,
      uploadId,
      parts,
    })

    if (completeResult.isFailure) return Result.fail(completeResult.error)

    // 5. Delegate status transition and event emission to ReconcileUploadService
    // This service implements Idempotent Receiver pattern with conditional updates
    const reconcileResult = await this.reconcileService.reconcile({
      video,
      correlationId: effectiveCorrelationId,
      traceId: effectiveTraceId,
    })

    if (reconcileResult.isFailure) {
      return Result.fail(reconcileResult.error)
    }

    // Even if skipped (concurrent update), the S3 operation succeeded
    // so we return success with the S3 result
    return Result.ok({
      status: reconcileResult.value.status ?? 'UPLOADED',
      location: completeResult.value.location,
      etag: completeResult.value.etag,
    })
  }
}
