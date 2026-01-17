import { BaseElysia } from '@core/libs/elysia'
import { CreateVideoUseCase } from '@modules/video-processor/application/create-video.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { StatusMap, t } from 'elysia'

/**
 * Route: POST /videos
 * Creates a new video and initiates multipart upload.
 * Returns videoId and uploadId (no URLs yet - use upload-urls route for that).
 */
export const createVideoRoute = BaseElysia.create({ prefix: '' }).post(
  '/',
  async ({ body, logger, set }) => {
    const { totalSize, duration } = body

    const useCase = new CreateVideoUseCase(
      new VideoRepositoryImpl(logger),
      new UploadVideoParts(logger),
    )

    const result = await useCase.execute({
      totalSize,
      duration,
    })

    if (result.isFailure) {
      set.status = StatusMap['Unprocessable Content']
      return { message: result.error.message }
    }

    const videoPath = result.value.video.thirdPartyVideoIntegration?.value.path

    if (!videoPath) {
      set.status = StatusMap['Bad Request']
      return { message: 'Error creating video path' }
    }

    return {
      message: 'Video created successfully',
      videoId: result.value.video.id.value,
      uploadId: result.value.uploadId,
      urls: result.value.urls,
      videoPath,
      status: result.value.video.status.value,
    }
  },
  {
    detail: {
      tags: ['Video Processor'],
      summary: 'Create video and generate upload URLs',
      description:
        'Creates a new video in the system and returns presigned URLs for multipart upload to S3',
    },
    body: t.Object({
      totalSize: t.Number({ description: 'Total video size in bytes' }),
      duration: t.Number({ description: 'Video duration in seconds' }),
    }),
    response: {
      200: t.Object({
        message: t.String(),
        videoId: t.String({ description: 'Created video ID' }),
        uploadId: t.String({ description: 'S3 multipart upload ID' }),
        urls: t.Array(t.String(), {
          description: 'Presigned URLs for part uploads',
        }),
        videoPath: t.String({ description: 'Video path in S3' }),
        status: t.String({ description: 'Current video status' }),
      }),
      422: t.Object({
        message: t.String(),
      }),
      400: t.Object({
        message: t.String(),
      }),
    },
  },
)
