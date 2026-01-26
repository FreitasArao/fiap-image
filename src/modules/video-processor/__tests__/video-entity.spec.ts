import { describe, it, expect } from 'bun:test'
import { VideoFactory } from './factories/video.factory'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'

describe('Video Entity', () => {
  it('should start with CREATED status', () => {
    const video = VideoFactory.create()
    expect(video.status.value).toBe('CREATED')
  })

  it('should add parts correctly', () => {
    const video = VideoFactory.create()
    const part = VideoPart.create({
      videoId: video.id,
      partNumber: 1,
      size: 1024,
      integration: ThirdPartyIntegration.create(),
      url: 'http://test.com/part1',
    })

    video.addPart(part)
    expect(video.parts.length).toBe(1)
    expect(video.parts[0].partNumber).toBe(1)
  })

  it('should transition to UPLOADING via startUploading', () => {
    const video = VideoFactory.create()
    const result = video.startUploading()
    expect(result.isSuccess).toBe(true)
    expect(video.status.value).toBe('UPLOADING')
  })

  it('should mark part as uploaded', () => {
    const video = VideoFactory.create()
    const part = VideoPart.create({
      videoId: video.id,
      partNumber: 1,
      size: 1024,
      integration: ThirdPartyIntegration.create(),
      url: 'http://test.com/part1',
    })
    video.addPart(part)
    video.startUploading()

    video.markPartAsUploaded(1, 'etag-123')

    expect(video.parts[0].isUploaded()).toBe(true)
    expect(video.parts[0].etag).toBe('etag-123')
  })

  it('should calculate upload progress correctly', () => {
    const video = VideoFactory.create()
    video.startUploading()

    video.addPart(
      VideoPart.create({
        videoId: video.id,
        partNumber: 1,
        size: 100,
        integration: ThirdPartyIntegration.create(),
        url: 'url1',
      }),
    )
    video.addPart(
      VideoPart.create({
        videoId: video.id,
        partNumber: 2,
        size: 100,
        integration: ThirdPartyIntegration.create(),
        url: 'url2',
      }),
    )

    expect(video.getUploadProgress().percentage).toBe(0)

    video.markPartAsUploaded(1, 'etag1')
    expect(video.getUploadProgress().percentage).toBe(50)
    expect(video.isFullyUploaded()).toBe(false)

    video.markPartAsUploaded(2, 'etag2')
    expect(video.getUploadProgress().percentage).toBe(100)
    expect(video.isFullyUploaded()).toBe(true)
  })

  it('should transition from UPLOADING to UPLOADED', () => {
    const video = VideoFactory.create()
    video.startUploading()
    const result = video.completeUpload()
    expect(result.isSuccess).toBe(true)
    expect(video.status.value).toBe('UPLOADED')
  })

  describe('startUploadingIfNeeded', () => {
    it('should transition to UPLOADING when status is CREATED', () => {
      const video = VideoFactory.create()
      expect(video.status.value).toBe('CREATED')

      const result = video.startUploadingIfNeeded()

      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADING')
    })

    it('should do nothing when status is already UPLOADING', () => {
      const video = VideoFactory.create()
      video.startUploading()
      expect(video.status.value).toBe('UPLOADING')

      const result = video.startUploadingIfNeeded()

      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADING')
    })

    it('should do nothing when status is beyond UPLOADING', () => {
      const video = VideoFactory.create({ status: VideoStatusVO.create('UPLOADED') })

      const result = video.startUploadingIfNeeded()

      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADED')
    })
  })

  describe('getPendingPartsBatch', () => {
    it('should return empty batch when no parts exist', () => {
      const video = VideoFactory.create()

      const result = video.getPendingPartsBatch(10)

      expect(result.batch).toEqual([])
      expect(result.nextPartNumber).toBeNull()
    })

    it('should return only parts without URLs', () => {
      const video = VideoFactory.create()
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 1,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: 'http://existing.com/1',
        }),
      )
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 2,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 3,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )

      const result = video.getPendingPartsBatch(10)

      expect(result.batch.length).toBe(2)
      expect(result.batch[0].partNumber).toBe(2)
      expect(result.batch[1].partNumber).toBe(3)
      expect(result.nextPartNumber).toBeNull()
    })

    it('should respect batch size limit', () => {
      const video = VideoFactory.create()
      Array.from({ length: 10 }).forEach((_, i) => {
        video.addPart(
          VideoPart.create({
            videoId: video.id,
            partNumber: i + 1,
            size: 100,
            integration: ThirdPartyIntegration.create(),
            url: '',
          }),
        )
      })

      const result = video.getPendingPartsBatch(3)

      expect(result.batch.length).toBe(3)
      expect(result.batch[0].partNumber).toBe(1)
      expect(result.batch[2].partNumber).toBe(3)
      expect(result.nextPartNumber).toBe(4)
    })

    it('should sort parts by partNumber', () => {
      const video = VideoFactory.create()
      // Add parts out of order
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 5,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 2,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 8,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )

      const result = video.getPendingPartsBatch(10)

      expect(result.batch[0].partNumber).toBe(2)
      expect(result.batch[1].partNumber).toBe(5)
      expect(result.batch[2].partNumber).toBe(8)
    })
  })

  describe('assignUrlToPart', () => {
    it('should assign URL to existing part', () => {
      const video = VideoFactory.create()
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 1,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )

      const result = video.assignUrlToPart(1, 'http://new-url.com/part1')

      expect(result.isSuccess).toBe(true)
      expect(video.parts[0].url).toBe('http://new-url.com/part1')
    })

    it('should fail when part does not exist', () => {
      const video = VideoFactory.create()

      const result = video.assignUrlToPart(999, 'http://new-url.com/part999')

      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('999')
    })

    it('should preserve other part properties when assigning URL', () => {
      const video = VideoFactory.create()
      const originalPart = VideoPart.create({
        videoId: video.id,
        partNumber: 1,
        size: 1024,
        integration: ThirdPartyIntegration.create(),
        url: '',
      })
      video.addPart(originalPart)

      video.assignUrlToPart(1, 'http://new-url.com/part1')

      expect(video.parts[0].size).toBe(1024)
      expect(video.parts[0].partNumber).toBe(1)
    })
  })
})
