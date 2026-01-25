import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { CompleteMultipartHandler } from '@modules/video-processor/infra/consumers/complete-multipart-handler'
import { beforeEach, describe, expect, it } from 'bun:test'
import { context } from '@opentelemetry/api'
import { InMemoryVideoRepository } from '@modules/video-processor/__tests__/factories/in-memory-video.repository'
import { VideoFactory } from '@modules/video-processor/__tests__/factories/video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'

describe('CompleteMultipartHandler', () => {
  let handler: CompleteMultipartHandler
  let videoRepository: InMemoryVideoRepository

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    handler = new CompleteMultipartHandler(
      new PinoLoggerService(
        {
          suppressConsole: true,
        },
        context.active(),
      ),
      videoRepository,
    )
  })

  describe('Success scenarios', () => {
    it('should reconcile video when it is uploading', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: {
            name: 'test-bucket',
          },
          object: {
            key: video.thirdPartyVideoIntegration?.path || '',
          },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isSuccess).toBeTrue()
    })

    it('should update video status to UPLOADED after reconciliation', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      const updatedVideo = await videoRepository.findById(video.id.value)
      expect(updatedVideo.value?.status.value).toBe('UPLOADED')
    })

    it('should reconcile all parts as uploaded', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADING'),
      })

      await videoRepository.createVideo(video)

      await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      const updatedVideo = await videoRepository.findById(video.id.value)
      const allPartsUploaded = updatedVideo.value?.parts.every((p) =>
        p.isUploaded(),
      )
      expect(allPartsUploaded).toBeTrue()
    })
  })

  describe('Error scenarios', () => {
    it('should fail when video ID is not found in key', async () => {
      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: 'invalid-key' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toBe('Video ID not found in key')
    })

    it('should fail when key has insufficient path segments', async () => {
      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: 'bucket/video' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toBe('Video ID not found in key')
    })

    it('should fail when video is not found in repository', async () => {
      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: 'bucket/video/non-existent-id/file.mp4' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toContain(
        'Video not found for reconciliation',
      )
    })

    it('should fail when video status is already UPLOADED', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('UPLOADED'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toContain('already uploaded/processing')
    })

    it('should fail when video status is PROCESSING', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('PROCESSING'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toContain('already uploaded/processing')
    })

    it('should fail when video status is SPLITTING', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('SPLITTING'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toContain('already uploaded/processing')
    })

    it('should fail when video status is COMPLETED', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('COMPLETED'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
    })

    it('should fail when video status transition is invalid (CREATED -> UPLOADED)', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('CREATED'),
      })

      await videoRepository.createVideo(video)

      const result = await handler.handle({
        detail: {
          bucket: { name: 'test-bucket' },
          object: { key: video.thirdPartyVideoIntegration?.path || '' },
          reason: 'CompleteMultipartUpload',
        },
      })

      expect(result.isFailure).toBeTrue()
      expect(result.error?.message).toContain(
        'Failed to transition video status',
      )
    })
  })
})
