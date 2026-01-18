import { Result } from '@core/domain/result'
import type { UploadProgress } from '@modules/video-processor/domain/entities/video'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'

export type GetUploadProgressParams = {
  videoId: string
}

export type GetUploadProgressResult = {
  status: string
  progress: UploadProgress
}

export class GetUploadProgressUseCase {
  constructor(
    private readonly videoRepository: Pick<VideoRepository, 'findById'>,
  ) {}

  async execute(
    params: GetUploadProgressParams,
  ): Promise<Result<GetUploadProgressResult, Error>> {
    const { videoId } = params

    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    return Result.ok({
      status: video.status.value,
      progress: video.getUploadProgress(),
    })
  }
}
