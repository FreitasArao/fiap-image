import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { GenerateUploadUrlsUseCase } from '@modules/video-processor/application/generate-upload-urls.use-case'
import { InMemoryVideoRepository } from './factories/in-memory-video.repository'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { VideoFactory } from './factories/video.factory'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { Result } from '@core/domain/result'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

// Mock UploadVideoParts
const mockUploadService = {
  createPartUploadURL: mock(async ({ partNumber }) => {
    return Result.ok({ url: `http://s3.com/part/${partNumber}` })
  }),
  createUploadId: mock(async () => Result.ok({ uploadId: 'id', key: 'key' })),
  bucketName: 'bucket',
} as unknown as UploadVideoParts

// Mock Logger
const mockLogger = {
  log: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
  debug: mock(() => {}),
  verbose: mock(() => {}),
  withContext: mock(() => mockLogger),
} as unknown as AbstractLoggerService

describe('GenerateUploadUrlsUseCase', () => {
  let useCase: GenerateUploadUrlsUseCase
  let videoRepository: InMemoryVideoRepository

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    useCase = new GenerateUploadUrlsUseCase(videoRepository, mockUploadService, mockLogger)
  })

  it('should generate URLs for parts without them', async () => {
    // 1. Setup Video with pending parts
    const video = VideoFactory.create()
    Array.from({ length: 5 }).forEach((_, i) => {
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: i + 1,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '', // Empty URL
        }),
      )
    })

    await videoRepository.createVideo(video)

    // 2. Execute
    const result = await useCase.execute({ videoId: video.id.value })

    // 3. Verify
    expect(result.isSuccess).toBe(true)
    expect(result.value.urls.length).toBe(5)
    expect(result.value.urls[0]).toBe('http://s3.com/part/1')

    // Check repository updated
    const updatedVideo = await videoRepository.findById(video.id.value)
    expect(updatedVideo.value?.parts[0].url).toBe('http://s3.com/part/1')
    expect(updatedVideo.value?.status.value).toBe('UPLOADING')
  })

  it('should respect batch size of 20', async () => {
    const video = VideoFactory.create()
    // Create 30 parts
    Array.from({ length: 30 }).forEach((_, i) => {
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: i + 1,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )
    })
    await videoRepository.createVideo(video)

    const result = await useCase.execute({ videoId: video.id.value })

    expect(result.isSuccess).toBe(true)
    expect(result.value.urls.length).toBe(20)
    expect(result.value.nextPartNumber).toBe(21)
  })
  describe('Error Scenarios', () => {
    it('should fail gracefully when createPartUploadURL fails', async () => {
      // Mock failure for next call
      const originalImpl = mockUploadService.createPartUploadURL
      // @ts-ignore
      mockUploadService.createPartUploadURL = mock(async () =>
        Result.fail(new Error('S3 unavailable')),
      )

      const video = VideoFactory.create()
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: 1,
          size: 100,
          integration: ThirdPartyIntegration.create(),
          url: '',
        }),
      )
      await videoRepository.createVideo(video)

      const result = await useCase.execute({ videoId: video.id.value })

      expect(result.isFailure).toBe(true)

      // Restore mock
      // @ts-ignore
      mockUploadService.createPartUploadURL = originalImpl
    })

    it('should fail when video is in terminal state', async () => {
      // PROCESSED is generally final for uploads
      const video = VideoFactory.create({ status: 'PROCESSED' })
      await videoRepository.createVideo(video)

      const result = await useCase.execute({ videoId: video.id.value })

      // Logic in UseCase checks status. If UseCase does not check status, this might fail or pass depending on imp.
      // Assuming UseCase checks valid status for upload URL generation?
      // GenerateUploadUrlsUseCase line 41: checks if video exists.
      // Does it check status?
      // Let's verify implementation in next step if this fails.
      // But assuming standard robust UseCase.
      // If it fails, I'll fix the UseCase to check status!
      expect(result.isFailure).toBe(true)
    })
  })
})
