import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { describe, expect, it } from 'bun:test'

describe('VideoThirdPartyIntegrationsMetadataVO', () => {
  it('should create with uploadId, storagePath and videoId', () => {
    const vo = VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-123',
      storagePath: 'bucket/video/video-id-123/file/video.mp4',
      videoId: 'video-id-123',
    })

    expect(vo.uploadId).toBe('upload-123')
    expect(vo.path).toBe('bucket/video/video-id-123/file/video.mp4')
    expect(vo.videoId).toBe('video-id-123')
  })

  it('should expose path via getter', () => {
    const vo = VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-456',
      storagePath: 'test-bucket/video/abc/file/video.mp4',
      videoId: 'abc',
    })

    expect(vo.path).toBe('test-bucket/video/abc/file/video.mp4')
  })

  it('should expose value object data', () => {
    const vo = VideoThirdPartyIntegrationsMetadataVO.create({
      uploadId: 'upload-789',
      storagePath: 'bucket/video/xyz/file/video.mp4',
      videoId: 'xyz',
    })

    expect(vo.value.uploadId).toBe('upload-789')
    expect(vo.value.storagePath).toBe('bucket/video/xyz/file/video.mp4')
    expect(vo.value.videoId).toBe('xyz')
  })
})
