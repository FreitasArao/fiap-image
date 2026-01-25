import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'

export class VideoFactory {
  static create(override: Partial<Video> = {}): Video {
    const video = Video.create({
      userId: UniqueEntityID.create(),
      metadata: VideoMetadataVO.create({
        totalSize: 1024 * 1021 * 50, // 50MB
        duration: 60,
      }),
    })
      .withIntegration(ThirdPartyIntegration.create())
      .addThirdPartyVideoIntegration({
        id: 'upload-id-123',
        bucket: 'test-bucket',
        path: 'test-path/video.mp4',
      })

    if (override.status) {
      // Force status change via reflection or recreating entity if possible
      // Since we don't have public setter, we might need to rely on transitions or createFromDatabase
      // createFromDatabase is better for factories

      return Video.createFromDatabase({
        id: video.id,
        userId: video.userId,
        metadata: video.metadata,
        status: VideoStatusVO.create(override.status.value),
        parts: (override.parts as VideoPart[]) || [],
        integration:
          (override.integration as ThirdPartyIntegration) ||
          ThirdPartyIntegration.create(),
        thirdPartyVideoIntegration:
          (override.thirdPartyVideoIntegration as VideoThirdPartyIntegrationsMetadataVO) ||
          VideoThirdPartyIntegrationsMetadataVO.create({
            id: 'upload-123',
            bucket: 'test-bucket',
            path: 'test-path',
            videoId: video.id.value,
          }),
        failureReason: override.failureReason as string | undefined,
      })
    }

    return video
  }
}
