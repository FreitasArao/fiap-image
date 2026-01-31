import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import type { EventEmitter, VideoStatusEvent } from '../abstractions'

export class EventBridgeEmitter implements EventEmitter {
  constructor(private readonly client: EventBridgeClient) {}

  async emitVideoStatus(event: VideoStatusEvent): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId: event.videoId,
              status: event.status,
              correlationId: event.correlationId || '',
              userEmail: event.userEmail || 'user@example.com',
              videoName: event.videoName || 'video',
              downloadUrl: event.downloadUrl || '',
              errorReason: event.errorReason || '',
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    )
  }
}
