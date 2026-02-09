import { Video } from '@modules/video-processor/domain/entities/video'
import { Result } from '@core/domain/result'
import type { VideoStatus } from '@modules/video-processor/domain/value-objects/video-status.vo'

export interface VideoRepository<T extends Video = Video> {
  createVideo(video: T): Promise<Result<void, Error>>
  createVideoParts(video: T): Promise<Result<void, Error>>
  updateVideoPart(video: T, partNumber: number): Promise<Result<void, Error>>
  updateVideo(video: T): Promise<Result<void, Error>>
  findById(videoId: string): Promise<Result<T | null, Error>>
  findByIntegrationId(integrationId: string): Promise<Result<T | null, Error>>
  findByObjectKey(objectKey: string): Promise<Result<T | null, Error>>
  updateTotalSegments(
    videoId: string,
    totalSegments: number,
  ): Promise<Result<void, Error>>
  incrementProcessedSegments(videoId: string): Promise<Result<number, Error>>

  /**
   * Atomically transition video status using conditional update (optimistic locking).
   *
   * This method implements the Idempotent Receiver pattern by only updating
   * the status if it matches the expected value. This prevents race conditions
   * when multiple processes try to update the same video simultaneously.
   *
   * @param videoId - The video ID to update
   * @param expectedStatus - The status the video must have for the update to succeed
   * @param newStatus - The new status to set
   * @returns true if the transition was applied, false if status didn't match (concurrent update)
   */
  transitionStatus(
    videoId: string,
    expectedStatus: VideoStatus,
    newStatus: VideoStatus,
  ): Promise<boolean>
}
