import { DomainEvent } from '@core/domain/events/domain-event'
import { Video } from '@modules/video-processor/domain/entities/video'

export class VideoPrintingEvent extends DomainEvent<Video> {
  constructor(video: Video) {
    super(video)
  }

  get eventName(): string {
    return 'VideoPrinting'
  }
}
