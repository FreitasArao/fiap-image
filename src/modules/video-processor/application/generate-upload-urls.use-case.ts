import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

import { VideoPart } from '@modules/video-processor/domain/entities/video-part'

export type GenerateUploadUrlsUseCaseParams = {
  videoId: string
}

export type GenerateUploadUrlsUseCaseResult = {
  videoId: string
  uploadId: string
  urls: string[]
  nextPartNumber: number | null
}

import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'

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

    const pendingParts = video.parts
      .filter((part) => !part.url || part.url === '')
      .sort((a, b) => a.partNumber - b.partNumber)

    if (pendingParts.length === 0) {
      this.logger.log('No pending parts to generate URLs for', { videoId })
      return Result.ok({
        videoId,
        uploadId: video.thirdPartyVideoIntegration.value.id,
        urls: [],
        nextPartNumber: null,
      })
    }

    const batch = pendingParts.slice(0, GenerateUploadUrlsUseCase.BATCH_SIZE)

    const uploadId = video.thirdPartyVideoIntegration.value.id
    const bucketKey = video.thirdPartyVideoIntegration.value.path
    const generatedUrls: string[] = []

    this.logger.log('Generating URLs for parts', {
      batch: batch.map((part) => part.partNumber),
    })

    const urlPromises = batch.map(async (part) => {
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
    })

    const results = await Promise.all(urlPromises)

    this.logger.log('URLs generated', {
      results: results.map((r) => r.part.partNumber),
    })

    if (results.some((r) => r.url === null)) {
      this.logger.error('Failed to generate presigned URLs for some parts', {
        parts: results.map((r) => r.part.partNumber),
      })
      return Result.fail(
        new Error('Failed to generate presigned URLs for some parts'),
      )
    }

    this.logger.log('Updating parts in DB', {
      parts: results.map((r) => r.part.partNumber),
    })
    for (const res of results) {
      if (res.url) {
        const updatedPart = VideoPart.assignUrl(res.part, res.url)

        this.logger.log('Part updated', { partNumber: res.part.partNumber })
        const index = video.parts.findIndex(
          (p) => p.partNumber === res.part.partNumber,
        )
        if (index !== -1) {
          this.logger.log('Part updated in memory', {
            partNumber: res.part.partNumber,
          })
          video.parts[index] = updatedPart

          this.logger.log('Updating part in DB', {
            partNumber: res.part.partNumber,
          })
          await this.videoRepository.updateVideoPart(
            video,
            updatedPart.partNumber,
          )
          generatedUrls.push(res.url)
        }
      }
    }

    this.logger.log('Transitioning status if first time', {
      status: video.status.value,
    })
    if (video.status.value === 'CREATED') {
      const transitionResult = video.startUploading()
      if (transitionResult.isSuccess) {
        this.logger.log('Status transitioned successfully', {
          status: video.status.value,
        })
        await this.videoRepository.updateVideo(video)
      }
    }

    const nextPartNumber =
      batch.length < pendingParts.length
        ? pendingParts[batch.length].partNumber
        : null
    this.logger.log('Next part number', { nextPartNumber })

    return Result.ok({
      videoId,
      uploadId,
      urls: generatedUrls,
      nextPartNumber,
    })
  }
}
