import { PartSizePolicy } from '@modules/video-processor/domain-service/part-size-policy'
import { Result } from '@core/domain/result'

import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { VideoExtensionVO } from '@modules/video-processor/domain/value-objects/video-extension.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import {
  PartSizePolicyResult,
  PartSizePolicyError,
} from '@core/errors/part-size-policy.error'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export type CreateVideoUseCaseParams = {
  totalSize: number
  duration: number
  filename: string
  extension: string
}

export type CreateVideoUseCaseResult = {
  video: Video
  uploadId: string
  urls: string[]
}

export class CreateVideoUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly uploadVideoParts: UploadVideoPartsService,
    private readonly logger: AbstractLoggerService,
  ) {}

  async execute(
    params: CreateVideoUseCaseParams,
  ): Promise<Result<CreateVideoUseCaseResult, Error>> {
    this.logger.log('Creating video', {
      totalSize: params.totalSize,
      duration: params.duration,
      filename: params.filename,
      extension: params.extension,
    })

    const extensionResult = VideoExtensionVO.create(params.extension)
    if (extensionResult.isFailure) {
      this.logger.error('Invalid video extension', {
        extension: params.extension,
        error: extensionResult.error,
      })
      return Result.fail(extensionResult.error)
    }

    const videoId = UniqueEntityID.create().value

    this.logger.log('Video ID created', { videoId })

    const policy = PartSizePolicy.calculate(params.totalSize)
    if (policy.isFailure) {
      this.logger.error('Failed to calculate part size policy', {
        error: policy.error,
      })
      return Result.fail(policy.error)
    }

    const fullFilename = `${params.filename}.${extensionResult.value.value}`

    const thirdPartyVideoResult = await this.uploadVideoParts.createUploadId(
      videoId,
      fullFilename,
    )
    if (thirdPartyVideoResult.isFailure) {
      this.logger.error('Failed to create upload ID', {
        error: thirdPartyVideoResult.error,
      })
      return Result.fail(thirdPartyVideoResult.error)
    }

    this.logger.log('Upload ID created', {
      uploadId: thirdPartyVideoResult.value.uploadId,
    })

    const uploadId = thirdPartyVideoResult.value.uploadId

    const video = Video.create({
      userId: UniqueEntityID.create(),
      metadata: VideoMetadataVO.create({
        duration: params.duration,
        totalSize: params.totalSize,
        filename: params.filename,
        extension: extensionResult.value.value,
      }),
    })
      .withIntegration(ThirdPartyIntegration.create())
      .setStorageMetadata({
        uploadId: thirdPartyVideoResult.value.uploadId,
        storagePath: thirdPartyVideoResult.value.key,
      })

    this.logger.log('Video created', { video })

    this.createParts(policy, video)

    const result = await this.videoRepository.createVideo(video)
    if (result.isFailure) {
      this.logger.error('Failed to create video', { error: result.error })
      return Result.fail(result.error)
    }

    this.logger.log('Video created', { video: video.id.value })
    return Result.ok({
      video,
      uploadId,
      urls: [],
    })
  }

  private createParts(
    policy: Result<PartSizePolicyResult, PartSizePolicyError>,
    video: Video & { integration: ThirdPartyIntegration } & {
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    },
  ) {
    let numberOfPartsToCreate = policy.value.numberOfParts

    if (
      PartSizePolicy.numberOfPartsIsLargeThanPageSize(
        policy.value.numberOfParts,
      )
    ) {
      numberOfPartsToCreate = PartSizePolicy.MAX_NUMBER_OF_PARTS
    }

    for (let i = 0; i < numberOfPartsToCreate; i++) {
      video.addPart(
        VideoPart.create({
          videoId: video.id,
          partNumber: i + 1,
          size: policy.value.partSize,
          integration: video.integration,
          url: '',
        }),
      )
    }
  }
}
