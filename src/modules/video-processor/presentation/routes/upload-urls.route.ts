import { BaseElysia } from '@core/libs/elysia'
import { GenerateUploadUrlsUseCase } from '@modules/video-processor/application/generate-upload-urls.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { UploadVideoParts } from '@modules/video-processor/infra/services/aws/s3/upload-video-parts'
import { StatusMap, t } from 'elysia'

export const uploadUrlsRoute = BaseElysia.create({ prefix: '' }).get(
  '/:id/upload-urls',
  async ({ params, logger, set }) => {
    logger.log('Starting upload URLs video', { videoId: params.id })
    const { id: videoId } = params

    const useCase = new GenerateUploadUrlsUseCase(
      new VideoRepositoryImpl(logger),
      new UploadVideoParts(logger),
      logger,
    )

    const result = await useCase.execute({ videoId })

    if (result.isFailure) {
      set.status = StatusMap['Bad Request']
      return { error: result.error.message }
    }

    return {
      videoId: result.value.videoId,
      uploadId: result.value.uploadId,
      urls: result.value.urls,
      nextPartNumber: result.value.nextPartNumber,
    }
  },
  {
    detail: {
      tags: ['Video Processor'],
      summary: 'Generate upload URLs',
      description:
        'Generates a batch (max 20) of presigned upload URLs for parts that do not have them yet.',
    },
    params: t.Object({
      id: t.String({ description: 'Video ID' }),
    }),
    response: {
      200: t.Object({
        videoId: t.String(),
        uploadId: t.String(),
        urls: t.Array(t.String(), {
          description: 'List of presigned URLs',
        }),
        nextPartNumber: t.Nullable(
          t.Number({
            description:
              'Next part number to request URLs for, or null if finished',
          }),
        ),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
  },
)
