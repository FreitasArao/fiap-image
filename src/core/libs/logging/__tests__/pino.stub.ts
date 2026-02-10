import { mock } from 'bun:test'
import type { Logger as PinoBaseLogger } from 'pino'

/**
 * Stub for Pino's Logger.
 * Satisfies the methods used by PinoLoggerService internally
 * without the need for `as unknown as PinoBaseLogger`.
 */
export function createPinoStub(): PinoBaseLogger {
  return {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
    fatal: mock(),
    silent: mock(),
    level: 'info',
    child: mock(),
    isLevelEnabled: mock(() => true),
    bindings: mock(() => ({})),
    flush: mock(),
    on: mock(),
    off: mock(),
    addListener: mock(),
    once: mock(),
    removeListener: mock(),
    removeAllListeners: mock(),
    emit: mock(),
    listeners: mock(() => []),
    rawListeners: mock(() => []),
    listenerCount: mock(() => 0),
    prependListener: mock(),
    prependOnceListener: mock(),
    eventNames: mock(() => []),
    getMaxListeners: mock(() => 10),
    setMaxListeners: mock(),
    setBindings: mock(),
    [Symbol.for('pino.serializers')]: {},
  } as unknown as PinoBaseLogger
}
