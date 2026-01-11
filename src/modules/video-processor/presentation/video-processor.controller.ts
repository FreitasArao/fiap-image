import { AbstractLoggerService } from "@core/libs/logging/abstract-logger";

export class VideoProcessorController {
    constructor(
        private readonly logger: AbstractLoggerService
    ){}
    async create() {
        this.logger.log('Creating video processor')

        return {
            message: 'Ihull'
        }
    }
}