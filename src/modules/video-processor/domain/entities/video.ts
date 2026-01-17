import { AggregateRoot } from '@core/domain/aggregate'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { UniqueEntityID } from '@modules/video-processor/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'

export class Video extends AggregateRoot<Video> {
  status: VideoStatusVO = VideoStatusVO.create('pending')
  metadata: VideoMetadataVO
  parts: VideoPart[] = []
  integration: ThirdPartyIntegration | undefined
  thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO | undefined

  private constructor({ metadata }: { metadata: VideoMetadataVO }) {
    super(UniqueEntityID.create())
    this.metadata = metadata
  }

  static create(props: { metadata: VideoMetadataVO }): Video {
    return new Video(props)
  }

  withIntegration(integration: ThirdPartyIntegration): this & {
    integration: ThirdPartyIntegration
  } {
    this.integration = integration
    return this as this & { integration: ThirdPartyIntegration }
  }

  attachThirdPartyVideoIntegration(
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO,
  ): this & {
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
  } {
    if (!this.integration) {
      throw new Error(
        'Cannot attach third party video integration without integration',
      )
    }

    this.thirdPartyVideoIntegration = thirdPartyVideoIntegration
    return this as this & {
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    }
  }
}
