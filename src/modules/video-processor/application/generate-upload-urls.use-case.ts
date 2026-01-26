import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'

export type GenerateUploadUrlsUseCaseParams = {
  videoId: string
}

export type GenerateUploadUrlsUseCaseResult = {
  videoId: string
  uploadId: string
  urls: string[]
  nextPartNumber: number | null
}

type UrlGenerationResult = { part: VideoPart; url: string | null }

export class GenerateUploadUrlsUseCase {
  private static readonly BATCH_SIZE = 20

  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly uploadVideoParts: UploadVideoPartsService,
    private readonly logger: AbstractLoggerService,
  ) {}

  async execute(
    params: GenerateUploadUrlsUseCaseParams,
  ): Promise<Result<GenerateUploadUrlsUseCaseResult, Error>> {
    this.logger.log('Generating upload URLs for video', {
      video: params.videoId,
    })
    const { videoId } = params

    const videoResult = await this.getValidVideo(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }
    const video = videoResult.value

    const { batch, nextPartNumber } = video.getPendingPartsBatch(
      GenerateUploadUrlsUseCase.BATCH_SIZE,
    )

    if (batch.length === 0) {
      this.logger.log('No pending parts to generate URLs for', { videoId })
      return Result.ok({
        videoId,
        uploadId: video.thirdPartyVideoIntegration.uploadId,
        urls: [],
        nextPartNumber: null,
      })
    }

    const uploadId = video.thirdPartyVideoIntegration.uploadId
    const bucketKey = video.thirdPartyVideoIntegration.path

    this.logger.log('Generating URLs for parts', {
      batch: batch.map((part) => part.partNumber),
    })

    const urlResults = await this.generatePresignedUrls(
      batch,
      bucketKey,
      uploadId,
    )

    const hasSomeFailed = urlResults.some((r) => r.url === null)
    if (hasSomeFailed) {
      this.logger.error('Failed to generate presigned URLs for some parts', {
        parts: urlResults.map((r) => r.part.partNumber),
      })
      return Result.fail(new Error('Failed to generate presigned URLs'))
    }

    const generatedUrls: string[] = []
    for (const result of urlResults) {
      if (result.url === null) continue

      const assignResult = video.assignUrlToPart(
        result.part.partNumber,
        result.url,
      )
      if (assignResult.isFailure) {
        return Result.fail(assignResult.error)
      }

      const updateResult = await this.videoRepository.updateVideoPart(
        video,
        result.part.partNumber,
      )
      if (updateResult.isFailure) {
        this.logger.error('Failed to update part in DB', {
          partNumber: result.part.partNumber,
        })
        return Result.fail(updateResult.error)
      }

      generatedUrls.push(result.url)
    }

    const transitionResult = video.startUploadingIfNeeded()
    if (transitionResult.isSuccess && video.isUploading()) {
      const updateVideoResult = await this.videoRepository.updateVideo(video)
      if (updateVideoResult.isFailure) {
        return Result.fail(updateVideoResult.error)
      }
    }

    this.logger.log('URLs generated successfully', {
      count: generatedUrls.length,
      nextPartNumber,
    })

    return Result.ok({
      videoId,
      uploadId,
      urls: generatedUrls,
      nextPartNumber,
    })
  }

  private async getValidVideo(videoId: string): Promise<
    Result<
      Video & {
        thirdPartyVideoIntegration: NonNullable<
          Video['thirdPartyVideoIntegration']
        >
      },
      Error
    >
  > {
    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) {
      this.logger.error('Failed to find video', { error: videoResult.error })
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      this.logger.error('Video not found', { videoId })
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    if (!video.canGenerateMoreUrls()) {
      this.logger.log('Cannot generate URLs for video in status', {
        status: video.status.value,
      })
      return Result.fail(
        new Error(
          `Cannot generate URLs for video in status: ${video.status.value}`,
        ),
      )
    }

    if (!video.thirdPartyVideoIntegration) {
      this.logger.error('Video missing third party integration metadata', {
        videoId,
      })
      return Result.fail(
        new Error(
          'Video missing third party integration metadata (uploadId/path)',
        ),
      )
    }

    return Result.ok(
      video as Video & {
        thirdPartyVideoIntegration: NonNullable<
          Video['thirdPartyVideoIntegration']
        >
      },
    )
  }

  private async generatePresignedUrls(
    batch: VideoPart[],
    bucketKey: string,
    uploadId: string,
  ): Promise<UrlGenerationResult[]> {
    const urlPromises = batch.map(
      async (part): Promise<UrlGenerationResult> => {
        this.logger.log('Generating URL for part', {
          partNumber: part.partNumber,
        })

        const urlResult = await this.uploadVideoParts.createPartUploadURL({
          key: bucketKey,
          partNumber: part.partNumber,
          uploadId,
        })

        if (urlResult.isSuccess) {
          this.logger.log('URL generated successfully', {
            partNumber: part.partNumber,
          })
          return { part, url: urlResult.value.url }
        }

        this.logger.error('Failed to generate URL for part', {
          partNumber: part.partNumber,
        })
        return { part, url: null }
      },
    )

    return Promise.all(urlPromises)
  }
}
