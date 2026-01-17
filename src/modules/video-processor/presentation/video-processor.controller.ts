import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  CreateVideoUseCase,
  CreateVideoUseCaseResult,
} from '@modules/video-processor/application/create-video.use-case'

export type CreateVideoParams = {
  totalSize: number
  duration: number
}

export class VideoProcessorController {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly createVideoUseCase: CreateVideoUseCase,
  ) {}

  async create(
    params: CreateVideoParams,
  ): Promise<Result<CreateVideoUseCaseResult, Error>> {
    this.logger.log('Creating video and generating upload URLs', {
      totalSize: params.totalSize,
      duration: params.duration,
    })

    const result = await this.createVideoUseCase.execute({
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
