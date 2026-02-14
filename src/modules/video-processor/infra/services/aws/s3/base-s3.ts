import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
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

/**
 * Converts a presigned URL from public endpoint to internal endpoint.
 * Useful for server-side fetches when running inside Docker where
 * "localhost" in the public URL doesn't reach LocalStack.
 */
export function toInternalUrl(presignedUrl: string): string {
  const publicEndpoint =
    process.env.AWS_PUBLIC_ENDPOINT || process.env.AWS_ENDPOINT
  const internalEndpoint =
    process.env.AWS_ENDPOINT_URL ||
    process.env.AWS_ENDPOINT ||
    'http://localhost:4566'
  if (!publicEndpoint || publicEndpoint === internalEndpoint) {
    return presignedUrl
  }
  try {
    const publicOrigin = new URL(publicEndpoint).origin
    const internalOrigin = new URL(internalEndpoint).origin
    return presignedUrl.replace(publicOrigin, internalOrigin)
  } catch {
    return presignedUrl
  }
}

const S3_RESOURCE = 'BaseS3Service'

export abstract class BaseS3Service {
  protected readonly s3: S3Client
  private readonly internalEndpoint: string | undefined
  private readonly publicEndpoint: string | undefined

  constructor(protected readonly logger: AbstractLoggerService) {
    this.internalEndpoint =
      Bun.env.AWS_ENDPOINT_URL ?? Bun.env.AWS_ENDPOINT ?? undefined

    this.publicEndpoint = Bun.env.AWS_PUBLIC_ENDPOINT || this.internalEndpoint

    // When explicit credentials are provided (e.g. LocalStack), use them.
    // Otherwise let the AWS SDK resolve credentials automatically
    // (IRSA / node instance profile on EKS).
    const credentials =
      Bun.env.AWS_ACCESS_KEY_ID && Bun.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: Bun.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined

    this.s3 = new S3Client({
      region: Bun.env.AWS_REGION ?? 'us-east-1',
      ...(this.internalEndpoint && { endpoint: this.internalEndpoint }),
      forcePathStyle: true,
      ...(credentials && { credentials }),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  protected toPublicUrl(url: string): string {
    if (
      this.internalEndpoint &&
      this.publicEndpoint &&
      this.internalEndpoint !== this.publicEndpoint
    ) {
      return url.replace(this.internalEndpoint, this.publicEndpoint)
    }
    return url
  }

  abstract get bucketName(): string

  private oneHourToExpiresIn(): number {
    return 3600
  }

  async startMultipartUpload(
    key: string,
  ): Promise<Result<{ uploadId: string; key: string }, Error>> {
    this.logger.log('Starting multipart upload to S3', {
      event: 's3.multipart.received',
      resource: S3_RESOURCE,
      message: 'Starting multipart upload to S3',
      's3.bucket': this.bucketName,
      's3.key': key,
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
          event: 's3.multipart.completed',
          resource: S3_RESOURCE,
          message: 'UploadId is required',
          status: 'failure',
          error: { message: 'UploadId is required', kind: 'ValidationError' },
          's3.bucket': this.bucketName,
          's3.key': key,
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
          event: 's3.multipart.completed',
          resource: S3_RESOURCE,
          message: 'Failed to start multipart upload',
          status: 'failure',
          error: {
            message: error.message,
            kind: error.constructor.name,
            stack: error.stack,
          },
          's3.bucket': this.bucketName,
          's3.key': key,
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
      event: 's3.multipart.received',
      resource: S3_RESOURCE,
      message: 'Creating multipart upload URLs to S3',
      's3.bucket': this.bucketName,
      's3.key': params.key,
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

      const expiresIn = params.expiresIn ?? this.oneHourToExpiresIn()
      const url = await getSignedUrl(this.s3, command, {
        expiresIn,
      })

      // Convert internal URL to public URL for client access
      const publicUrl = this.toPublicUrl(url)

      return Result.ok({
        url: publicUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      })
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to create multipart upload URLs to S3', {
          event: 's3.multipart.completed',
          resource: S3_RESOURCE,
          message: 'Failed to create multipart upload URLs',
          status: 'failure',
          error: {
            message: error.message,
            kind: error.constructor.name,
            stack: error.stack,
          },
          's3.bucket': this.bucketName,
          's3.key': params.key,
        })
        return Result.fail(new Error(error.message))
      }
      this.logger.error('Failed to create multipart upload URLs to S3', {
        event: 's3.multipart.completed',
        resource: S3_RESOURCE,
        message: 'Failed to create multipart upload URLs',
        status: 'failure',
        error: { message: String(error), kind: 'Error' },
        's3.bucket': this.bucketName,
        's3.key': params.key,
      })
      return Result.fail(new Error('Failed to create multipart upload URLs'))
    }
  }

  async completeMultipartUpload(
    params: CompleteMultipartUploadParams,
  ): Promise<Result<{ location: string; etag: string }, Error>> {
    this.logger.log('Completing multipart upload to S3', {
      event: 's3.multipart.received',
      resource: S3_RESOURCE,
      message: 'Completing multipart upload to S3',
      's3.bucket': this.bucketName,
      's3.key': params.key,
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
        event: 's3.multipart.completed',
        resource: S3_RESOURCE,
        message: 'Multipart upload completed successfully',
        status: 'success',
        's3.bucket': this.bucketName,
        's3.key': params.key,
      })

      return Result.ok({
        location: result.Location ?? '',
        etag: result.ETag ?? '',
      })
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to complete multipart upload to S3', {
          event: 's3.multipart.completed',
          resource: S3_RESOURCE,
          message: 'Failed to complete multipart upload',
          status: 'failure',
          error: {
            message: error.message,
            kind: error.constructor.name,
            stack: error.stack,
          },
          's3.bucket': this.bucketName,
          's3.key': params.key,
        })
        return Result.fail(new Error(error.message))
      }
      return Result.fail(new Error('Failed to complete multipart upload'))
    }
  }

  async abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<Result<void, Error>> {
    this.logger.log('Aborting multipart upload', { bucket, key, uploadId })

    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      })

      await this.s3.send(command)
      return Result.ok(undefined)
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error('Failed to abort multipart upload', {
          bucket: bucket,
          key: key,
          uploadId: uploadId,
          error: error.message,
        })
        return Result.fail(new Error(error.message))
      }
      return Result.fail(new Error('Failed to abort multipart upload'))
    }
  }
}
