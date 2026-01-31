import type { MessageContext } from './envelope.types'

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface MessageHandler<T> {
  parse(rawPayload: unknown): ParseResult<T>
  handle(payload: T, context: MessageContext): Promise<void>
}
