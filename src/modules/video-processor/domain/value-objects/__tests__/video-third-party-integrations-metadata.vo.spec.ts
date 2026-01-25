import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { describe, expect, it } from 'bun:test'

describe('VideoThirdPartyIntegrationsMetadataVO', () => {
  it('When create a new VideoThirdPartyIntegrationsMetadataVO create a path wtih video prefix', () => {
    const videoThirdPartyIntegrationsMetadataVO =
      VideoThirdPartyIntegrationsMetadataVO.create({
        videoId: 'video-id-123',
        bucket: 'test-bucket',
        id: 'test-id',
        path: 'test-path',
      })

    expect(videoThirdPartyIntegrationsMetadataVO.path).toBe(
      'test-bucket/video/video-id-123/test-path',
    )
  })
})
