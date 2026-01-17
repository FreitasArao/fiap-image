import { PartSizePolicy } from '@modules/video-processor/domain-service/part-size-policy'
import { Result } from '@core/domain/result'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoThirdPartyIntegrationsMetadataVO } from '@modules/video-processor/domain/value-objects/video-third-party-integrations-metadata.vo'
import { ThirdPartyIntegration } from '@modules/video-processor/domain/entities/third-party-integration.vo'
import { VideoPart } from '@modules/video-processor/domain/entities/video-part'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UniqueEntityID } from '@modules/video-processor/domain/value-objects/unique-entity-id.vo'
import {
  PartSizePolicyResult,
  PartSizePolicyError,
} from '@core/errors/part-size-policy.error'

export type CreateUrlsUseCaseParams = {
  totalSize: number
  duration: number
}

export type CreateUrlsUseCaseResult = {
  video: Video
  uploadId: string
  urls: string[]
}

export class CreateUrlsUseCase {
  constructor(
    private readonly videoRepository: Pick<VideoRepositoryImpl, 'createVideo'>,
    private readonly uploadVideoParts: UploadVideoParts,
  ) {}

  async execute(
    params: CreateUrlsUseCaseParams,
  ): Promise<Result<CreateUrlsUseCaseResult, Error>> {
    const videoId = UniqueEntityID.create().value

    const policy = PartSizePolicy.calculate(params.totalSize)
    if (policy.isFailure) return Result.fail(policy.error)

    const thirdPartyVideoResult =
      await this.uploadVideoParts.createUploadId(videoId)
    if (thirdPartyVideoResult.isFailure)
      return Result.fail(thirdPartyVideoResult.error)

    const uploadId = thirdPartyVideoResult.value.uploadId

    const video = Video.create({
      userId: UniqueEntityID.create(),
      metadata: VideoMetadataVO.create({
        duration: params.duration,
        totalSize: params.totalSize,
      }),
    })
      .withIntegration(ThirdPartyIntegration.create())
      .addThirdPartyVideoIntegration({
        id: thirdPartyVideoResult.value.uploadId,
        bucket: this.uploadVideoParts.bucketName,
        path: thirdPartyVideoResult.value.key,
      })

    const partsUrls = await Promise.all(
      Array.from({ length: policy.value.numberOfParts }, (_, index) =>
        this.uploadVideoParts.createPartUploadURL({
          key: videoId,
          partNumber: index + 1,
          uploadId,
        }),
      ),
    )

    const hasSomeError = partsUrls.some((partUrl) => partUrl.isFailure)
    if (hasSomeError)
      return Result.fail(new Error('Failed to create part upload URLs'))

    this.createParts(policy, video, partsUrls)

    const result = await this.videoRepository.createVideo(video)
    if (result.isFailure) return Result.fail(result.error)

    return Result.ok({
      video,
      uploadId,
      urls: video.getPartsUrls(),
    })
  }

  private createParts(
    policy: Result<PartSizePolicyResult, PartSizePolicyError>,
    video: Video & { integration: ThirdPartyIntegration } & {
      thirdPartyVideoIntegration: VideoThirdPartyIntegrationsMetadataVO
    },
    partsUrls: Result<{ url: string }, Error>[],
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
          url: partsUrls[i].value.url,
        }),
      )
    }
  }
}
