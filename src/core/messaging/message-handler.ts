import type { MessageContext } from './envelope.types'
import { Result } from '@core/domain/result'

export interface MessageHandler<T> {
  parse(rawPayload: unknown): Result<T, Error>
  handle(payload: T, context: MessageContext): Promise<Result<void, Error>>
}
