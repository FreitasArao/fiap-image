import { Video } from '@modules/video-processor/domain/entities/video'
import { Result } from '@core/domain/result'

/**
 * Repository interface for Video aggregate operations.
 */
export interface VideoRepository<T extends Video = Video> {
  createVideo(video: T): Promise<Result<void, Error>>
  createVideoParts(video: T): Promise<Result<void, Error>>
  updateVideoPart(video: T, partNumber: number): Promise<Result<void, Error>>
  updateVideo(video: T): Promise<Result<void, Error>>
  findById(videoId: string): Promise<Result<T | null, Error>>
}
