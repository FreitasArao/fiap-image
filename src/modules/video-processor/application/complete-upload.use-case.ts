import { Result } from '@core/domain/result'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import type { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'

export type CompleteUploadParams = {
  videoId: string
}

export type CompleteUploadResult = {
  status: string
  location: string
  etag: string
}

/**
 * Use case for completing a multipart upload.
 * Validates all parts are uploaded, calls S3 CompleteMultipartUpload,
 * and transitions status to UPLOADED.
 */
export class CompleteUploadUseCase {
  constructor(
    private readonly videoRepository: Pick<
      VideoRepository,
      'findById' | 'updateVideo'
    >,
    private readonly uploadService: Pick<
      UploadVideoParts,
      'completeMultipartUpload'
    >,
  ) {}

  async execute(
    params: CompleteUploadParams,
  ): Promise<Result<CompleteUploadResult, Error>> {
    const { videoId } = params

    // Find the video
    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    // Verify video is in uploading state
    if (!video.status.isUploading()) {
      return Result.fail(
        new Error(
          `Cannot complete upload for video in status: ${video.status.value}`,
        ),
      )
    }

    // Check if all parts are uploaded
    if (!video.isFullyUploaded()) {
      const progress = video.getUploadProgress()
      return Result.fail(
        new Error(
          `Cannot complete upload: only ${progress.uploadedParts}/${progress.totalParts} parts uploaded`,
        ),
      )
    }

    // Get parts with ETags for CompleteMultipartUpload
    const parts = video.getUploadedPartsEtags()
    if (parts.length === 0) {
      return Result.fail(new Error('No parts with ETags found'))
    }

    // Get upload metadata
    const uploadId = video.thirdPartyVideoIntegration?.value.id
    const key = video.thirdPartyVideoIntegration?.value.path
    if (!uploadId || !key) {
      return Result.fail(new Error('Missing upload ID or key'))
    }

    // Call S3 CompleteMultipartUpload
    const completeResult = await this.uploadService.completeMultipartUpload({
      key,
      uploadId,
      parts,
    })

    if (completeResult.isFailure) {
      return Result.fail(completeResult.error)
    }

    // Transition to UPLOADED
    const transitionResult = video.completeUpload()
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.error)
    }

    // Update video in database
    const updateResult = await this.videoRepository.updateVideo(video)
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error)
    }

    return Result.ok({
      status: video.status.value,
      location: completeResult.value.location,
      etag: completeResult.value.etag,
    })
  }
}
