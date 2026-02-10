import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge'
import { CorrelationStore } from '@core/libs/context'
import { EnvelopeFactory } from '@core/messaging'
import type {
  EventBusEmitter,
  VideoStatusChangedEvent,
} from '@core/abstractions/messaging'

/**
 * EventBridgeEmitter - Emits events to EventBridge using the Envelope pattern.
 *
 * The correlationId is obtained implicitly from CorrelationStore (AsyncLocalStorage)
 * when available, falling back to the explicit correlationId in the event payload.
 * This ensures consistent correlation tracking across the entire pipeline.
 */
export class EventBridgeEmitter implements EventBusEmitter {
  private readonly envelopeFactory: EnvelopeFactory

  constructor(private readonly client: EventBridgeClient) {
    this.envelopeFactory = new EnvelopeFactory()
  }

  async emitVideoStatusChanged(event: VideoStatusChangedEvent): Promise<void> {
    // Prefer implicit correlationId from CorrelationStore (set by SQS consumer)
    // Fallback to explicit correlationId from event payload
    const correlationId =
      CorrelationStore.correlationId ??
      event.correlationId ??
      crypto.randomUUID()
    const traceId =
      CorrelationStore.traceId ?? event.traceId ?? crypto.randomUUID()

    const envelope = this.envelopeFactory.createEnvelope(
      {
        videoId: event.videoId,
        status: event.status,
        correlationId,
        userEmail: event.userEmail,
        videoName: event.videoName,
        videoPath: event.videoPath,
        duration: event.duration,
        downloadUrl: event.downloadUrl,
        errorReason: event.errorReason,
        timestamp: event.timestamp ?? new Date().toISOString(),
      },
      {
        correlationId,
        source: 'fiapx.video',
        eventType: 'Video Status Changed',
        traceId,
      },
    )

    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: envelope.metadata.source,
            DetailType: envelope.metadata.eventType,
            Detail: JSON.stringify(envelope),
            TraceHeader: envelope.metadata.traceId,
          },
        ],
      }),
    )
  }
}
