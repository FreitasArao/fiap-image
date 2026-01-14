import { DefaultDatabase } from '@core/libs/database/default-scylla.database'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'

export class VideoProcessorController {
  constructor(
    private readonly logger: AbstractLoggerService,
    private readonly videoRepository: VideoRepositoryImpl = new VideoRepositoryImpl(
      logger,
    ),
  ) {}
  async create() {
    this.logger.log('Creating video processor')

    return this.videoRepository.create({
      created_at: new Date(),
      updated_at: new Date(),
      status: 'pending',
      upload_urls: [],
      video_id: '123',
    })
  }
}
