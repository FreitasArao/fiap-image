import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type CreatePartUploadURLParams = {
  key: string
  uploadId: string
  partNumber: number
  expiresIn?: number
}

export type CompleteMultipartUploadParams = {
  key: string
  uploadId: string
  parts: { partNumber: number; etag: string }[]
}

export abstract class BaseS3Service {
  protected readonly s3: S3Client
  constructor(private readonly logger: AbstractLoggerService) {
    if (!Bun.env.AWS_ACCESS_KEY_ID || !Bun.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        'AWS_ENDPOINT, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set',
      )
    }
    this.s3 = new S3Client({
      region: Bun.env?.AWS_REGION,
      endpoint: Bun.env?.AWS_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: Bun.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  abstract get bucketName(): string

  private oneHourToExpiresIn(): number {
    return 3600
  }

  async startMultipartUpload(
    key: string,
  ): Promise<Result<{ uploadId: string }, Error>> {
    this.logger.log('Starting multipart upload to S3', {
      key,
      bucket: this.bucketName,
    })
    try {
      const result = await this.s3.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      )

      const uploadId = result.UploadId
      if (!uploadId) {
        this.logger.error('Failed to start multipart upload to S3', {
          key: key,
          bucket: this.bucketName,
          error: 'UploadId is required',
        })
        return Result.fail(new Error('UploadId is required'))
      }
      return Result.ok({
        uploadId: uploadId,
        key: key,
      })
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to start multipart upload to S3', {
          key: key,
          bucket: this.bucketName,
          error: error.message,
        })
        return Result.fail(new Error(error.message))
      }

      return Result.fail(new Error('Failed to create multipart upload'))
    }
  }

  async createPartUploadURL(
    params: CreatePartUploadURLParams,
  ): Promise<Result<{ url: string }, Error>> {
    this.logger.log('Creating multipart upload URLs to S3', {
      key: params.key,
      bucket: this.bucketName,
    })
    try {
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: params.key,
        UploadId: params.uploadId,
        PartNumber: params.partNumber,
        // para validar o checksum,precisa
        ChecksumAlgorithm: undefined,
      })

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: params.expiresIn ?? this.oneHourToExpiresIn(),
      })

      return Result.ok({
        url: url,
      })
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to create multipart upload URLs to S3', {
          key: params.key,
          bucket: this.bucketName,
          error: error.message,
        })
        return Result.fail(new Error(error.message))
      }
      this.logger.error('Failed to create multipart upload URLs to S3', {
        key: params.key,
        bucket: this.bucketName,
        error: error,
      })
      return Result.fail(new Error('Failed to create multipart upload URLs'))
    }
  }

  async completeMultipartUpload(
    params: CompleteMultipartUploadParams,
  ): Promise<Result<{ location: string; etag: string }, Error>> {
    this.logger.log('Completing multipart upload to S3', {
      key: params.key,
      bucket: this.bucketName,
      uploadId: params.uploadId,
      partsCount: params.parts.length,
    })
    try {
      const result = await this.s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: params.key,
          UploadId: params.uploadId,
          MultipartUpload: {
            Parts: params.parts.map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
          },
        }),
      )

      this.logger.log('Multipart upload completed successfully', {
        key: params.key,
        bucket: this.bucketName,
        location: result.Location,
        etag: result.ETag,
      })

      return Result.ok({
        location: result.Location ?? '',
        etag: result.ETag ?? '',
      })
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to complete multipart upload to S3', {
          key: params.key,
          bucket: this.bucketName,
          error: error.message,
        })
        return Result.fail(new Error(error.message))
      }
      return Result.fail(new Error('Failed to complete multipart upload'))
    }
  }
}
