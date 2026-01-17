import { Video } from '@modules/video-processor/domain/entities/video'
import { Result } from '@core/domain/result'

export interface VideoRepository<T extends Video = Video> {
  createVideo(video: T): Promise<Result<void, Error>>
  createVideoPart(video: T): Promise<Result<void, Error>>
  updateVideoPart(video: T, partNumber: number): Promise<Result<void, Error>>
  updateVideo(video: T): Promise<Result<void, Error>>
}
