import { BaseValueObject } from '@core/domain/value-object/base-value-object'

export type VideoStatusType =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'

export class VideoStatusVO extends BaseValueObject<VideoStatusType> {
  static create(value: VideoStatusType): VideoStatusVO {
    return new VideoStatusVO(value)
  }
}
