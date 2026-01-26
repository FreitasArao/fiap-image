import { Result } from '@core/domain/result'
import { BaseS3Service } from '@modules/video-processor/infra/services/aws/s3/base-s3'
import { VideoMetadata } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import {
  createStoragePathBuilder,
  StoragePathBuilder,
} from '@modules/video-processor/infra/services/storage'

export type UploadVideoPartsParams = {
  videoId: string
  videoMetadata: VideoMetadata
  start: number
  uploadId: string
  numberOfParts: number
}

import { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'

export class UploadVideoParts
  extends BaseS3Service
  implements UploadVideoPartsService
{
  private readonly pathBuilder: StoragePathBuilder

  constructor(...args: ConstructorParameters<typeof BaseS3Service>) {
    super(...args)
    this.pathBuilder = createStoragePathBuilder()
  }

  get bucketName(): string {
    return this.pathBuilder.bucket
  }

  async createUploadId(
    videoId: string,
    fullFilename: string,
  ): Promise<Result<{ uploadId: string; key: string }, Error>> {
    this.logger.log('Creating upload ID for video', { videoId, fullFilename })
    const storagePath = this.pathBuilder.videoFile(videoId, fullFilename)
    const result = await this.startMultipartUpload(storagePath.key)

    if (result.isFailure) {
      return Result.fail(result.error)
    }

    return Result.ok({
      uploadId: result.value.uploadId,
      key: storagePath.fullPath,
    })
  }

  async execute(
    params: UploadVideoPartsParams,
  ): Promise<Result<string[], Error>> {
    this.logger.log('Creating part upload URLs for video', {
      videoId: params.videoId,
    })
    if (params.start <= 0)
      return Result.fail(new Error('Start must be greater than 0'))

    const uploadIds = await Promise.all(
      Array.from({ length: params.numberOfParts }, (_, index) => {
        const partPath = this.pathBuilder.videoPart(
          params.videoId,
          `video-part-${index}`,
        )
        return this.createPartUploadURL({
          key: partPath.key,
          partNumber: index + 1,
          uploadId: params.uploadId,
        })
      }),
    )

    const hasSomeError = uploadIds.some((uploadId) => uploadId.isFailure)
    if (hasSomeError) {
      this.logger.error('Failed to create part upload URLs', {
        videoId: params.videoId,
      })
      return Result.fail(new Error('Failed to create part upload URLs'))
    }

    const partUploadUrls = uploadIds.map((uploadId) => uploadId.value.url)
    this.logger.log('Part upload URLs created', {
      videoId: params.videoId,
      partUploadUrls,
    })
    return Result.ok(partUploadUrls)
  }
}
