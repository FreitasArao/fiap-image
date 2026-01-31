import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'

import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'

export class VideoFactory {
  static create(override: Partial<Video> = {}): Video {
    const baseVideo = Video.create({
      userId: UniqueEntityID.create(),
      metadata: VideoMetadataVO.create({
        totalSize: MegabytesValueObject.create(50).value,
        durationMs: 60000, // 60 seconds in milliseconds
        filename: 'test-video',
        extension: 'mp4',
      }),
    }).withIntegration(ThirdPartyIntegration.create())

    const storagePath = `test-bucket/video/${baseVideo.id.value}/file/test-video.mp4`

    const video = baseVideo.setStorageMetadata({
      uploadId: 'upload-id-123',
      storagePath,
    })

    if (override.status) {
      return Video.createFromDatabase({
        id: video.id,
        userId: video.userId,
        metadata: video.metadata,
        status: VideoStatusVO.create(override.status.value),
        parts: override.parts || [],
        integration: override.integration || ThirdPartyIntegration.create(),
        thirdPartyVideoIntegration:
          override.thirdPartyVideoIntegration ||
          VideoThirdPartyIntegrationsMetadataVO.create({
            uploadId: 'upload-123',
            storagePath: `test-bucket/video/${video.id.value}/file/test-video.mp4`,
            videoId: video.id.value,
          }),
        failureReason: override.failureReason,
      })
    }

    return video
  }
}
