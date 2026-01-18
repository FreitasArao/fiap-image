import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { Video } from '@modules/video-processor/domain/entities/video'
import { Result } from '@core/domain/result'

export class InMemoryVideoRepository implements VideoRepository {
  public items: Video[] = []

  async findById(videoId: string): Promise<Result<Video | null, Error>> {
    const video = this.items.find((v) => v.id.value === videoId)
    return Result.ok(video || null)
  }

  async createVideo(video: Video): Promise<Result<void, Error>> {
    this.items.push(video)
    return Result.ok(undefined)
  }

  async createVideoParts(video: Video): Promise<Result<void, Error>> {
    // In memory, we assume parts are already in the video entity
    // But if we want to simulate persistence, we might update the stored item
    const index = this.items.findIndex((v) => v.id.value === video.id.value)
    if (index !== -1) {
      this.items[index] = video
    }
    return Result.ok(undefined)
  }

  async updateVideoPart(
    video: Video,
    _partNumber: number,
  ): Promise<Result<void, Error>> {
    const index = this.items.findIndex((v) => v.id.value === video.id.value)
    if (index !== -1) {
      this.items[index] = video
    }
    return Result.ok(undefined)
  }

  async findByIntegrationId(
    integrationId: string,
  ): Promise<Result<Video | null, Error>> {
    const video = this.items.find(
      (v) => v.thirdPartyVideoIntegration?.value.id === integrationId,
    )
    return Result.ok(video || null)
  }

  async updateVideo(video: Video): Promise<Result<void, Error>> {
    const index = this.items.findIndex((v) => v.id.value === video.id.value)
    if (index !== -1) {
      this.items[index] = video
    }
    return Result.ok(undefined)
  }
}
