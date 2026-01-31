import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import type {
  EventBusEmitter,
  VideoStatusChangedEvent,
} from '@core/abstractions/messaging'

export class EventBridgeEmitter implements EventBusEmitter {
  constructor(private readonly client: EventBridgeClient) {}

  async emitVideoStatusChanged(event: VideoStatusChangedEvent): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'fiapx.video',
            DetailType: 'Video Status Changed',
            Detail: JSON.stringify({
              videoId: event.videoId,
              status: event.status,
              correlationId: event.correlationId,
              userEmail: event.userEmail,
              videoName: event.videoName,
              videoPath: event.videoPath,
              duration: event.duration,
              downloadUrl: event.downloadUrl,
              errorReason: event.errorReason,
              traceId: event.traceId,
              timestamp: event.timestamp ?? new Date().toISOString(),
            }),
          },
        ],
      }),
    )
  }
}
