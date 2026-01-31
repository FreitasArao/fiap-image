import { BaseElysia } from '@core/libs/elysia'
import { CompleteUploadUseCase } from '@modules/video-processor/application/complete-upload.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { StatusMap, t } from 'elysia'

export const completeUploadRoute = BaseElysia.create({ prefix: '' }).post(
  '/:id/complete',
  async ({ params, logger, set, tracingContext }) => {
    const { id: videoId } = params
    const { correlationId, traceId } = tracingContext

    const useCase = new CompleteUploadUseCase(
      new VideoRepositoryImpl(logger),
      new UploadVideoParts(logger),
    )

    const result = await useCase.execute({ videoId, correlationId, traceId })

    if (result.isFailure) {
      set.status = StatusMap['Bad Request']
      return { error: result.error.message }
    }

    return {
      message: 'Upload completed successfully',
      videoId,
      status: result.value.status,
      location: result.value.location,
      etag: result.value.etag,
    }
  },
  {
    detail: {
      tags: ['Video Processor'],
      summary: 'Complete multipart upload',
      description:
        'Completes the multipart upload after all parts are uploaded. Calls S3 CompleteMultipartUpload.',
    },
    params: t.Object({
      id: t.String({ description: 'Video ID' }),
    }),
    response: {
      200: t.Object({
        message: t.String(),
        videoId: t.String(),
        status: t.String({ description: 'New video status (UPLOADED)' }),
        location: t.String({ description: 'S3 object URL' }),
        etag: t.String({ description: 'Final object ETag' }),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
  },
)
