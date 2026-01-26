import { VideoExtensionVO } from '@modules/video-processor/domain/value-objects/video-extension.vo'
import { describe, expect, it } from 'bun:test'

describe('VideoExtensionVO', () => {
  describe('create', () => {
    it('should create with valid mp4 extension', () => {
      const result = VideoExtensionVO.create('mp4')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mp4')
    })

    it('should create with valid mov extension', () => {
      const result = VideoExtensionVO.create('mov')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mov')
    })

    it('should create with valid avi extension', () => {
      const result = VideoExtensionVO.create('avi')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('avi')
    })

    it('should create with valid mkv extension', () => {
      const result = VideoExtensionVO.create('mkv')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mkv')
    })

    it('should create with valid webm extension', () => {
      const result = VideoExtensionVO.create('webm')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('webm')
    })

    it('should normalize uppercase extension to lowercase', () => {
      const result = VideoExtensionVO.create('MP4')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mp4')
    })

    it('should normalize mixed case extension', () => {
      const result = VideoExtensionVO.create('MoV')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mov')
    })

    it('should handle extension with leading dot', () => {
      const result = VideoExtensionVO.create('.mp4')

      expect(result.isSuccess).toBeTrue()
      expect(result.value.value).toBe('mp4')
    })

    it('should fail for unsupported extension', () => {
      const result = VideoExtensionVO.create('gif')

      expect(result.isFailure).toBeTrue()
      expect(result.error.message).toContain('Unsupported video extension')
    })

    it('should fail for empty extension', () => {
      const result = VideoExtensionVO.create('')

      expect(result.isFailure).toBeTrue()
      expect(result.error.message).toContain('Unsupported video extension')
    })

    it('should fail for random string', () => {
      const result = VideoExtensionVO.create('notavalidext')

      expect(result.isFailure).toBeTrue()
    })
  })

  describe('supportedExtensions', () => {
    it('should return list of supported extensions', () => {
      const extensions = VideoExtensionVO.supportedExtensions()

      expect(extensions).toContain('mp4')
      expect(extensions).toContain('mov')
      expect(extensions).toContain('avi')
      expect(extensions).toContain('mkv')
      expect(extensions).toContain('webm')
      expect(extensions.length).toBe(5)
    })
  })

  describe('isSupported', () => {
    it('should return true for supported extension', () => {
      expect(VideoExtensionVO.isSupported('mp4')).toBeTrue()
      expect(VideoExtensionVO.isSupported('MOV')).toBeTrue()
      expect(VideoExtensionVO.isSupported('.avi')).toBeTrue()
    })

    it('should return false for unsupported extension', () => {
      expect(VideoExtensionVO.isSupported('gif')).toBeFalse()
      expect(VideoExtensionVO.isSupported('png')).toBeFalse()
      expect(VideoExtensionVO.isSupported('')).toBeFalse()
    })
  })
})
