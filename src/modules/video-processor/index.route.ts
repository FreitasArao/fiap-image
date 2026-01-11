import { BaseElysia } from '@core/libs/elysia'
import { VideoProcessorController } from '@modules/video-processor/presentation/video-processor.controller'

export const videoProcessorRoute = BaseElysia.create({
  prefix: 'video-processor',
}).post('/', ({ logger }) => {
  return new VideoProcessorController(logger).create()
})
