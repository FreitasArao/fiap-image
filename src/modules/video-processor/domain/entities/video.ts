import { AggregateRoot } from '@core/domain/aggregate'
import { Result } from '@core/domain/result'
import { InvalidStatusTransitionError } from '@core/errors/invalid-status-transition.error'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import {
  VideoStatusVO,
  type VideoStatus,
} from '@modules/video-processor/domain/value-objects/video-status.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'

export type UploadProgress = {
  totalParts: number
  uploadedParts: number
  percentage: number
  parts: Array<{
    partNumber: number
    etag: string | undefined
    uploadedAt: Date | undefined
    isUploaded: boolean
  }>
}

export class Video extends AggregateRoot<Video> {
  private _status: VideoStatusVO
  metadata: VideoMetadataVO
  private _parts: VideoPart[] = []
  integration: ThirdPartyIntegration | undefined
  thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO | undefined
  userId: UniqueEntityID
  private _failureReason: string | undefined

  private constructor({
    metadata,
    id,
    parts,
    integration,
    thirdPartyVideoIntegration,
    status,
    userId,
    failureReason,
  }: {
    metadata: VideoMetadataVO
    id?: UniqueEntityID
    parts: VideoPart[]
    integration?: ThirdPartyIntegration
    thirdPartyVideoIntegration?: VideoThirdPartyIntegrationsMetadataVO
    status: VideoStatusVO
    userId: UniqueEntityID
    failureReason?: string
  }) {
    super(id ?? UniqueEntityID.create())
    this.metadata = metadata
    this._parts = parts
    this.integration = integration
    this.thirdPartyVideoIntegration = thirdPartyVideoIntegration
    this._status = status
    this.userId = userId
    this._failureReason = failureReason
  }

  get status(): VideoStatusVO {
    return this._status
  }

  get parts(): VideoPart[] {
    return this._parts
  }

  get failureReason(): string | undefined {
    return this._failureReason
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
      status: VideoStatusVO.createInitial(),
    })
  }

  static createFromDatabase(props: {
    metadata: VideoMetadataVO
    thirdPartyVideoIntegration?: VideoThirdPartyIntegrationsMetadataVO
    parts: VideoPart[]
    integration?: ThirdPartyIntegration
    status: VideoStatusVO
    id: UniqueEntityID
    userId: UniqueEntityID
    failureReason?: string
  }): Video {
    return new Video({
      metadata: props.metadata,
      id: props.id,
      parts: props.parts,
      integration: props.integration,
      thirdPartyVideoIntegration: props.thirdPartyVideoIntegration,
      status: props.status,
      userId: props.userId,
      failureReason: props.failureReason,
    })
  }

  startUploading(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('UPLOADING')
  }

  markPartAsUploaded(partNumber: number, etag: string): this {
    const part = this._parts.find((p) => p.partNumber === partNumber)
    if (part) {
      part.markAsUploaded(etag)
    }
    return this
  }

  completeUpload(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('UPLOADED')
  }

  startProcessing(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('PROCESSING')
  }

  startSplitting(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('SPLITTING')
  }

  startPrinting(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('PRINTING')
  }

  markAsCompleted(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('COMPLETED')
  }

  markAsFailed(reason: string): Result<this, InvalidStatusTransitionError> {
    const result = this.transitionTo('FAILED')
    if (result.isSuccess) {
      this._failureReason = reason
    }
    return result
  }

  reconcileAllPartsAsUploaded(): this {
    for (const part of this._parts) {
      if (part.isPending()) {
        part.markAsUploaded('reconciled')
      }
    }
    return this
  }

  getUploadProgress(): UploadProgress {
    const uploadedParts = this._parts.filter((p) => p.isUploaded())
    const totalParts = this._parts.length

    return {
      totalParts,
      uploadedParts: uploadedParts.length,
      percentage:
        totalParts > 0
          ? Math.round((uploadedParts.length / totalParts) * 100)
          : 0,
      parts: this._parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
        uploadedAt: p.uploadedAt,
        isUploaded: p.isUploaded(),
      })),
    }
  }

  isFullyUploaded(): boolean {
    return this._parts.length > 0 && this._parts.every((p) => p.isUploaded())
  }

  isAlreadyUploaded(): boolean {
    return this._status.isUploaded() || this._status.isProcessing()
  }

  canGenerateMoreUrls(): boolean {
    return (
      this._status.value === 'CREATED' || this._status.value === 'UPLOADING'
    )
  }

  getPartsUrls(): string[] {
    return this._parts.map((part) => part.url)
  }

  getUploadedPartsEtags(): Array<{ partNumber: number; etag: string }> {
    return this._parts
      .filter((p) => p.isUploaded() && p.etag)
      .map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag as string,
      }))
  }

  addPart(part: VideoPart): void {
    this._parts.push(part)
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
        videoId: this.id.value,
      })

    return this as this & {
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    }
  }

  withIntegration(integration: ThirdPartyIntegration): this & {
    integration: ThirdPartyIntegration
  } {
    this.integration = integration
    return this as this & { integration: ThirdPartyIntegration }
  }

  private transitionTo(
    newStatus: VideoStatus,
  ): Result<this, InvalidStatusTransitionError> {
    const result = this._status.transitionTo(newStatus)
    if (result.isFailure) {
      return Result.fail(result.error)
    }
    this._status = result.value
    return Result.ok(this)
  }
}
