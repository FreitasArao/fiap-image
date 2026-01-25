import { Result } from '@core/domain/result'
import { Video } from '@modules/video-processor/domain/entities/video'

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

export class ReportPartUploadUseCase {
  constructor(
    private readonly videoRepository: Pick<
      VideoRepository,
      'findById' | 'updateVideoPart' | 'updateVideo'
    >,
  ) {}

  private async handleTransitionToUploading(
    video: Video,
  ): Promise<Result<void, Error>> {
    const transitionResult = video.startUploading()
    if (transitionResult.isFailure) return Result.fail(transitionResult.error)

    const response = await this.videoRepository.updateVideo(video)
    if (response.isFailure) return Result.fail(response.error)
    return Result.ok(undefined)
  }

  async execute(
    params: ReportPartUploadParams,
  ): Promise<Result<ReportPartUploadResult, Error>> {
    const { videoId, partNumber, etag } = params

    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) return Result.fail(videoResult.error)

    const video = videoResult.value
    if (!video) return Result.fail(new Error(`Video not found: ${videoId}`))

    const isNotUploading =
      !video.status.isUploading() && video.status.value !== 'CREATED'
    if (isNotUploading)
      return Result.fail(
        new Error(
          `Cannot report part upload for video in status: ${video.status.value}`,
        ),
      )

    const isCreated = video.status.value === 'CREATED'
    if (isCreated) {
      const transitionResult = await this.handleTransitionToUploading(video)
      if (transitionResult.isFailure) return Result.fail(transitionResult.error)
    }

    video.markPartAsUploaded(partNumber, etag)

    const updateResult = await this.videoRepository.updateVideoPart(
      video,
      partNumber,
    )
    if (updateResult.isFailure) return Result.fail(updateResult.error)

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
