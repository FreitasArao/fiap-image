import { Result } from '@core/domain/result'
import type { VideoRepository } from '@modules/video-processor/domain/repositories/video.repository'
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'

export type CompleteUploadParams = {
  videoId: string
  correlationId?: string
  traceId?: string
}

export type CompleteUploadResult = {
  status: string
  location: string
  etag: string
}

import type { UploadVideoPartsService } from '@modules/video-processor/domain/services/upload-video-parts.service.interface'

const eventBridgeClient = new EventBridgeClient({
  region: Bun.env.AWS_REGION || 'us-east-1',
  endpoint: Bun.env.AWS_ENDPOINT,
})

export class CompleteUploadUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly uploadService: UploadVideoPartsService,
  ) {}

  async execute(
    params: CompleteUploadParams,
  ): Promise<Result<CompleteUploadResult, Error>> {
    const { videoId, correlationId, traceId } = params

    const videoResult = await this.videoRepository.findById(videoId)
    if (videoResult.isFailure) return Result.fail(videoResult.error)

    const video = videoResult.value
    if (!video) return Result.fail(new Error(`Video not found: ${videoId}`))

    if (!video.status.isUploading()) {
      return Result.fail(
        new Error(
          `Cannot complete upload for video in status: ${video.status.value}`,
        ),
      )
    }

    if (!video.isFullyUploaded()) {
      const progress = video.getUploadProgress()
      return Result.fail(
        new Error(
          `Cannot complete upload: only ${progress.uploadedParts}/${progress.totalParts} parts uploaded`,
        ),
      )
    }

    const parts = video.getUploadedPartsEtags()
    if (parts.length === 0)
      return Result.fail(new Error('No parts with ETags found'))

    const uploadId = video.thirdPartyVideoIntegration?.uploadId
    const key = video.thirdPartyVideoIntegration?.key
    const isMissingUploadIdOrKey = !uploadId || !key
    if (isMissingUploadIdOrKey)
      return Result.fail(new Error('Missing upload ID or key'))

    const completeResult = await this.uploadService.completeMultipartUpload({
      key,
      uploadId,
      parts,
    })

    if (completeResult.isFailure) return Result.fail(completeResult.error)

    const transitionResult = video.completeUpload()
    if (transitionResult.isFailure) return Result.fail(transitionResult.error)

    const updateResult = await this.videoRepository.updateVideo(video)
    if (updateResult.isFailure) return Result.fail(updateResult.error)

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId,
              videoPath: video.thirdPartyVideoIntegration?.path || videoId,
              duration: video.metadata.durationMs,
              videoName: video.metadata.value.filename,
              status: 'UPLOADED',
              correlationId: correlationId || crypto.randomUUID(),
              traceId: traceId || crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )

    return Result.ok({
      status: video.status.value,
      location: completeResult.value.location,
      etag: completeResult.value.etag,
    })
  }
}
