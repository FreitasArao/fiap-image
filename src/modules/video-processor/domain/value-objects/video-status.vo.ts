import { BaseValueObject } from '@core/domain/value-object/base-value-object'
import { Result } from '@core/domain/result'
import { InvalidStatusTransitionError } from '@core/errors/invalid-status-transition.error'

/**
 * Valid video processing statuses following the ADR 007 flow.
 */
export type VideoStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'SPLITTING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'

/**
 * State machine for video processing status.
 * Enforces valid transitions based on the defined flow.
 *
 * Flow: CREATED → UPLOADING → UPLOADED → PROCESSING → SPLITTING → PRINTING → COMPLETED
 *       Any state can transition to FAILED
 */
export class VideoStatusVO extends BaseValueObject<VideoStatus> {
  /**
   * Defines allowed transitions from each status.
   * Any status can transition to FAILED.
   */
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

  /**
   * Creates a new VideoStatusVO instance.
   */
  static create(value: VideoStatus): VideoStatusVO {
    return new VideoStatusVO(value)
  }

  /**
   * Creates the initial status for a new video.
   */
  static createInitial(): VideoStatusVO {
    return VideoStatusVO.create('CREATED')
  }

  /**
   * Checks if a transition to the given status is allowed.
   * @param newStatus - The target status to transition to
   */
  canTransitionTo(newStatus: VideoStatus): boolean {
    const allowedTransitions = VideoStatusVO.TRANSITIONS[this.value]
    return allowedTransitions.includes(newStatus)
  }

  /**
   * Attempts to transition to a new status.
   * Returns a Result with the new status or an InvalidStatusTransitionError.
   *
   * @param newStatus - The target status to transition to
   */
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

  /**
   * Checks if the video is in a terminal state (cannot transition further).
   */
  isTerminal(): boolean {
    return this.value === 'COMPLETED' || this.value === 'FAILED'
  }

  /**
   * Checks if the video is currently being uploaded.
   */
  isUploading(): boolean {
    return this.value === 'UPLOADING'
  }

  /**
   * Checks if the video upload is complete.
   */
  isUploaded(): boolean {
    return this.value === 'UPLOADED'
  }

  /**
   * Checks if the video is being processed (any processing state).
   */
  isProcessing(): boolean {
    return ['PROCESSING', 'SPLITTING', 'PRINTING'].includes(this.value)
  }

  /**
   * Checks if the video processing completed successfully.
   */
  isCompleted(): boolean {
    return this.value === 'COMPLETED'
  }

  /**
   * Checks if the video processing failed.
   */
  isFailed(): boolean {
    return this.value === 'FAILED'
  }

  /**
   * Returns the display name for the current status.
   */
  toString(): string {
    return this.value
  }
}
