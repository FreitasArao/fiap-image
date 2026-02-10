import { describe, it, expect } from 'bun:test'
import { Video } from '@modules/video-processor/domain/entities/video'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoPrintingEvent } from '../video-printing-event'
import { VideoSplittingEvent } from '../video-splitting-event'
import { VideoUploadedEvent } from '../video-uploaded-event'

function makeVideo(): Video {
  return Video.create({
    metadata: VideoMetadataVO.create({
      totalSize: MegabytesValueObject.create(50).value,
      durationMs: 60000,
      filename: 'test',
      extension: 'mp4',
    }),
    userId: UniqueEntityID.create(),
  })
}

describe('Domain Events', () => {
  describe('VideoUploadedEvent', () => {
    it('should return "VideoUploaded" as eventName', () => {
      const video = makeVideo()
      const event = new (VideoUploadedEvent as any)(video) as VideoUploadedEvent
      expect(event.eventName).toBe('VideoUploaded')
    })

    it('should carry the video entity as data', () => {
      const video = makeVideo()
      const event = new (VideoUploadedEvent as any)(video) as VideoUploadedEvent
      expect(event.data).toBe(video)
    })

    it('should set eventDate and dateTimeOccurred', () => {
      const video = makeVideo()
      const event = new (VideoUploadedEvent as any)(video) as VideoUploadedEvent
      expect(event.eventDate).toBeInstanceOf(Date)
      expect(event.dateTimeOccurred).toBeInstanceOf(Date)
    })
  })

  describe('VideoSplittingEvent', () => {
    it('should return "VideoSplitting" as eventName', () => {
      const video = makeVideo()
      const event = new (VideoSplittingEvent as any)(video) as VideoSplittingEvent
      expect(event.eventName).toBe('VideoSplitting')
    })

    it('should carry the video entity as data', () => {
      const video = makeVideo()
      const event = new (VideoSplittingEvent as any)(video) as VideoSplittingEvent
      expect(event.data).toBe(video)
    })
  })

  describe('VideoPrintingEvent', () => {
    it('should return "VideoPrinting" as eventName', () => {
      const video = makeVideo()
      const event = new (VideoPrintingEvent as any)(video) as VideoPrintingEvent
      expect(event.eventName).toBe('VideoPrinting')
    })

    it('should carry the video entity as data', () => {
      const video = makeVideo()
      const event = new (VideoPrintingEvent as any)(video) as VideoPrintingEvent
      expect(event.data).toBe(video)
    })
  })
})
