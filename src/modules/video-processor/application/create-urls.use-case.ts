import { PartSizePolicy } from '@modules/video-processor/domain-service/part-size-policy'
import { Result } from '@core/domain/result'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'

export type CreateUrlsUseCaseParams = {
  videoId: string
  totalSize: number
  duration: number
  uploadId: string
}

export class CreateUrlsUseCase {
  constructor(
    private readonly createPartUploadURL: Pick<
      UploadVideoParts,
      'createPartUploadURL'
    >,
  ) {}

  async execute(
    params: CreateUrlsUseCaseParams,
  ): Promise<Result<string[], Error>> {
    const policy = PartSizePolicy.calculate(params.totalSize)
    if (policy.isFailure) return Result.fail(policy.error)

    //   // futuratmnete vai buscar do banco
    // const video = {
    //   id: randomUUIDv7(),
    //   totalSize: params.totalSize,
    //   duration: params.duration,
    //   partsUrls: [],
    //   createdAt: new Date(),
    //   updatedAt: new Date(),
    // }

    //    this.videoRepository.create({
    //     created_at: new Date(),
    //     status: 'pending',
    //     updated_at: new Date(),
    //     upload_urls: [],
    //     video_id: video.id,
    //    })

    const partsUrls = await Promise.all(
      Array.from({ length: policy.value.numberOfParts }, (_, index) =>
        this.createPartUploadURL.createPartUploadURL({
          key: params.videoId,
          partNumber: index + 1,
          uploadId: params.uploadId,
        }),
      ),
    )

    const hasSomeError = partsUrls.some((partUrl) => partUrl.isFailure)
    if (hasSomeError)
      return Result.fail(new Error('Failed to create part upload URLs'))

    const partsUrlsResult = partsUrls.map((partUrl) => partUrl.value.url)
    return Result.ok(partsUrlsResult)
  }
}
