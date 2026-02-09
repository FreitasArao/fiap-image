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
import { VideoUploadedEvent } from '@modules/video-processor/events/video-uploaded-event'
import { VideoPrintingEvent } from '@modules/video-processor/events/video-printing-event'
import { VideoSplittingEvent } from '@modules/video-processor/events/video-splitting-event'

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
  private _totalSegments: number
  private _processedSegments: number

  private constructor({
    metadata,
    id,
    parts,
    integration,
    thirdPartyVideoIntegration,
    status,
    userId,
    failureReason,
    totalSegments,
    processedSegments,
  }: {
    metadata: VideoMetadataVO
    id?: UniqueEntityID
    parts: VideoPart[]
    integration?: ThirdPartyIntegration
    thirdPartyVideoIntegration?: VideoThirdPartyIntegrationsMetadataVO
    status: VideoStatusVO
    userId: UniqueEntityID
    failureReason?: string
    totalSegments?: number
    processedSegments?: number
  }) {
    super(id ?? UniqueEntityID.create())
    this.metadata = metadata
    this._parts = parts
    this.integration = integration
    this.thirdPartyVideoIntegration = thirdPartyVideoIntegration
    this._status = status
    this.userId = userId
    this._failureReason = failureReason
    this._totalSegments = totalSegments ?? 0
    this._processedSegments = processedSegments ?? 0
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

  get totalSegments(): number {
    return this._totalSegments
  }

  get processedSegments(): number {
    return this._processedSegments
  }

  setTotalSegments(total: number): this {
    this._totalSegments = total
    return this
  }

  incrementProcessedSegments(): number {
    this._processedSegments += 1
    return this._processedSegments
  }

  isFullyProcessed(): boolean {
    return (
      this._totalSegments > 0 && this._processedSegments >= this._totalSegments
    )
  }

  getProcessingProgress(): {
    total: number
    processed: number
    percentage: number
  } {
    return {
      total: this._totalSegments,
      processed: this._processedSegments,
      percentage:
        this._totalSegments > 0
          ? Math.round((this._processedSegments / this._totalSegments) * 100)
          : 0,
    }
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
    totalSegments?: number
    processedSegments?: number
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
      totalSegments: props.totalSegments,
      processedSegments: props.processedSegments,
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
    const result = this.transitionTo('UPLOADED')
    if (result.isFailure) return Result.fail(result.error)

    this.addDomainEvent(new VideoUploadedEvent(this))
    return Result.ok(this)
  }

  startProcessing(): Result<this, InvalidStatusTransitionError> {
    return this.transitionTo('PROCESSING')
  }

  startSplitting(): Result<this, InvalidStatusTransitionError> {
    const transitionResult = this.transitionTo('SPLITTING')
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.error)
    }

    this.addDomainEvent(new VideoSplittingEvent(this))

    return transitionResult
  }

  isUploading(): boolean {
    return this._status.value === 'UPLOADING'
  }

  startPrinting(): Result<this, InvalidStatusTransitionError> {
    const transitionResult = this.transitionTo('PRINTING')
    if (transitionResult.isFailure) {
      return Result.fail(transitionResult.error)
    }

    this.addDomainEvent(new VideoPrintingEvent(this))

    return Result.ok(this)
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

  startUploadingIfNeeded(): Result<this, InvalidStatusTransitionError> {
    if (this._status.value === 'CREATED') {
      return this.startUploading()
    }
    return Result.ok(this)
  }

  getPendingPartsBatch(batchSize: number): {
    batch: VideoPart[]
    nextPartNumber: number | null
  } {
    const pendingParts = [...this._parts]
      .filter((part) => !part.url || part.url === '')
      .sort((a, b) => a.partNumber - b.partNumber)

    const batch = pendingParts.slice(0, batchSize)
    const hasMoreParts = batch.length < pendingParts.length
    const nextPartNumber = hasMoreParts
      ? pendingParts[batch.length].partNumber
      : null

    return { batch, nextPartNumber }
  }

  assignUrlToPart(partNumber: number, url: string): Result<this, Error> {
    const index = this._parts.findIndex((p) => p.partNumber === partNumber)
    if (index === -1) {
      return Result.fail(new Error(`Part ${partNumber} not found in video`))
    }

    this._parts[index] = VideoPart.assignUrl(this._parts[index], url)
    return Result.ok(this)
  }

  setStorageMetadata(metadata: {
    uploadId: string
    storagePath: string
  }): this & {
    thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
  } {
    this.thirdPartyVideoIntegration =
      VideoThirdPartyIntegrationsMetadataVO.create({
        uploadId: metadata.uploadId,
        storagePath: metadata.storagePath,
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
