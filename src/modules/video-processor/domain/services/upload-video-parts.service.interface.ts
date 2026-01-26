import { Result } from '@core/domain/result'

export interface UploadVideoPartsService {
  createUploadId(
    videoId: string,
    fullFilename: string,
  ): Promise<Result<{ uploadId: string; key: string }, Error>>

  createPartUploadURL(params: {
    key: string
    partNumber: number
    uploadId: string
  }): Promise<Result<{ url: string; expiresAt?: Date }, Error>>

  completeMultipartUpload(params: {
    key: string
    uploadId: string
    parts: { partNumber: number; etag: string }[]
  }): Promise<Result<{ location: string; etag: string }, Error>>

  abortMultipartUpload(
    bucket: string,
    key: string,
    uploadId: string,
  ): Promise<Result<void, Error>>
}
