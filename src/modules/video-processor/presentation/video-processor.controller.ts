import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  CreateUrlsUseCase,
  CreateUrlsUseCaseResult,
} from '@modules/video-processor/application/create-urls.use-case'

export type CreateVideoParams = {
  totalSize: number
  duration: number
}

export class VideoProcessorController {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly createUrlsUseCase: CreateUrlsUseCase,
  ) {}

  async create(
    params: CreateVideoParams,
  ): Promise<Result<CreateUrlsUseCaseResult, Error>> {
    this.logger.log('Creating video and generating upload URLs', {
      totalSize: params.totalSize,
      duration: params.duration,
    })

    const result = await this.createUrlsUseCase.execute({
      totalSize: params.totalSize,
      duration: params.duration,
    })

    if (result.isFailure) {
      this.logger.error('Failed to create video', { error: result.error })
      return Result.fail(result.error)
    }

    this.logger.log('Video created successfully', {
      videoId: result.value.video.id,
      uploadId: result.value.uploadId,
      urlsCount: result.value.urls.length,
      videoPath: result.value.video.thirdPartyVideoIntegration?.value.path,
    })

    return Result.ok(result.value)
  }
}
