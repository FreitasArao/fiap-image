import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { msToNs } from '@core/libs/logging/log-event'
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
    const startTime = performance.now()
    const resource = 'GenerateUploadUrlsUseCase'
    const { videoId } = params

    this.logger.log('Generate upload URLs started', {
      event: 'video.upload_urls.started',
      resource,
      message: 'Generate upload URLs started',
      'video.id': videoId,
    })

    const videoResult = await this.getValidVideo(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }
    const video = videoResult.value

    const { batch, nextPartNumber } = video.getPendingPartsBatch(
      GenerateUploadUrlsUseCase.BATCH_SIZE,
    )

    if (batch.length === 0) {
      this.logger.log('Generate upload URLs completed (no pending parts)', {
        event: 'video.upload_urls.completed',
        resource,
        message: 'No pending parts to generate URLs for',
        status: 'success',
        duration: msToNs(performance.now() - startTime),
        'video.id': videoId,
      })
      return Result.ok({
        videoId,
        uploadId: video.thirdPartyVideoIntegration.uploadId,
        urls: [],
        nextPartNumber: null,
      })
    }

    const uploadId = video.thirdPartyVideoIntegration.uploadId
    const bucketKey = video.thirdPartyVideoIntegration.key

    const urlResults = await this.generatePresignedUrls(
      batch,
      bucketKey,
      uploadId,
    )

    const hasSomeFailed = urlResults.some((r) => r.url === null)
    if (hasSomeFailed) {
      this.logger.error('Generate upload URLs failed', {
        event: 'video.upload_urls.completed',
        resource,
        message: 'Failed to generate presigned URLs for some parts',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: {
          message: 'Failed to generate presigned URLs',
          kind: 'PresignError',
        },
        'video.id': videoId,
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
        this.logger.error('Generate upload URLs failed', {
          event: 'video.upload_urls.completed',
          resource,
          message: 'Failed to update part in DB',
          status: 'failure',
          duration: msToNs(performance.now() - startTime),
          error:
            updateResult.error instanceof Error
              ? {
                  message: updateResult.error.message,
                  kind: updateResult.error.constructor.name,
                  stack: updateResult.error.stack,
                }
              : { message: String(updateResult.error), kind: 'Error' },
          'video.id': videoId,
          'upload.partNumber': result.part.partNumber,
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

    this.logger.log('Generate upload URLs completed', {
      event: 'video.upload_urls.completed',
      resource,
      message: 'URLs generated successfully',
      status: 'success',
      duration: msToNs(performance.now() - startTime),
      'video.id': videoId,
      'upload.totalParts': batch.length,
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
      this.logger.error('Failed to find video', {
        event: 'video.upload_urls.completed',
        resource: 'GenerateUploadUrlsUseCase',
        message: 'Failed to find video',
        status: 'failure',
        error:
          videoResult.error instanceof Error
            ? {
                message: videoResult.error.message,
                kind: videoResult.error.constructor.name,
                stack: videoResult.error.stack,
              }
            : { message: String(videoResult.error), kind: 'Error' },
        'video.id': videoId,
      })
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      this.logger.error('Video not found', {
        event: 'video.upload_urls.completed',
        resource: 'GenerateUploadUrlsUseCase',
        message: 'Video not found',
        status: 'failure',
        error: { message: `Video not found: ${videoId}`, kind: 'NotFoundError' },
        'video.id': videoId,
      })
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    if (!video.canGenerateMoreUrls()) {
      this.logger.log('Cannot generate URLs for video in status', {
        event: 'video.upload_urls.completed',
        resource: 'GenerateUploadUrlsUseCase',
        message: 'Cannot generate URLs for video in status',
        status: 'skipped',
        'video.id': videoId,
        'video.status': video.status.value,
      })
      return Result.fail(
        new Error(
          `Cannot generate URLs for video in status: ${video.status.value}`,
        ),
      )
    }

    if (!video.thirdPartyVideoIntegration) {
      this.logger.error('Video missing third party integration metadata', {
        event: 'video.upload_urls.completed',
        resource: 'GenerateUploadUrlsUseCase',
        message: 'Video missing third party integration metadata',
        status: 'failure',
        error: {
          message: 'Video missing third party integration metadata (uploadId/path)',
          kind: 'ValidationError',
        },
        'video.id': videoId,
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
        const urlResult = await this.uploadVideoParts.createPartUploadURL({
          key: bucketKey,
          partNumber: part.partNumber,
          uploadId,
        })

        if (urlResult.isSuccess) {
          return { part, url: urlResult.value.url }
        }

        this.logger.error('Failed to generate URL for part', {
          event: 'video.upload_urls.completed',
          resource: 'GenerateUploadUrlsUseCase',
          message: 'Failed to generate URL for part',
          status: 'failure',
          error: {
            message: 'Presigned URL generation failed',
            kind: 'PresignError',
          },
          'upload.partNumber': part.partNumber,
        })
        return { part, url: null }
      },
    )

    return Promise.all(urlPromises)
  }
}
