import { logger } from "@modules/logging";
import { VideoProcessorController } from "@modules/video-processor/presentation/video-processor.controller";
import Elysia from "elysia";

export const videoProcessorRoute = new Elysia({
    prefix: 'video-processor',
}).post('/', ({ body }) => {
    return new VideoProcessorController(logger.withContext('video-processor#post')).create()
})