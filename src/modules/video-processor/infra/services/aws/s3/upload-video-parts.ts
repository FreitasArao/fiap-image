import { Result } from '@core/domain/result'
import { BaseS3Service } from '@modules/video-processor/infra/services/aws/s3/base-s3'
import { VideoMetadata } from '@modules/video-processor/domain/value-objects/video-metadata.vo'

export type UploadVideoPartsParams = {
  videoId: string
  videoMetadata: VideoMetadata
  start: number
  uploadId: string
  numberOfParts: number
}

export class UploadVideoParts extends BaseS3Service {
  get bucketName(): string {
    return 'fiapx-video-parts'
  }

  async createUploadId(
    videoId: string,
  ): Promise<Result<{ uploadId: string; key: string }, Error>> {
    return this.startMultipartUpload(videoId)
  }

  async execute(
    params: UploadVideoPartsParams,
  ): Promise<Result<string[], Error>> {
    if (params.start <= 0)
      return Result.fail(new Error('Start must be greater than 0'))

    const uploadIds = await Promise.all(
      Array.from({ length: params.numberOfParts }, (_, index) =>
        this.createPartUploadURL({
          key: `${params.videoId}/videos-parts/video-part-${index}`,
          partNumber: index + 1,
          uploadId: params.uploadId,
        }),
      ),
    )

    const hasSomeError = uploadIds.some((uploadId) => uploadId.isFailure)
    if (hasSomeError)
      return Result.fail(new Error('Failed to create part upload URLs'))

    const partUploadUrls = uploadIds.map((uploadId) => uploadId.value.url)

    return Result.ok(partUploadUrls)
  }
}
