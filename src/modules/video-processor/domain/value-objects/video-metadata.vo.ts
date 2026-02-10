import { BaseValueObject } from '@core/domain/value-objects/base-value-object'
import { DurationVO } from './duration.vo'

export type VideoMetadataInput = {
  totalSize: number
  /** Duration in milliseconds */
  durationMs: number
  filename: string
  extension: string
}

export type VideoMetadata = {
  totalSize: number
  duration: DurationVO
  filename: string
  extension: string
}

export class VideoMetadataVO extends BaseValueObject<VideoMetadata> {
  /**
   * Creates a VideoMetadataVO from input with duration in milliseconds.
   * @param input Video metadata with durationMs in milliseconds
   */
  static create(input: VideoMetadataInput): VideoMetadataVO {
    return new VideoMetadataVO({
      totalSize: input.totalSize,
      duration: DurationVO.fromMilliseconds(input.durationMs),
      filename: input.filename,
      extension: input.extension,
    })
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

  /**
   * Duration in milliseconds (for persistence/events).
   */
  get durationMs(): number {
    return this.value.duration.milliseconds
  }

  /**
   * Duration in seconds (for FFmpeg and display).
   */
  get durationSeconds(): number {
    return this.value.duration.seconds
  }
}
