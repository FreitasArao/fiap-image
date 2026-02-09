import { describe, it, expect, beforeEach } from 'bun:test'
import { InMemoryVideoRepository } from './factories/in-memory-video.repository'
import { VideoFactory } from './factories/video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { Video } from '@modules/video-processor/domain/entities/video'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'

describe('InMemoryVideoRepository', () => {
  let repository: InMemoryVideoRepository

  beforeEach(() => {
    repository = new InMemoryVideoRepository()
  })

  describe('findByObjectKey', () => {
    it('should find video by matching objectKey', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const objectKey = video.thirdPartyVideoIntegration?.key || ''
      const result = await repository.findByObjectKey(objectKey)

      expect(result.isSuccess).toBeTrue()
      expect(result.value).not.toBeNull()
      expect(result.value?.id.value).toBe(video.id.value)
    })

    it('should return null when objectKey does not match any video', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const result = await repository.findByObjectKey(
        'video/non-existent/file/video.mp4',
      )

      expect(result.isSuccess).toBeTrue()
      expect(result.value).toBeNull()
    })

    it('should return null when repository is empty', async () => {
      const result = await repository.findByObjectKey(
        'video/any-id/file/video.mp4',
      )

      expect(result.isSuccess).toBeTrue()
      expect(result.value).toBeNull()
    })

    it('should find the correct video among multiple videos', async () => {
      const video1 = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      const video2 = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video1)
      await repository.createVideo(video2)

      const objectKey2 = video2.thirdPartyVideoIntegration?.key || ''
      const result = await repository.findByObjectKey(objectKey2)

      expect(result.isSuccess).toBeTrue()
      expect(result.value?.id.value).toBe(video2.id.value)
      expect(result.value?.id.value).not.toBe(video1.id.value)
    })

    it('should find video when key includes nested path segments', async () => {
      const realDbId = UniqueEntityID.create()
      const objectKey = `video/${realDbId.value}/file/my-video_segments_segment_000.mp4`
      const storagePath = `test-bucket/${objectKey}`

      const video = Video.createFromDatabase({
        id: realDbId,
        userId: UniqueEntityID.create(),
        metadata: VideoMetadataVO.create({
          totalSize: MegabytesValueObject.create(50).value,
          durationMs: 60000,
          filename: 'my-video',
          extension: 'mp4',
        }),
        status: VideoStatusVO.create('UPLOADING'),
        parts: [],
        integration: ThirdPartyIntegration.create(),
        thirdPartyVideoIntegration:
          VideoThirdPartyIntegrationsMetadataVO.create({
            uploadId: 'upload-123',
            storagePath,
            videoId: realDbId.value,
          }),
      })

      await repository.createVideo(video)

      const result = await repository.findByObjectKey(objectKey)

      expect(result.isSuccess).toBeTrue()
      expect(result.value?.id.value).toBe(realDbId.value)
    })
  })

  describe('findById', () => {
    it('should find video by its ID', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const result = await repository.findById(video.id.value)

      expect(result.isSuccess).toBeTrue()
      expect(result.value?.id.value).toBe(video.id.value)
    })

    it('should return null when video ID does not exist', async () => {
      const result = await repository.findById('non-existent-id')

      expect(result.isSuccess).toBeTrue()
      expect(result.value).toBeNull()
    })
  })

  describe('transitionStatus', () => {
    it('should transition status when expected status matches', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const transitioned = await repository.transitionStatus(
        video.id.value,
        'UPLOADING',
        'UPLOADED',
      )

      expect(transitioned).toBeTrue()

      const updatedVideo = await repository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })

    it('should not transition when expected status does not match', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('CREATED'),
      })
      await repository.createVideo(video)

      const transitioned = await repository.transitionStatus(
        video.id.value,
        'UPLOADING',
        'UPLOADED',
      )

      expect(transitioned).toBeFalse()

      // Status should remain unchanged
      const unchangedVideo = await repository.findById(video.id.value)
      expect(unchangedVideo.value?.status.value).toBe('CREATED')
    })

    it('should return false when video does not exist', async () => {
      const transitioned = await repository.transitionStatus(
        'non-existent-id',
        'UPLOADING',
        'UPLOADED',
      )

      expect(transitioned).toBeFalse()
    })
  })

  describe('findByIntegrationId', () => {
    it('should find video by integration uploadId', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const uploadId = video.thirdPartyVideoIntegration?.uploadId || ''
      const result = await repository.findByIntegrationId(uploadId)

      expect(result.isSuccess).toBeTrue()
      expect(result.value?.id.value).toBe(video.id.value)
    })

    it('should return null when integration ID does not exist', async () => {
      const result = await repository.findByIntegrationId('non-existent')

      expect(result.isSuccess).toBeTrue()
      expect(result.value).toBeNull()
    })
  })
})
