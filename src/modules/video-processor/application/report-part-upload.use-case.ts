import { Result } from '@core/domain/result'
import {
  Video,
  type UploadProgress,
} from '@modules/video-processor/domain/entities/video'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'

export type ReportPartUploadParams = {
  videoId: string
  partNumber: number
  etag: string
}

export type ReportPartUploadResult = {
  progress: {
    totalParts: number
    uploadedParts: number
    percentage: number
  }
}

/**
 * Use case for reporting a part upload.
 * Client calls this after successfully uploading a part to S3 with the ETag.
 */
export class ReportPartUploadUseCase {
  constructor(
    private readonly videoRepository: Pick<
      VideoRepository,
      'findById' | 'updateVideoPart' | 'updateVideo'
    >,
  ) {}

  async execute(
    params: ReportPartUploadParams,
  ): Promise<Result<ReportPartUploadResult, Error>> {
    const { videoId, partNumber, etag } = params

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
    if (!video.status.isUploading() && video.status.value !== 'CREATED') {
      return Result.fail(
        new Error(
          `Cannot report part upload for video in status: ${video.status.value}`,
        ),
      )
    }

    // Mark the part as uploaded
    video.markPartAsUploaded(partNumber, etag)

    // If this was the first part reported and status is CREATED, transition to UPLOADING
    if (video.status.value === 'CREATED') {
      const transitionResult = video.startUploading()
      if (transitionResult.isFailure) {
        return Result.fail(transitionResult.error)
      }
      await this.videoRepository.updateVideo(video)
    }

    // Update the part in the database
    const updateResult = await this.videoRepository.updateVideoPart(
      video,
      partNumber,
    )
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error)
    }

    // Return progress
    const progress = video.getUploadProgress()

    return Result.ok({
      progress: {
        totalParts: progress.totalParts,
        uploadedParts: progress.uploadedParts,
        percentage: progress.percentage,
      },
    })
  }
}
