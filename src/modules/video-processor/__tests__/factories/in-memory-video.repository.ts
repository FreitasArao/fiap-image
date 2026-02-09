import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { Video } from '@modules/video-processor/domain/entities/video'
import { Result } from '@core/domain/result'
import type { VideoStatus } from '@modules/video-processor/domain/value-objects/video-status.vo'

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
      (v) => v.thirdPartyVideoIntegration?.uploadId === integrationId,
    )
    return Result.ok(video || null)
  }

  async findByObjectKey(
    objectKey: string,
  ): Promise<Result<Video | null, Error>> {
    const video = this.items.find(
      (v) => v.thirdPartyVideoIntegration?.key === objectKey,
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

  async incrementProcessedSegments(
    videoId: string,
  ): Promise<Result<number, Error>> {
    const index = this.items.findIndex((v) => v.id.value === videoId)
    if (index !== -1) {
      this.items[index].incrementProcessedSegments()
      return Result.ok(this.items[index].processedSegments)
    }
    return Result.fail(new Error(`Video not found: ${videoId}`))
  }

  async updateTotalSegments(
    videoId: string,
    totalSegments: number,
  ): Promise<Result<void, Error>> {
    const index = this.items.findIndex((v) => v.id.value === videoId)
    if (index !== -1) {
      this.items[index].setTotalSegments(totalSegments)
      return Result.ok(undefined)
    }
    return Result.fail(new Error(`Video not found: ${videoId}`))
  }

  async transitionStatus(
    videoId: string,
    expectedStatus: VideoStatus,
    newStatus: VideoStatus,
  ): Promise<boolean> {
    const index = this.items.findIndex((v) => v.id.value === videoId)
    if (index === -1) {
      return false
    }

    const video = this.items[index]
    if (video.status.value !== expectedStatus) {
      return false
    }

    const transitionResult = video.completeUpload()
    if (transitionResult.isFailure) {
      return false
    }

    return true
  }
}
