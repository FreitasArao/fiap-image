import { Result } from '@core/domain/result'
import { DatabaseExecutionError } from '@core/errors/database.error'
import { DataSource } from '@core/libs/database/datasource'
import { DefaultDatabase } from '@core/libs/database/default-scylla.database'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export type VideoMetadata = {
  video_id: string
  upload_urls: string[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: Date
  updated_at: Date
}

export class VideoRepositoryImpl extends DefaultDatabase {
  constructor(logger: AbstractLoggerService) {
    super(DataSource.getInstance(logger), logger)
  }

  async create(
    video: VideoMetadata,
  ): Promise<Result<void, DatabaseExecutionError>> {
    const result = await this.insert<VideoMetadata>({
      table: 'video_metadata',
      data: {
        video_id: video.video_id,
        upload_urls: video.upload_urls,
        status: video.status,
        created_at: video.created_at,
        updated_at: video.updated_at,
      },
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }
}
