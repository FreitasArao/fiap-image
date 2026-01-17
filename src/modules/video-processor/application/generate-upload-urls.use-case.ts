import { Result } from '@core/domain/result'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'

export type GenerateUploadUrlsUseCaseParams = {
  videoId: string
}

export type GenerateUploadUrlsUseCaseResult = {
  videoId: string
  uploadId: string
  urls: string[]
  nextPartNumber: number | null
}

export class GenerateUploadUrlsUseCase {
  private static readonly BATCH_SIZE = 20

  constructor(
    private readonly videoRepository: Pick<
      VideoRepositoryImpl,
      'findById' | 'updateVideoPart' | 'updateVideo'
    >,
    private readonly uploadVideoParts: UploadVideoParts,
  ) {}

  async execute(
    params: GenerateUploadUrlsUseCaseParams,
  ): Promise<Result<GenerateUploadUrlsUseCaseResult, Error>> {
    const { videoId } = params

    // 1. Find Video
    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) {
      return Result.fail(videoResult.error)
    }

    const video = videoResult.value
    if (!video) {
      return Result.fail(new Error(`Video not found: ${videoId}`))
    }

    // 2. Check status - allows CREATED or UPLOADING
    if (!video.canGenerateMoreUrls()) {
      return Result.fail(
        new Error(
          `Cannot generate URLs for video in status: ${video.status.value}`,
        ),
      )
    }

    // Check integration metadata existence
    if (!video.thirdPartyVideoIntegration) {
      return Result.fail(
        new Error(
          'Video missing third party integration metadata (uploadId/path)',
        ),
      )
    }

    // 3. Find parts with no URL
    // We assume parts are ordered by partNumber.
    // We want the first batch of parts that have empty URLs or need regeneration (but simpler: just empty).
    // Actually, checking for empty string is simplest.
    const pendingParts = video.parts
      .filter((part) => !part.url || part.url === '')
      .sort((a, b) => a.partNumber - b.partNumber)

    if (pendingParts.length === 0) {
      return Result.ok({
        videoId,
        uploadId: video.thirdPartyVideoIntegration.value.id,
        urls: [],
        nextPartNumber: null,
      })
    }

    // 4. Take batch
    const batch = pendingParts.slice(0, GenerateUploadUrlsUseCase.BATCH_SIZE)

    // 5. Generate URLs
    const uploadId = video.thirdPartyVideoIntegration.value.id
    const bucketKey = video.thirdPartyVideoIntegration.value.path
    const generatedUrls: string[] = []

    const urlPromises = batch.map(async (part) => {
      const urlResult = await this.uploadVideoParts.createPartUploadURL({
        key: bucketKey,
        partNumber: part.partNumber,
        uploadId,
      })

      if (urlResult.isSuccess) {
        return { part, url: urlResult.value.url }
      }
      return { part, url: null }
    })

    const results = await Promise.all(urlPromises)

    // Check for failures
    if (results.some((r) => r.url === null)) {
      return Result.fail(
        new Error('Failed to generate presigned URLs for some parts'),
      )
    }

    // 6. Update parts in DB
    for (const res of results) {
      if (res.url) {
        const updatedPart = VideoPart.assignUrl(res.part, res.url)

        // We need to update the part in the video entity and in the DB.
        const index = video.parts.findIndex(
          (p) => p.partNumber === res.part.partNumber,
        )
        if (index !== -1) {
          // Mutate the array to make sure consistent state in memory
          video.parts[index] = updatedPart

          // Update in DB
          await this.videoRepository.updateVideoPart(
            video,
            updatedPart.partNumber,
          )
          generatedUrls.push(res.url)
        }
      }
    }

    // 7. Transition status if first time (CREATED -> UPLOADING)
    if (video.status.value === 'CREATED') {
      const transitionResult = video.startUploading()
      if (transitionResult.isSuccess) {
        await this.videoRepository.updateVideo(video)
      }
    }

    const nextPartNumber =
      batch.length < pendingParts.length
        ? pendingParts[batch.length].partNumber // The next one after this batch
        : null

    return Result.ok({
      videoId,
      uploadId,
      urls: generatedUrls,
      nextPartNumber,
    })
  }
}
