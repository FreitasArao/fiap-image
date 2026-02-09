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
  VideoByObjectKeyTable,
} from '../tables'

import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
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
      return this.mapVideoRowToEntity(videoRow)
    } catch (error) {
      this.logger.error('Failed to find video', { videoId, error })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  async findByIntegrationId(
    integrationId: string,
  ): Promise<Result<Video | null, Error>> {
    this.logger.log('Finding video by Integration ID', { integrationId })
    try {
      const lookupResult = await this.select<VideoByThirdPartyIdTable>({
        table: 'video_by_third_party_id',
        where: { third_party_video_id: integrationId },
      })

      if (lookupResult.isFailure) return Result.fail(lookupResult.error)

      const rows = lookupResult.value
      if (!rows || rows.length === 0) return Result.ok(null)

      // Found videoId, delegate to findById
      return this.findById(rows[0].video_id)
    } catch (error) {
      this.logger.error('Failed to find video by integration id', {
        integrationId,
        error,
      })
      return Result.fail(error as Error)
    }
  }

  async findByObjectKey(
    objectKey: string,
  ): Promise<Result<Video | null, Error>> {
    this.logger.log('Finding video by Object Key', { objectKey })
    try {
      const lookupResult = await this.select<VideoByObjectKeyTable>({
        table: 'video_by_object_key',
        where: { object_key: objectKey },
      })

      if (lookupResult.isFailure) return Result.fail(lookupResult.error)

      const rows = lookupResult.value
      if (!rows || rows.length === 0) return Result.ok(null)

      // Found videoId, delegate to findById
      return this.findById(rows[0].video_id)
    } catch (error) {
      this.logger.error('Failed to find video by object key', {
        objectKey,
        error,
      })
      return Result.fail(error as Error)
    }
  }

  private async mapVideoRowToEntity(
    videoRow: VideoTable,
  ): Promise<Result<Video | null, Error>> {
    // Fetch parts
    const partsResult = await this.select<VideoPartsTable>({
      table: 'video_parts',
      where: { video_id: videoRow.video_id },
    })

    const partsRows = partsResult.isSuccess ? partsResult.value : []

    // Reconstruct Video entity
    // third_party_video_part_id armazena o etag (identificador do provedor)
    const parts = (partsRows || []).map((partRow) =>
      VideoPart.createFromDatabase({
        videoId: UniqueEntityID.create(videoRow.video_id),
        partNumber: partRow.part_number,
        size: partRow.size,
        thirdPartyVideoPartId: partRow.third_party_video_part_id,
        integration: ThirdPartyIntegration.create(),
        url: partRow.url,
        etag: partRow.third_party_video_part_id, // etag armazenado em third_party_video_part_id
        uploadedAt: partRow.uploaded_at,
        status: PartStatusVO.create(partRow.status as PartStatusType),
      }),
    )

    const storagePath = videoRow.object_key.includes('/')
      ? `${videoRow.bucket_name}/${videoRow.object_key}`
      : `${videoRow.bucket_name}/video/${videoRow.video_id}/file/${videoRow.object_key}`

    const video = Video.createFromDatabase({
      id: UniqueEntityID.create(videoRow.video_id),
      userId: UniqueEntityID.create(videoRow.user_id),
      metadata: VideoMetadataVO.create({
        totalSize: Number(videoRow.total_size),
        durationMs: Number(videoRow.duration),
        filename: videoRow.filename || 'video',
        extension: videoRow.extension || 'mp4',
      }),
      status: VideoStatusVO.create(videoRow.status as VideoStatus),
      parts,
      integration: ThirdPartyIntegration.create(),
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO.create({
        uploadId: videoRow.third_party_video_id,
        storagePath,
        videoId: videoRow.video_id,
      }),
      failureReason: videoRow.failure_reason,
      totalSegments: videoRow.total_segments ?? 0,
      processedSegments: videoRow.processed_segments ?? 0,
    })

    return Result.ok(video)
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
          bucket_name: video.thirdPartyVideoIntegration.bucket,
          object_key: video.thirdPartyVideoIntegration.key,
          video_id: video.id.value,
          user_id: video.userId.value,
          status: video.status.value,
          total_size: video.metadata.value.totalSize,
          duration: video.metadata.durationMs,
          filename: video.metadata.value.filename,
          extension: video.metadata.value.extension,
          parts_count: video.parts.length,
          integration_name: video.integration.provider,
          third_party_video_id: video.thirdPartyVideoIntegration.uploadId,
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
        third_party_video_id: video.thirdPartyVideoIntegration.uploadId,
        video_id: video.id.value,
      }),
      this.createVideoByObjectKey({
        object_key: video.thirdPartyVideoIntegration.key,
        bucket_name: video.thirdPartyVideoIntegration.bucket,
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
    // etag é armazenado em third_party_video_part_id (identificador genérico do provedor)
    const parts: VideoPartsTable[] = video.parts.map((part) => ({
      video_id: video.id.value,
      part_number: part.partNumber,
      size: part.size,
      third_party_video_part_id: part.etag || part.thirdPartyVideoPartId, // etag → third_party_video_part_id
      status: part.status.value,
      created_at: part.createdAt,
      updated_at: part.updatedAt,
      url: part.url,
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

  async createVideoByObjectKey(
    lookup: VideoByObjectKeyTable,
  ): Promise<Result<void, DatabaseExecutionError>> {
    const result = await this.insert<VideoByObjectKeyTable>({
      table: 'video_by_object_key',
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
    // etag é armazenado em third_party_video_part_id (identificador genérico do provedor)
    const result = await this.update<VideoPartsTable>({
      table: 'video_parts',
      data: {
        updated_at: new Date(),
        size: part.size,
        third_party_video_part_id: part.etag || part.thirdPartyVideoPartId, // etag → third_party_video_part_id
        status: part.status.value,
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
        duration: video.metadata.durationMs,
        parts_count: video.parts.length,
        status: video.status.value,
        updated_at: new Date(),
        bucket_name: video.thirdPartyVideoIntegration?.bucket,
        object_key: video.thirdPartyVideoIntegration?.key,
        integration_name: video.integration?.provider,
        third_party_video_id: video.thirdPartyVideoIntegration?.uploadId,
        user_id: video.integration?.id.value,
        failure_reason: video.failureReason,
        total_segments: video.totalSegments,
        processed_segments: video.processedSegments,
      },
      where: {
        video_id: video.id.value,
      },
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async updateTotalSegments(
    videoId: string,
    totalSegments: number,
  ): Promise<Result<void, Error>> {
    this.logger.log('Updating total segments', { videoId, totalSegments })
    const result = await this.update<VideoTable>({
      table: 'video',
      data: {
        total_segments: totalSegments,
        updated_at: new Date(),
      },
      where: {
        video_id: videoId,
      },
    })
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async incrementProcessedSegments(
    videoId: string,
  ): Promise<Result<number, Error>> {
    this.logger.log('Incrementing processed segments', { videoId })

    const videoResult = await this.findById(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    const newCount = video.incrementProcessedSegments()

    const updateResult = await this.update<VideoTable>({
      table: 'video',
      data: {
        processed_segments: newCount,
        updated_at: new Date(),
      },
      where: {
        video_id: videoId,
      },
    })

    if (updateResult.isFailure) {
      return Result.fail(updateResult.error)
    }

    return Result.ok(newCount)
  }

  async transitionStatus(
    videoId: string,
    expectedStatus: VideoStatus,
    newStatus: VideoStatus,
  ): Promise<boolean> {
    this.logger.log('Transitioning video status with LWT', {
      videoId,
      expectedStatus,
      newStatus,
    })

    try {
      const query = `
        UPDATE video
        SET status = ?, updated_at = ?
        WHERE video_id = ?
        IF status = ?
      `
      const params = [newStatus, new Date(), videoId, expectedStatus]

      const result = await this.datasource.execute(query, params)

      if (result.isFailure) {
        this.logger.error('Failed to execute LWT transition', {
          videoId,
          error: result.error,
        })
        return false
      }

      // In Cassandra LWT, the result contains an [applied] column
      // that indicates whether the conditional update was applied
      const wasApplied = result.value.rows[0]?.['[applied]'] === true

      this.logger.log('LWT transition result', {
        videoId,
        wasApplied,
        expectedStatus,
        newStatus,
      })

      return wasApplied
    } catch (error) {
      this.logger.error('Error during LWT transition', {
        videoId,
        error,
      })
      return false
    }
  }
}
