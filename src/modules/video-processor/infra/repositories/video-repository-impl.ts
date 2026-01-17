import { Result } from '@core/domain/result'
import { DatabaseExecutionError } from '@core/errors/database.error'
import { DataSource } from '@core/libs/database/datasource'
import { DefaultDatabase } from '@core/libs/database/default-cassabdra.database'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type {
  VideoTable,
  VideoByUserTable,
  VideoPartsTable,
  VideoByThirdPartyIdTable,
} from '../tables'

import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { UniqueEntityID } from '@modules/video-processor/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import {
  VideoStatusVO,
  type VideoStatus,
} from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import {
  PartStatusVO,
  type PartStatusType,
} from '@modules/video-processor/domain/value-objects/part-status.vo'

export class VideoRepositoryImpl
  extends DefaultDatabase
  implements VideoRepository
{
  constructor(logger: AbstractLoggerService) {
    super(DataSource.getInstance(logger), logger)
  }

  async findById(videoId: string): Promise<Result<Video | null, Error>> {
    this.logger.log('Finding video by ID', { videoId })

    try {
      // Fetch video
      const videoResult = await this.select<VideoTable>({
        table: 'video',
        where: { video_id: videoId },
      })

      if (videoResult.isFailure) {
        return Result.fail(videoResult.error)
      }

      const videoRows = videoResult.value
      if (!videoRows || videoRows.length === 0) {
        return Result.ok(null)
      }

      const videoRow = videoRows[0]

      // Fetch parts
      const partsResult = await this.select<VideoPartsTable>({
        table: 'video_parts',
        where: { video_id: videoId },
      })

      const partsRows = partsResult.isSuccess ? partsResult.value : []

      // Reconstruct Video entity
      const parts = (partsRows || []).map((partRow) =>
        VideoPart.createFromDatabase({
          videoId: UniqueEntityID.create(videoId),
          partNumber: partRow.part_number,
          size: partRow.size,
          thirdPartyVideoPartId: partRow.third_party_video_part_id,
          integration: ThirdPartyIntegration.create(),
          url: partRow.url,
          etag: partRow.etag,
          uploadedAt: partRow.uploaded_at,
          status: PartStatusVO.create(partRow.status as PartStatusType),
        }),
      )

      const video = Video.createFromDatabase({
        id: UniqueEntityID.create(videoId),
        userId: UniqueEntityID.create(videoRow.user_id),
        metadata: VideoMetadataVO.create({
          totalSize: videoRow.total_size,
          duration: videoRow.duration,
        }),
        status: VideoStatusVO.create(videoRow.status as VideoStatus),
        parts,
        integration: ThirdPartyIntegration.create(),
        thirdPartyVideoIntegration:
          VideoThirdPartyIntegrationsMetadataVO.create({
            id: videoRow.third_party_video_id,
            bucket: videoRow.bucket_name,
            path: videoRow.object_key,
          }),
        failureReason: videoRow.failure_reason,
      })

      this.logger.log('Video found', { videoId, status: video.status.value })
      return Result.ok(video)
    } catch (error) {
      this.logger.error('Failed to find video', { videoId, error })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async createVideo(
    video: Video,
  ): Promise<Result<void, DatabaseExecutionError>> {
    this.logger.log('Creating video', { video })
    if (!video.integration) {
      this.logger.error('Cannot create video without integration', { video })
      return Result.fail(
        DatabaseExecutionError.create(
          'Cannot create video without integration',
        ),
      )
    }
    if (!video.thirdPartyVideoIntegration) {
      this.logger.error(
        'Cannot create video without third party video integration',
        { video },
      )
      return Result.fail(
        DatabaseExecutionError.create(
          'Cannot create video without third party video integration',
        ),
      )
    }
    this.logger.log('Creating video', { video: video.id.value })
    await Promise.all([
      this.insert<VideoTable>({
        table: 'video',
        data: {
          bucket_name: video.thirdPartyVideoIntegration.value.bucket,
          object_key: video.thirdPartyVideoIntegration.value.path,
          video_id: video.id.value,
          user_id: video.userId.value,
          status: video.status.value,
          total_size: video.metadata.value.totalSize,
          duration: video.metadata.value.duration,
          parts_count: video.parts.length,
          integration_name: video.integration.provider,
          third_party_video_id: video.thirdPartyVideoIntegration.value.id,
          created_at: video.createdAt,
          updated_at: video.updatedAt,
        },
      }),
      this.createVideoByUser({
        created_at: video.createdAt,
        video_id: video.id.value,
        status: video.status.value,
        user_id: video.integration.id.value,
      }),
      this.createVideoByThirdPartyId({
        integration_name: video.integration.provider,
        third_party_video_id: video.thirdPartyVideoIntegration.value.id,
        video_id: video.id.value,
      }),
      this.createVideoParts(video),
    ])
    this.logger.log('Video created and synched with user', {
      video: video.id.value,
    })
    return Result.ok(undefined)
  }

  async createVideoByUser(
    videoByUser: VideoByUserTable,
  ): Promise<Result<void, DatabaseExecutionError>> {
    this.logger.log('Creating video by user', { videoByUser })
    const result = await this.insert<VideoByUserTable>({
      table: 'video_by_user',
      data: videoByUser,
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async createVideoParts(
    video: Video,
  ): Promise<Result<void, DatabaseExecutionError>> {
    this.logger.log('Creating video part', { video: video.id.value })
    const parts: VideoPartsTable[] = video.parts.map((part) => ({
      video_id: video.id.value,
      part_number: part.partNumber,
      size: part.size,
      third_party_video_part_id: part.thirdPartyVideoPartId,
      status: part.status.value,
      created_at: part.createdAt,
      updated_at: part.updatedAt,
      url: part.url,
      etag: part.etag,
      uploaded_at: part.uploadedAt,
    }))
    await Promise.all(
      parts.map((part) =>
        this.insert<VideoPartsTable>({
          table: 'video_parts',
          data: part,
        }),
      ),
    )
    this.logger.log('Video parts created', { video: video.id.value })
    return Result.ok(undefined)
  }

  async createVideoByThirdPartyId(
    lookup: VideoByThirdPartyIdTable,
  ): Promise<Result<void, DatabaseExecutionError>> {
    const result = await this.insert<VideoByThirdPartyIdTable>({
      table: 'video_by_third_party_id',
      data: lookup,
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async updateVideoPart(
    video: Video,
    partNumber: number,
  ): Promise<Result<void, Error>> {
    this.logger.log('Updating video part', { video: video.id.value })
    const part = video.parts.find((part) => part.partNumber === partNumber)
    if (!part) {
      this.logger.error('Video part not found', {
        video: video.id.value,
        partNumber,
      })
      return Result.fail(new Error('Video part not found'))
    }
    const result = await this.update<VideoPartsTable>({
      table: 'video_parts',
      data: {
        updated_at: new Date(),
        size: part.size,
        third_party_video_part_id: part.thirdPartyVideoPartId,
        status: part.status.value,
        etag: part.etag,
        uploaded_at: part.uploadedAt,
      },
      where: {
        video_id: video.id.value,
        part_number: partNumber,
      },
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async updateVideo(video: Video): Promise<Result<void, Error>> {
    this.logger.log('Updating video', { video: video.id.value })
    const result = await this.update<VideoTable>({
      table: 'video',
      data: {
        total_size: video.metadata.value.totalSize,
        duration: video.metadata.value.duration,
        parts_count: video.parts.length,
        status: video.status.value,
        updated_at: new Date(),
        bucket_name: video.thirdPartyVideoIntegration?.value.bucket,
        object_key: video.thirdPartyVideoIntegration?.value.path,
        integration_name: video.integration?.provider,
        third_party_video_id: video.thirdPartyVideoIntegration?.value.id,
        user_id: video.integration?.id.value,
        failure_reason: video.failureReason,
      },
      where: {
        video_id: video.id.value,
      },
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }
}
