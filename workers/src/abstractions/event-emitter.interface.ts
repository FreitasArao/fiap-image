export interface VideoStatusEvent {
  videoId: string
  status: 'COMPLETED' | 'FAILED'
  correlationId?: string
  userEmail?: string
  videoName?: string
  downloadUrl?: string
  errorReason?: string
}

export interface EventEmitter {
  emitVideoStatus(event: VideoStatusEvent): Promise<void>
}
