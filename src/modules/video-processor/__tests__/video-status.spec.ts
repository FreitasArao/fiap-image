import { describe, it, expect } from 'bun:test'
import {
  VideoStatusVO,
  type VideoStatus,
} from '@modules/video-processor/domain/value-objects/video-status.vo'

describe('VideoStatusVO', () => {
  it('should create initial status as CREATED', () => {
    const status = VideoStatusVO.createInitial()
    expect(status.value).toBe('CREATED')
  })

  it('should allow valid transition CREATED -> UPLOADING', () => {
    const status = VideoStatusVO.create('CREATED')
    const result = status.transitionTo('UPLOADING')
    expect(result.isSuccess).toBe(true)
    expect(result.value.value).toBe('UPLOADING')
  })

  it('should allow transition to FAILED from any state', () => {
    const states: VideoStatus[] = [
      'CREATED',
      'UPLOADING',
      'UPLOADED',
      'PROCESSING',
      'SPLITTING',
      'PRINTING',
    ]

    states.forEach((state) => {
      const status = VideoStatusVO.create(state)
      const result = status.transitionTo('FAILED')
      expect(result.isSuccess).toBe(true)
      expect(result.value.value).toBe('FAILED')
    })
  })

  it('should prevent invalid transition CREATED -> PROCESSING', () => {
    const status = VideoStatusVO.create('CREATED')
    const result = status.transitionTo('PROCESSING')
    expect(result.isFailure).toBe(true)
    expect(result.error.message).toContain(
      "Invalid status transition: cannot transition from 'CREATED' to 'PROCESSING'",
    )
  })

  it('should identify terminal states', () => {
    expect(VideoStatusVO.create('COMPLETED').isTerminal()).toBe(true)
    expect(VideoStatusVO.create('FAILED').isTerminal()).toBe(true)
    expect(VideoStatusVO.create('PROCESSING').isTerminal()).toBe(false)
  })

  it('should correctly identify state checks', () => {
    const status = VideoStatusVO.create('UPLOADING')
    expect(status.isUploading()).toBe(true)
    expect(status.isUploaded()).toBe(false)
  })
})
