import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export type VideoMetadata = {
  totalSize: number
  duration: number
  filename: string
  extension: string
}

export class VideoMetadataVO extends BaseValueObject<VideoMetadata> {
  static create(value: VideoMetadata): VideoMetadataVO {
    return new VideoMetadataVO(value)
  }

  get filename(): string {
    return this.value.filename
  }

  get extension(): string {
    return this.value.extension
  }

  get fullFilename(): string {
    return `${this.value.filename}.${this.value.extension}`
  }
}
