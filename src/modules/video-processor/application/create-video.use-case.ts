import { PartSizePolicy } from '@modules/video-processor/domain-service/part-size-policy'
import { VideoMetadata } from '@modules/video-processor/domain/entities/create-video-urls'
import { Result } from '@core/domain/result'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { randomUUIDv7 } from 'bun'

export class CreateVideoUseCase {
  constructor(
    private readonly videoRepository: VideoRepositoryImpl,
    private readonly createUploadId: Pick<UploadVideoParts, 'createUploadId'>,
  ) {}

  async execute(params: VideoMetadata): Promise<
    Result<
      {
        uploadId: string
        video: {
          id: string
          totalSize: number
          duration: number
          partsUrls: string[]
          createdAt: Date
          updatedAt: Date
        }
      },
      Error
    >
  > {
    const policy = PartSizePolicy.calculate(params.totalSize)
    if (policy.isFailure) return Result.fail(policy.error)

    const video = {
      id: randomUUIDv7(),
      totalSize: params.totalSize,
      duration: params.duration,
      partsUrls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    await this.videoRepository.create({
      created_at: new Date(),
      status: 'pending',
      updated_at: new Date(),
      upload_urls: [],
      video_id: video.id,
    })

    const uploadId = await this.createUploadId.createUploadId(video.id)
    if (uploadId.isFailure) return Result.fail(uploadId.error)

    return Result.ok({
      uploadId: uploadId.value.uploadId,
      video: video,
    })
  }
}
