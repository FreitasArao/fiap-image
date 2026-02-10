import { describe, it, expect } from 'bun:test'
import { VideoStatusVO } from '../video-status.vo'

describe('VideoStatusVO', () => {
  it('should create an initial status as CREATED', () => {
    const status = VideoStatusVO.createInitial()
    expect(status.value).toBe('CREATED')
  })

  it('should create a status from a given value', () => {
    const status = VideoStatusVO.create('UPLOADING')
    expect(status.value).toBe('UPLOADING')
  })

  describe('canTransitionTo()', () => {
    it('should allow valid transition from CREATED to UPLOADING', () => {
      const status = VideoStatusVO.create('CREATED')
      expect(status.canTransitionTo('UPLOADING')).toBe(true)
    })

    it('should deny invalid transition from CREATED to COMPLETED', () => {
      const status = VideoStatusVO.create('CREATED')
      expect(status.canTransitionTo('COMPLETED')).toBe(false)
    })

    it('should not allow any transitions from COMPLETED', () => {
      const status = VideoStatusVO.create('COMPLETED')
      expect(status.canTransitionTo('FAILED')).toBe(false)
    })

    it('should not allow any transitions from FAILED', () => {
      const status = VideoStatusVO.create('FAILED')
      expect(status.canTransitionTo('CREATED')).toBe(false)
    })
  })

  describe('transitionTo()', () => {
    it('should return ok result for valid transition', () => {
      const status = VideoStatusVO.create('CREATED')
      const result = status.transitionTo('UPLOADING')
      expect(result.isSuccess).toBe(true)
      expect(result.value.value).toBe('UPLOADING')
    })

    it('should return failure for invalid transition', () => {
      const status = VideoStatusVO.create('CREATED')
      const result = status.transitionTo('COMPLETED')
      expect(result.isFailure).toBe(true)
    })
  })

  describe('isTerminal()', () => {
    it('should return true for COMPLETED', () => {
      expect(VideoStatusVO.create('COMPLETED').isTerminal()).toBe(true)
    })

    it('should return true for FAILED', () => {
      expect(VideoStatusVO.create('FAILED').isTerminal()).toBe(true)
    })

    it('should return false for non-terminal statuses', () => {
      expect(VideoStatusVO.create('CREATED').isTerminal()).toBe(false)
      expect(VideoStatusVO.create('UPLOADING').isTerminal()).toBe(false)
    })
  })

  describe('isUploading()', () => {
    it('should return true for UPLOADING', () => {
      expect(VideoStatusVO.create('UPLOADING').isUploading()).toBe(true)
    })

    it('should return false for non-UPLOADING', () => {
      expect(VideoStatusVO.create('CREATED').isUploading()).toBe(false)
    })
  })

  describe('isUploaded()', () => {
    it('should return true for UPLOADED', () => {
      expect(VideoStatusVO.create('UPLOADED').isUploaded()).toBe(true)
    })

    it('should return false for non-UPLOADED', () => {
      expect(VideoStatusVO.create('CREATED').isUploaded()).toBe(false)
    })
  })

  describe('isProcessing()', () => {
    it('should return true for PROCESSING, SPLITTING, PRINTING', () => {
      expect(VideoStatusVO.create('PROCESSING').isProcessing()).toBe(true)
      expect(VideoStatusVO.create('SPLITTING').isProcessing()).toBe(true)
      expect(VideoStatusVO.create('PRINTING').isProcessing()).toBe(true)
    })

    it('should return false for non-processing statuses', () => {
      expect(VideoStatusVO.create('CREATED').isProcessing()).toBe(false)
      expect(VideoStatusVO.create('COMPLETED').isProcessing()).toBe(false)
    })
  })

  describe('isCompleted()', () => {
    it('should return true for COMPLETED', () => {
      expect(VideoStatusVO.create('COMPLETED').isCompleted()).toBe(true)
    })

    it('should return false for non-COMPLETED', () => {
      expect(VideoStatusVO.create('FAILED').isCompleted()).toBe(false)
    })
  })

  describe('isFailed()', () => {
    it('should return true for FAILED', () => {
      expect(VideoStatusVO.create('FAILED').isFailed()).toBe(true)
    })

    it('should return false for non-FAILED', () => {
      expect(VideoStatusVO.create('COMPLETED').isFailed()).toBe(false)
    })
  })

  describe('toString()', () => {
    it('should return the status as string', () => {
      expect(VideoStatusVO.create('CREATED').toString()).toBe('CREATED')
    })
  })
})
