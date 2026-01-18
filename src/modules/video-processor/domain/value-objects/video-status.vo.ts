import { BaseValueObject } from '@core/domain/value-object/base-value-object'
import { Result } from '@core/domain/result'
import { InvalidStatusTransitionError } from '@core/errors/invalid-status-transition.error'

export type VideoStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'SPLITTING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'

export class VideoStatusVO extends BaseValueObject<VideoStatus> {
  private static readonly TRANSITIONS: Record<VideoStatus, VideoStatus[]> = {
    CREATED: ['UPLOADING', 'FAILED'],
    UPLOADING: ['UPLOADED', 'FAILED'],
    UPLOADED: ['PROCESSING', 'FAILED'],
    PROCESSING: ['SPLITTING', 'FAILED'],
    SPLITTING: ['PRINTING', 'FAILED'],
    PRINTING: ['COMPLETED', 'FAILED'],
    COMPLETED: [],
    FAILED: [],
  }

  private constructor(value: VideoStatus) {
    super(value)
  }

  static create(value: VideoStatus): VideoStatusVO {
    return new VideoStatusVO(value)
  }

  static createInitial(): VideoStatusVO {
    return VideoStatusVO.create('CREATED')
  }

  canTransitionTo(newStatus: VideoStatus): boolean {
    const allowedTransitions = VideoStatusVO.TRANSITIONS[this.value]
    return allowedTransitions.includes(newStatus)
  }

  transitionTo(
    newStatus: VideoStatus,
  ): Result<VideoStatusVO, InvalidStatusTransitionError> {
    if (!this.canTransitionTo(newStatus)) {
      return Result.fail(
        new InvalidStatusTransitionError(this.value, newStatus),
      )
    }
    return Result.ok(VideoStatusVO.create(newStatus))
  }

  isTerminal(): boolean {
    return this.value === 'COMPLETED' || this.value === 'FAILED'
  }

  isUploading(): boolean {
    return this.value === 'UPLOADING'
  }

  isUploaded(): boolean {
    return this.value === 'UPLOADED'
  }

  isProcessing(): boolean {
    return ['PROCESSING', 'SPLITTING', 'PRINTING'].includes(this.value)
  }

  isCompleted(): boolean {
    return this.value === 'COMPLETED'
  }

  isFailed(): boolean {
    return this.value === 'FAILED'
  }

  toString(): string {
    return this.value
  }
}
