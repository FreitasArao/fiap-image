import { BaseValueObject } from '@core/domain/value-objects/base-value-object'

export type VideoStorageMetadata = {
  uploadId: string
  storagePath: string
  videoId: string
}

export class VideoThirdPartyIntegrationsMetadataVO extends BaseValueObject<VideoStorageMetadata> {
  private constructor(data: VideoStorageMetadata) {
    super(data)
  }

  static create(data: {
    uploadId: string
    storagePath: string
    videoId: string
  }): VideoThirdPartyIntegrationsMetadataVO {
    return new VideoThirdPartyIntegrationsMetadataVO({
      uploadId: data.uploadId,
      storagePath: data.storagePath,
      videoId: data.videoId,
    })
  }

  get uploadId(): string {
    return this.value.uploadId
  }

  get path(): string {
    return this.value.storagePath
  }

  get key(): string {
    const parts = this.value.storagePath.split('/')
    return parts.slice(1).join('/')
  }

  get bucket(): string {
    return this.value.storagePath.split('/')[0]
  }

  get videoId(): string {
    return this.value.videoId
  }
}
