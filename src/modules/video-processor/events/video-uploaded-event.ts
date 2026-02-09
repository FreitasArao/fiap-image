import { DomainEvent } from '@core/domain/events/domain-event'
import { Video } from '@modules/video-processor/domain/entities/video'

export class VideoUploadedEvent extends DomainEvent<Video> {
  get eventName(): string {
    return 'VideoUploaded'
  }

  constructor(video: Video) {
    super(video)
  }
}
