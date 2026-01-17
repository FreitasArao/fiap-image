import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export type VideoMetadata = {
  totalSize: number
  duration: number
}

export class VideoMetadataVO extends BaseValueObject<VideoMetadata> {
  static create(value: VideoMetadata): VideoMetadataVO {
    return new VideoMetadataVO(value)
  }
}
