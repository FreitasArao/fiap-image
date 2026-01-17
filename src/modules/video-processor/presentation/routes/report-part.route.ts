import { BaseElysia } from '@core/libs/elysia'
import { ReportPartUploadUseCase } from '@modules/video-processor/application/report-part-upload.use-case'
import { VideoRepositoryImpl } from '@modules/video-processor/infra/repositories/video-repository-impl'
import { StatusMap, t } from 'elysia'

/**
 * Route: POST /videos/:id/parts/:partNumber
 * Reports that a part has been successfully uploaded to S3.
 * Client must call this after each successful part upload with the ETag.
 */
export const reportPartRoute = BaseElysia.create({ prefix: '' }).post(
  '/:id/parts/:partNumber',
  async ({ params, body, logger, set }) => {
    const { id: videoId, partNumber } = params
    const { etag } = body

    const useCase = new ReportPartUploadUseCase(new VideoRepositoryImpl(logger))

    const result = await useCase.execute({
      videoId,
      partNumber: Number(partNumber),
      etag,
    })

    if (result.isFailure) {
      set.status = StatusMap['Bad Request']
      return { error: result.error.message }
    }

    return {
      message: 'Part upload reported successfully',
      progress: result.value.progress,
    }
  },
  {
    detail: {
      tags: ['Video Processor'],
      summary: 'Report part upload',
      description:
        'Reports that a part has been successfully uploaded to S3 with its ETag',
    },
    params: t.Object({
      id: t.String({ description: 'Video ID' }),
      partNumber: t.String({ description: 'Part number (1-indexed)' }),
    }),
    body: t.Object({
      etag: t.String({ description: 'ETag returned by S3 after upload' }),
    }),
    response: {
      200: t.Object({
        message: t.String(),
        progress: t.Object({
          totalParts: t.Number(),
          uploadedParts: t.Number(),
          percentage: t.Number(),
        }),
      }),
      400: t.Object({
        error: t.String(),
      }),
    },
  },
)
