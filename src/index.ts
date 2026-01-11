import { BaseElysia } from '@core/libs/elysia'
import { docs } from '@modules/docs'
import { logger } from '@modules/logging'
import { telemetry } from '@modules/telemetry'
import { videoProcessorRoute } from '@modules/video-processor/index.route'

const app = BaseElysia.create()
  .use(telemetry)
  .use(docs)
  .use(videoProcessorRoute)

app.listen(3010, () => {
  logger.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  )
})
