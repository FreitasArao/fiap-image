import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { GenerateUploadUrlsUseCase } from '@modules/video-processor/application/generate-upload-urls.use-case'
import { InMemoryVideoRepository } from './factories/in-memory-video.repository'
import { VideoFactory } from './factories/video.factory'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { Result } from '@core/domain/result'
import type { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import type { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { PinoLoggerService } from '@core/libs/logging/pino-logger'
import { context } from '@opentelemetry/api'

function createMockLogger(): AbstractLoggerService {
  return new PinoLoggerService(
    {
      suppressConsole: true,
    },
    context.active(),
  )
}

type CreatePartUploadURLParams = {
  key: string
  partNumber: number
  uploadId: string
}

type MockUploadService = UploadVideoPartsService & {
  capturedKeys: string[]
  failNextCall: boolean
}

function createMockUploadService(): MockUploadService {
  const capturedKeys: string[] = []
  let failNextCall = false

  return {
    capturedKeys,
    get failNextCall() {
      return failNextCall
    },
    set failNextCall(value: boolean) {
      failNextCall = value
    },

    createPartUploadURL: mock(
      async (
        params: CreatePartUploadURLParams,
      ): Promise<Result<{ url: string; expiresAt?: Date }, Error>> => {
        capturedKeys.push(params.key)

        if (failNextCall) {
          return Result.fail(new Error('S3 unavailable'))
        }

        return Result.ok({ url: `http://s3.com/part/${params.partNumber}` })
      },
    ),

    createUploadId: mock(
      async (): Promise<Result<{ uploadId: string; key: string }, Error>> => {
        return Result.ok({ uploadId: 'id', key: 'key' })
      },
    ),

    completeMultipartUpload: mock(
      async (): Promise<Result<{ location: string; etag: string }, Error>> => {
        return Result.ok({ location: 'location', etag: 'etag' })
      },
    ),

    abortMultipartUpload: mock(async (): Promise<Result<void, Error>> => {
      return Result.ok(undefined)
    }),
  }
}

describe('GenerateUploadUrlsUseCase', () => {
  let useCase: GenerateUploadUrlsUseCase
  let videoRepository: InMemoryVideoRepository
  let uploadService: MockUploadService
  let logger: AbstractLoggerService

  beforeEach(() => {
    videoRepository = new InMemoryVideoRepository()
    uploadService = createMockUploadService()
    logger = createMockLogger()

    useCase = new GenerateUploadUrlsUseCase(
      videoRepository,
      uploadService,
      logger,
    )
  })

  it('should generate URLs for parts without them', async () => {
    const video = VideoFactory.create()
    Array.from({ length: 5 }).forEach((_, i) => {
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
    expect(result.value.urls.length).toBe(5)
    expect(result.value.urls[0]).toBe('http://s3.com/part/1')

    const updatedVideo = await videoRepository.findById(video.id.value)
    expect(updatedVideo.value?.parts[0].url).toBe('http://s3.com/part/1')
    expect(updatedVideo.value?.status.value).toBe('UPLOADING')
  })

  it('should pass key without bucket to createPartUploadURL', async () => {
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

    await useCase.execute({ videoId: video.id.value })

    expect(uploadService.capturedKeys.length).toBe(1)
    expect(uploadService.capturedKeys[0]).not.toContain('test-bucket/')
    expect(uploadService.capturedKeys[0]).toMatch(
      /^video\/[^/]+\/file\/test-video\.mp4$/,
    )
  })

  it('should respect batch size of 20', async () => {
    const video = VideoFactory.create()
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
      uploadService.failNextCall = true

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
    })

    it('should fail when video is in terminal state', async () => {
      const video = VideoFactory.create({
        status: VideoStatusVO.create('COMPLETED'),
      })
      await videoRepository.createVideo(video)

      const result = await useCase.execute({ videoId: video.id.value })

      expect(result.isFailure).toBe(true)
    })
  })
})
