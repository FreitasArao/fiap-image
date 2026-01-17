import { DefaultEntity } from '@core/domain/entity/default-entity'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { PartStatusVO } from '@modules/video-processor/domain/value-objects/part-status.vo'
import { UniqueEntityID } from '@modules/video-processor/domain/value-objects/unique-entity-id.vo'

export type CreateVideoPartParams = {
  videoId: UniqueEntityID
  partNumber: number
  size: number
  thirdPartyVideoPartId: string
  integration: ThirdPartyIntegration
  url: string
}

export class VideoPart extends DefaultEntity {
  readonly videoId: UniqueEntityID
  readonly partNumber: number
  readonly size: number
  readonly thirdPartyVideoPartId: string
  readonly integration: ThirdPartyIntegration
  readonly status: PartStatusVO = PartStatusVO.create('pending')
  readonly url: string

  private constructor({
    videoId,
    partNumber,
    size,
    thirdPartyVideoPartId,
    integration,
    url,
  }: CreateVideoPartParams) {
    super(UniqueEntityID.create())
    this.videoId = videoId
    this.partNumber = partNumber
    this.size = size
    this.thirdPartyVideoPartId = thirdPartyVideoPartId
    this.integration = integration
    this.url = url
  }

  static create(props: Omit<CreateVideoPartParams, 'thirdPartyVideoPartId'>) {
    return new VideoPart({
      ...props,
      thirdPartyVideoPartId: '',
    })
  }

  static addExternalPartId(part: VideoPart, thirdPartyVideoPartId: string) {
    return new VideoPart({
      ...part,
      thirdPartyVideoPartId,
    })
  }
}
