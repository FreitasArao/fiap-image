export type VideoStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'SPLITTING'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'

export interface VideoStatusChangedEvent {
  videoId: string
  status: VideoStatus
  correlationId: string
  timestamp?: string
  userEmail?: string
  videoName?: string
  videoPath?: string
  duration?: number
  downloadUrl?: string
  errorReason?: string
  traceId?: string
}

export interface EventBusEmitter {
  emitVideoStatusChanged(event: VideoStatusChangedEvent): Promise<void>
}
