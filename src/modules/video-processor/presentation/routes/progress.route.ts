import { BaseElysia } from '@core/libs/elysia'
import { GetUploadProgressUseCase } from '@modules/video-processor/application/get-upload-progress.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { StatusMap, t } from 'elysia'

export const progressRoute = BaseElysia.create({ prefix: '' }).get(
  '/:id/progress',
  async ({ params, logger, set }) => {
    const { id: videoId } = params

    const useCase = new GetUploadProgressUseCase(
      new VideoRepositoryImpl(logger),
    )

    const result = await useCase.execute({ videoId })

    if (result.isFailure) {
      set.status = StatusMap['Not Found']
      return { error: result.error.message }
    }

    // Map progress parts to response format (Date -> ISO string)
    const progress = result.value.progress
    const responseProgress = {
      totalParts: progress.totalParts,
      uploadedParts: progress.uploadedParts,
      percentage: progress.percentage,
      parts: progress.parts.map((p) => ({
        partNumber: p.partNumber,
        etag: p.etag,
        uploadedAt: p.uploadedAt?.toISOString(),
        isUploaded: p.isUploaded,
      })),
    }

    return {
      videoId,
      status: result.value.status,
      progress: responseProgress,
    }
  },
  {
    detail: {
      tags: ['Video Processor'],
      summary: 'Get upload progress',
      description: 'Returns the current upload progress for a video',
    },
    params: t.Object({
      id: t.String({ description: 'Video ID' }),
    }),
    response: {
      200: t.Object({
        videoId: t.String(),
        status: t.String(),
        progress: t.Object({
          totalParts: t.Number(),
          uploadedParts: t.Number(),
          percentage: t.Number(),
          parts: t.Array(
            t.Object({
              partNumber: t.Number(),
              etag: t.Optional(t.String()),
              uploadedAt: t.Optional(t.String()),
              isUploaded: t.Boolean(),
            }),
          ),
        }),
      }),
      404: t.Object({
        error: t.String(),
      }),
    },
  },
)
