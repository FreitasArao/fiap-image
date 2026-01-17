import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export type ThirdPartyVideoMetadata = {
  id: string
  bucket: string
  path: string
}

export class VideoThirdPartyIntegrationsMetadataVO extends BaseValueObject<ThirdPartyVideoMetadata> {
  static create(data: ThirdPartyVideoMetadata) {
    return new VideoThirdPartyIntegrationsMetadataVO(data)
  }
}
