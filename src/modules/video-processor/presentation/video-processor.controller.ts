import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { CreateUrlsUseCase } from '@modules/video-processor/application/create-urls.use-case'
import { CreateVideoUseCase } from '@modules/video-processor/application/create-video.use-case'

export class VideoProcessorController {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly createVideoUseCase: CreateVideoUseCase,
    private readonly createUrlsUseCase: CreateUrlsUseCase,
  ) {}
  async create(): Promise<Result<string[], Error>> {
    this.logger.log('Creating video processor')

    const video = await this.createVideoUseCase.execute({
      totalSize: 40_000_000, // 40MB
      duration: 1000, // 1s
    })

    if (video.isFailure) return Result.fail(video.error)

    const videoResult = video.value

    if (!videoResult) return Result.fail(new Error('Video not found'))

    const urls = await this.createUrlsUseCase.execute({
      videoId: videoResult.video.id,
      totalSize: videoResult.video.totalSize,
      duration: videoResult.video.duration,
      uploadId: videoResult.uploadId,
    })

    if (urls.isFailure) return Result.fail(urls.error)

    return Result.ok(urls.value)
  }
}
