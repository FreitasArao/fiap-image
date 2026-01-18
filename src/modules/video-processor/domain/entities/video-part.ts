import { DefaultEntity } from '@core/domain/entity/default-entity'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { PartStatusVO } from '@modules/video-processor/domain/value-objects/part-status.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'

export type CreateVideoPartParams = {
  videoId: UniqueEntityID
  partNumber: number
  size: number
  thirdPartyVideoPartId?: string
  integration: ThirdPartyIntegration
  url: string
  etag?: string
  uploadedAt?: Date
  status?: PartStatusVO
}

export class VideoPart extends DefaultEntity {
  readonly videoId: UniqueEntityID
  readonly partNumber: number
  readonly size: number
  readonly thirdPartyVideoPartId: string
  readonly integration: ThirdPartyIntegration
  private _status: PartStatusVO
  readonly url: string
  private _etag: string | undefined
  private _uploadedAt: Date | undefined

  private constructor(params: CreateVideoPartParams) {
    super(UniqueEntityID.create())
    this.videoId = params.videoId
    this.partNumber = params.partNumber
    this.size = params.size
    this.thirdPartyVideoPartId = params.thirdPartyVideoPartId ?? ''
    this.integration = params.integration
    this._status = params.status ?? PartStatusVO.create('pending')
    this.url = params.url
    this._etag = params.etag
    this._uploadedAt = params.uploadedAt
  }

  get status(): PartStatusVO {
    return this._status
  }

  get etag(): string | undefined {
    return this._etag
  }

  get uploadedAt(): Date | undefined {
    return this._uploadedAt
  }

  isUploaded(): boolean {
    return this._status.value === 'uploaded' && this._etag !== undefined
  }

  isPending(): boolean {
    return this._status.value === 'pending'
  }

  markAsUploaded(etag: string): this {
    this._etag = etag
    this._uploadedAt = new Date()
    this._status = PartStatusVO.create('uploaded')
    return this
  }

  markAsFailed(): this {
    this._status = PartStatusVO.create('failed')
    return this
  }

  static create(
    props: Omit<
      CreateVideoPartParams,
      'thirdPartyVideoPartId' | 'etag' | 'uploadedAt' | 'status'
    >,
  ): VideoPart {
    return new VideoPart({
      ...props,
      thirdPartyVideoPartId: '',
    })
  }

  static createFromDatabase(props: CreateVideoPartParams): VideoPart {
    return new VideoPart(props)
  }

  static addExternalPartId(
    part: VideoPart,
    thirdPartyVideoPartId: string,
  ): VideoPart {
    return new VideoPart({
      videoId: part.videoId,
      partNumber: part.partNumber,
      size: part.size,
      thirdPartyVideoPartId,
      integration: part.integration,
      url: part.url,
      etag: part.etag,
      uploadedAt: part.uploadedAt,
      status: part.status,
    })
  }

  static assignUrl(part: VideoPart, url: string): VideoPart {
    return new VideoPart({
      videoId: part.videoId,
      partNumber: part.partNumber,
      size: part.size,
      thirdPartyVideoPartId: part.thirdPartyVideoPartId,
      integration: part.integration,
      url: url,
      etag: part.etag,
      uploadedAt: part.uploadedAt,
      status: part.status,
    })
  }
}
