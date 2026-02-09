import { DomainEvent } from '@core/domain/events/domain-event'
import { Video } from '@modules/video-processor/domain/entities/video'

export class VideoSplittingEvent extends DomainEvent<Video> {
  get eventName(): string {
    return 'VideoSplitting'
  }

  constructor(video: Video) {
    super(video)
  }
}
