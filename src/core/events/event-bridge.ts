import {
  EventBridgeClient,
  PutEventsCommand,
  PutEventsCommandOutput,
} from '@aws-sdk/client-eventbridge'
import { Result } from '@core/domain/result'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'
import { MessageEnvelope } from '@core/messaging'

/**
 * DefaultEventBridge - Sends events to AWS EventBridge using the Envelope pattern.
 *
 * All log lines automatically include correlationId, traceId, and spanId
 * via the Pino mixin (reads from CorrelationStore / AsyncLocalStorage).
 * The explicit metadata fields in log extras are for structured querying only.
 */
export class DefaultEventBridge {
  private readonly client: EventBridgeClient

  constructor(private readonly logger: AbstractLoggerService) {
    this.client = new EventBridgeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT_URL,
    })
  }

  get eventBusName(): string {
    return process.env.AWS_EVENT_BUS_NAME ?? 'default'
  }

  async send<TPayload>(
    event: MessageEnvelope<TPayload>,
  ): Promise<Result<PutEventsCommandOutput, Error>> {
    // correlationId is automatically injected by Pino mixin via CorrelationStore
    this.logger.log(
      `Sending event to EventBridge: ${event.metadata.eventType}`,
      {
        messageId: event.metadata.messageId,
        eventType: event.metadata.eventType,
      },
    )

    try {
      // Send the full envelope (metadata + payload) as Detail
      // This ensures downstream consumers receive the complete envelope
      const command = new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: event.metadata.source,
            DetailType: event.metadata.eventType,
            Detail: JSON.stringify(event),
            TraceHeader: event.metadata.traceId,
          },
        ],
      })

      const response = await this.client.send(command)

      this.logger.log('Event sent to EventBridge', {
        event: 'eventbridge.event.published',
        resource: 'DefaultEventBridge',
        message: 'Event sent to EventBridge',
        status: 'success',
        'eventbridge.source': event.metadata.source,
        'eventbridge.detailType': event.metadata.eventType,
        messageId: event.metadata.messageId,
        failedEntryCount: response.FailedEntryCount,
      })

      return Result.ok(response)
    } catch (error) {
      this.logger.error('Failed to send event to EventBridge', {
        event: 'eventbridge.event.publish_failed',
        resource: 'DefaultEventBridge',
        message: 'Failed to send event to EventBridge',
        status: 'failure',
        error:
          error instanceof Error
            ? {
                message: error.message,
                kind: error.constructor.name,
                stack: error.stack,
              }
            : { message: String(error), kind: 'Error' },
        'eventbridge.source': event.metadata.source,
        'eventbridge.detailType': event.metadata.eventType,
        messageId: event.metadata.messageId,
      })
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }
}
