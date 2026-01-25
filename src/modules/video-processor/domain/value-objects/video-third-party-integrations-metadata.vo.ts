import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export type ThirdPartyVideoMetadata = {
  id: string
  bucket: string
  videoId: string
}

export class VideoThirdPartyIntegrationsMetadataVO extends BaseValueObject<ThirdPartyVideoMetadata> {
  static create(data: {
    id: string
    bucket: string
    path: string
    videoId: string
  }) {
    return new VideoThirdPartyIntegrationsMetadataVO(data)
  }

  get path(): string {
    return `${this.value.bucket}/video/${this.value.videoId}/${this.value.path}`
  }
}
