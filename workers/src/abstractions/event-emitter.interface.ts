export interface VideoStatusEvent {
  videoId: string
  status: 'COMPLETED' | 'FAILED'
  userEmail?: string
  videoName?: string
  downloadUrl?: string
  errorReason?: string
}

export interface EventEmitter {
  emitVideoStatus(event: VideoStatusEvent): Promise<void>
}
