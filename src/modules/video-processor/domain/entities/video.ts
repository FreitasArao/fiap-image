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
  private _parts: VideoPart[] = []
  integration: ThirdPartyIntegration | undefined
  thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO | undefined
  userId: UniqueEntityID

  private constructor({
    metadata,
    id,
    parts,
    integration,
    thirdPartyVideoIntegration,
    status,
    userId,
  }: {
    metadata: VideoMetadataVO
    id?: UniqueEntityID
    parts: VideoPart[]
    integration: ThirdPartyIntegration
    thirdPartyVideoIntegration?: VideoThirdPartyIntegrationsMetadataVO
    status: VideoStatusVO
    userId: UniqueEntityID
  }) {
    super(id ?? UniqueEntityID.create())
    this.metadata = metadata
    this._parts = parts
    this.integration = integration
    this.thirdPartyVideoIntegration = thirdPartyVideoIntegration
    this.status = status
    this.userId = userId
  }

  get parts(): VideoPart[] {
    return this._parts
  }

  addPart(part: VideoPart): void {
    this._parts.push(part)
  }

  static create(props: {
    metadata: VideoMetadataVO
    userId: UniqueEntityID
  }): Video {
    return new Video({
      metadata: props.metadata,
      id: UniqueEntityID.create(),
      parts: [],
      integration: ThirdPartyIntegration.create(),
      userId: props.userId,
      status: VideoStatusVO.create('pending'),
    })
  }

  static createFromDatabase(props: {
    metadata: VideoMetadataVO
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    parts: VideoPart[]
    integration: ThirdPartyIntegration
    status: VideoStatusVO
    id: UniqueEntityID
    userId: UniqueEntityID
  }): Video {
    return new Video({
      metadata: props.metadata,
      id: props.id,
      parts: props.parts,
      integration: props.integration,
      thirdPartyVideoIntegration: props.thirdPartyVideoIntegration,
      status: props.status,
      userId: props.userId,
    })
  }

  addThirdPartyVideoIntegration(thirdPartyVideoIntegration: {
    bucket: string
    path: string
    id: string
  }): this & {
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
  } {
    this.thirdPartyVideoIntegration =
      VideoThirdPartyIntegrationsMetadataVO.create({
        bucket: thirdPartyVideoIntegration.bucket,
        path: thirdPartyVideoIntegration.path,
        id: thirdPartyVideoIntegration.id,
      })

    return this as this & {
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    }
  }

  getPartsUrls(): string[] {
    return this.parts.map((part) => part.url)
  }

  withIntegration(integration: ThirdPartyIntegration): this & {
    integration: ThirdPartyIntegration
  } {
    this.integration = integration
    return this as this & { integration: ThirdPartyIntegration }
  }
}
