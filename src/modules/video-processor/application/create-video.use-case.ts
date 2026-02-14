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
import { msToNs } from '@core/libs/logging/log-event'

export type CreateVideoUseCaseParams = {
  totalSize: number
  /** Duration in milliseconds */
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

  private toErrorPayload(error: unknown): {
    message: string
    kind: string
    stack?: string
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        kind: error.constructor.name,
        stack: error.stack,
      }
    }
    return { message: String(error), kind: 'Error' }
  }

  async execute(
    params: CreateVideoUseCaseParams,
  ): Promise<Result<CreateVideoUseCaseResult, Error>> {
    const startTime = performance.now()
    const resource = 'CreateVideoUseCase'

    this.logger.log('Create video request started', {
      event: 'video.create.started',
      resource,
      message: 'Create video request started',
      'video.filename': params.filename,
      'video.totalSize': params.totalSize,
      'video.duration': params.duration,
    })

    const extensionResult = VideoExtensionVO.create(params.extension)
    if (extensionResult.isFailure) {
      this.logger.error('Create video failed', {
        event: 'video.create.completed',
        resource,
        message: 'Invalid video extension',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: this.toErrorPayload(extensionResult.error),
        'video.filename': params.filename,
      })
      return Result.fail(extensionResult.error)
    }

    const videoId = UniqueEntityID.create().value

    const policy = PartSizePolicy.calculate(params.totalSize)
    if (policy.isFailure) {
      this.logger.error('Create video failed', {
        event: 'video.create.completed',
        resource,
        message: 'Failed to calculate part size policy',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: this.toErrorPayload(policy.error),
        'video.filename': params.filename,
      })
      return Result.fail(policy.error)
    }

    const fullFilename = `${params.filename}.${extensionResult.value.value}`

    const thirdPartyVideoResult = await this.uploadVideoParts.createUploadId(
      videoId,
      fullFilename,
    )
    if (thirdPartyVideoResult.isFailure) {
      this.logger.error('Create video failed', {
        event: 'video.create.completed',
        resource,
        message: 'Failed to create upload ID',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: this.toErrorPayload(thirdPartyVideoResult.error),
        'video.filename': params.filename,
      })
      return Result.fail(thirdPartyVideoResult.error)
    }

    const uploadId = thirdPartyVideoResult.value.uploadId

    const video = Video.create({
      userId: UniqueEntityID.create(),
      metadata: VideoMetadataVO.create({
        durationMs: params.duration,
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

    this.createParts(policy, video)

    const result = await this.videoRepository.createVideo(video)
    if (result.isFailure) {
      this.logger.error('Create video failed', {
        event: 'video.create.completed',
        resource,
        message: 'Failed to create video in repository',
        status: 'failure',
        duration: msToNs(performance.now() - startTime),
        error: this.toErrorPayload(result.error),
        'video.filename': params.filename,
      })
      return Result.fail(result.error)
    }

    this.logger.log('Create video completed', {
      event: 'video.create.completed',
      resource,
      message: 'Create video completed',
      status: 'success',
      duration: msToNs(performance.now() - startTime),
      'video.id': video.id.value,
    })
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
