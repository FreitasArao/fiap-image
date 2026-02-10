import { describe, it, expect } from 'bun:test'
import { VideoFactory } from './video.factory'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'

describe('VideoFactory', () => {
  it('should create a default video with storage metadata', () => {
    const video = VideoFactory.create()

    expect(video).toBeDefined()
    expect(video.metadata.filename).toBe('test-video')
    expect(video.metadata.extension).toBe('mp4')
    expect(video.thirdPartyVideoIntegration).toBeDefined()
    expect(video.thirdPartyVideoIntegration?.uploadId).toBe('upload-id-123')
  })

  it('should create a video with overridden status (exercises createFromDatabase path)', () => {
    const video = VideoFactory.create({
      status: VideoStatusVO.create('UPLOADING'),
    })

    expect(video.status.value).toBe('UPLOADING')
  })

  it('should create a video with overridden status and parts', () => {
    const part = VideoPart.create({
      videoId: UniqueEntityID.create(),
      partNumber: 1,
      size: 512,
      integration: ThirdPartyIntegration.create(),
      url: 'http://part-url',
    })

    const video = VideoFactory.create({
      status: VideoStatusVO.create('UPLOADING'),
      parts: [part],
    })

    expect(video.parts.length).toBe(1)
    expect(video.parts[0].partNumber).toBe(1)
  })
})
