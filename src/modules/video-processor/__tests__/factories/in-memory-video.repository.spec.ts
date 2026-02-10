import { describe, it, expect, beforeEach } from 'bun:test'
import { InMemoryVideoRepository } from './in-memory-video.repository'
import { VideoFactory } from './video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'

describe('InMemoryVideoRepository', () => {
  let repository: InMemoryVideoRepository

  beforeEach(() => {
    repository = new InMemoryVideoRepository()
  })

  describe('createVideo() / findById()', () => {
    it('should store and retrieve a video by id', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      const result = await repository.findById(video.id.value)
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBe(video)
    })

    it('should return null for non-existent video', async () => {
      const result = await repository.findById('non-existent')
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBeNull()
    })
  })

  describe('createVideoParts()', () => {
    it('should update video in place when found', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 1,
          size: 1024,
          integration: ThirdPartyIntegration.create(),
          url: 'http://url',
        }),
      )

      const result = await repository.createVideoParts(video)
      expect(result.isSuccess).toBe(true)

      const found = await repository.findById(video.id.value)
      expect(found.value!.parts.length).toBe(1)
    })

    it('should be no-op when video is not found', async () => {
      const video = VideoFactory.create()
      const result = await repository.createVideoParts(video)
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('updateVideoPart()', () => {
    it('should update video when found', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)
      const result = await repository.updateVideoPart(video, 1)
      expect(result.isSuccess).toBe(true)
    })

    it('should be no-op when video is not found', async () => {
      const video = VideoFactory.create()
      const result = await repository.updateVideoPart(video, 1)
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('findByIntegrationId()', () => {
    it('should find video by integration uploadId', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      const result = await repository.findByIntegrationId(
        video.thirdPartyVideoIntegration!.uploadId,
      )
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBe(video)
    })

    it('should return null when no video matches', async () => {
      const result = await repository.findByIntegrationId('unknown')
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBeNull()
    })
  })

  describe('findByObjectKey()', () => {
    it('should find video by object key', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      const objectKey = video.thirdPartyVideoIntegration!.key
      const result = await repository.findByObjectKey(objectKey)
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBe(video)
    })

    it('should return null when no video matches', async () => {
      const result = await repository.findByObjectKey('unknown-key')
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBeNull()
    })
  })

  describe('updateVideo()', () => {
    it('should replace the video when found', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)
      const result = await repository.updateVideo(video)
      expect(result.isSuccess).toBe(true)
    })

    it('should be no-op when video is not found', async () => {
      const video = VideoFactory.create()
      const result = await repository.updateVideo(video)
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('incrementProcessedSegments()', () => {
    it('should increment processed segments for existing video', async () => {
      const video = VideoFactory.create()
      video.setTotalSegments(3)
      await repository.createVideo(video)

      const result = await repository.incrementProcessedSegments(video.id.value)
      expect(result.isSuccess).toBe(true)
      expect(result.value).toBe(1)
    })

    it('should return failure for non-existent video', async () => {
      const result = await repository.incrementProcessedSegments('not-found')
      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('Video not found')
    })
  })

  describe('updateTotalSegments()', () => {
    it('should set total segments for existing video', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      const result = await repository.updateTotalSegments(video.id.value, 10)
      expect(result.isSuccess).toBe(true)
      expect(video.totalSegments).toBe(10)
    })

    it('should return failure for non-existent video', async () => {
      const result = await repository.updateTotalSegments('not-found', 5)
      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('Video not found')
    })
  })

  describe('transitionStatus()', () => {
    it('should return true when status matches and transition succeeds', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })
      await repository.createVideo(video)

      const result = await repository.transitionStatus(
        video.id.value,
        'UPLOADING',
        'UPLOADED',
      )
      expect(result).toBe(true)
    })

    it('should return false when video is not found', async () => {
      const result = await repository.transitionStatus(
        'non-existent',
        'UPLOADING',
        'UPLOADED',
      )
      expect(result).toBe(false)
    })

    it('should return false when current status does not match expected', async () => {
      const video = VideoFactory.create()
      await repository.createVideo(video)

      const result = await repository.transitionStatus(
        video.id.value,
        'UPLOADING', // expected UPLOADING but video is CREATED
        'UPLOADED',
      )
      expect(result).toBe(false)
    })
  })
})
