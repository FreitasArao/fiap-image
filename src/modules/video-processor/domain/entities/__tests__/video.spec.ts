import { describe, it, expect } from 'bun:test'
import { Video } from '../video'
import { VideoPart } from '../video-part'
import { ThirdPartyIntegration } from '../third-party-integration.vo'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'
import { VideoMetadataVO } from '@modules/video-processor/domain/value-objects/video-metadata.vo'
import { VideoStatusVO } from '@modules/video-processor/domain/value-objects/video-status.vo'
import { MegabytesValueObject } from '@modules/video-processor/domain/value-objects/megabytes.vo'

function makeMetadata() {
  return VideoMetadataVO.create({
    totalSize: MegabytesValueObject.create(50).value,
    durationMs: 60000,
    filename: 'test-video',
    extension: 'mp4',
  })
}

function makeVideo() {
  return Video.create({
    metadata: makeMetadata(),
    userId: UniqueEntityID.create(),
  })
}

function makePart(videoId: UniqueEntityID, partNumber: number, url = '') {
  return VideoPart.create({
    videoId,
    partNumber,
    size: 1024,
    integration: ThirdPartyIntegration.create(),
    url,
  })
}

describe('Video', () => {
  describe('create()', () => {
    it('should create a video with CREATED status', () => {
      const video = makeVideo()
      expect(video.status.value).toBe('CREATED')
      expect(video.parts).toEqual([])
      expect(video.integration).toBeDefined()
    })
  })

  describe('createFromDatabase()', () => {
    it('should recreate a video with all persisted fields', () => {
      const id = UniqueEntityID.create()
      const userId = UniqueEntityID.create()
      const video = Video.createFromDatabase({
        id,
        userId,
        metadata: makeMetadata(),
        status: VideoStatusVO.create('UPLOADING'),
        parts: [],
        failureReason: 'some reason',
        totalSegments: 10,
        processedSegments: 5,
      })

      expect(video.id).toBe(id)
      expect(video.status.value).toBe('UPLOADING')
      expect(video.failureReason).toBe('some reason')
      expect(video.totalSegments).toBe(10)
      expect(video.processedSegments).toBe(5)
    })
  })

  describe('status transitions', () => {
    it('should transition CREATED -> UPLOADING', () => {
      const video = makeVideo()
      const result = video.startUploading()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADING')
    })

    it('should transition UPLOADING -> UPLOADED via completeUpload', () => {
      const video = makeVideo()
      video.startUploading()
      const result = video.completeUpload()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADED')
    })

    it('should add VideoUploadedEvent on completeUpload', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      const events = video.domainEvents
      expect(events.length).toBe(1)
      expect(events[0].eventName).toBe('VideoUploaded')
    })

    it('should return failure when completeUpload is called from invalid state', () => {
      const video = makeVideo()
      const result = video.completeUpload()
      expect(result.isFailure).toBe(true)
    })

    it('should transition UPLOADED -> PROCESSING', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      const result = video.startProcessing()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('PROCESSING')
    })

    it('should transition PROCESSING -> SPLITTING and add event', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      video.startProcessing()
      const result = video.startSplitting()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('SPLITTING')
      expect(
        video.domainEvents.some((e) => e.eventName === 'VideoSplitting'),
      ).toBe(true)
    })

    it('should return failure when startSplitting from invalid state', () => {
      const video = makeVideo()
      const result = video.startSplitting()
      expect(result.isFailure).toBe(true)
    })

    it('should transition SPLITTING -> PRINTING and add event', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      video.startProcessing()
      video.startSplitting()
      const result = video.startPrinting()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('PRINTING')
      expect(
        video.domainEvents.some((e) => e.eventName === 'VideoPrinting'),
      ).toBe(true)
    })

    it('should return failure when startPrinting from invalid state', () => {
      const video = makeVideo()
      const result = video.startPrinting()
      expect(result.isFailure).toBe(true)
    })

    it('should transition PRINTING -> COMPLETED', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      video.startProcessing()
      video.startSplitting()
      video.startPrinting()
      const result = video.markAsCompleted()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('COMPLETED')
    })

    it('should return failure when markAsCompleted from invalid state', () => {
      const video = makeVideo()
      const result = video.markAsCompleted()
      expect(result.isFailure).toBe(true)
    })

    it('should transition to FAILED and store reason', () => {
      const video = makeVideo()
      const result = video.markAsFailed('encoding error')
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('FAILED')
      expect(video.failureReason).toBe('encoding error')
    })

    it('should not set failureReason when markAsFailed fails', () => {
      const video = makeVideo()
      video.markAsFailed('first failure')
      const result = video.markAsFailed('second failure')
      expect(result.isFailure).toBe(true)
      expect(video.failureReason).toBe('first failure')
    })
  })

  describe('isUploading()', () => {
    it('should return true when status is UPLOADING', () => {
      const video = makeVideo()
      video.startUploading()
      expect(video.isUploading()).toBe(true)
    })

    it('should return false when status is not UPLOADING', () => {
      const video = makeVideo()
      expect(video.isUploading()).toBe(false)
    })
  })

  describe('isAlreadyUploaded()', () => {
    it('should return true when status is UPLOADED', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      expect(video.isAlreadyUploaded()).toBe(true)
    })

    it('should return true when status is PROCESSING (isProcessing)', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      video.startProcessing()
      expect(video.isAlreadyUploaded()).toBe(true)
    })

    it('should return false when status is CREATED', () => {
      const video = makeVideo()
      expect(video.isAlreadyUploaded()).toBe(false)
    })
  })

  describe('canGenerateMoreUrls()', () => {
    it('should return true for CREATED status', () => {
      const video = makeVideo()
      expect(video.canGenerateMoreUrls()).toBe(true)
    })

    it('should return true for UPLOADING status', () => {
      const video = makeVideo()
      video.startUploading()
      expect(video.canGenerateMoreUrls()).toBe(true)
    })

    it('should return false for UPLOADED status', () => {
      const video = makeVideo()
      video.startUploading()
      video.completeUpload()
      expect(video.canGenerateMoreUrls()).toBe(false)
    })
  })

  describe('parts management', () => {
    it('should add a part to the video', () => {
      const video = makeVideo()
      const part = makePart(video.id, 1, 'http://url')
      video.addPart(part)
      expect(video.parts.length).toBe(1)
    })

    it('should mark a specific part as uploaded', () => {
      const video = makeVideo()
      const part = makePart(video.id, 1, 'http://url')
      video.addPart(part)

      video.markPartAsUploaded(1, '"etag-1"')

      expect(video.parts[0].isUploaded()).toBe(true)
      expect(video.parts[0].etag).toBe('"etag-1"')
    })

    it('should not fail when marking non-existent part as uploaded', () => {
      const video = makeVideo()
      const result = video.markPartAsUploaded(999, '"etag"')
      expect(result).toBe(video)
    })

    it('should return parts urls', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, 'http://url-1'))
      video.addPart(makePart(video.id, 2, 'http://url-2'))

      expect(video.getPartsUrls()).toEqual(['http://url-1', 'http://url-2'])
    })

    it('should return uploaded parts etags', () => {
      const video = makeVideo()
      const part1 = makePart(video.id, 1, 'http://url-1')
      const part2 = makePart(video.id, 2, 'http://url-2')
      video.addPart(part1)
      video.addPart(part2)

      video.markPartAsUploaded(1, '"etag-1"')

      const etags = video.getUploadedPartsEtags()
      expect(etags).toEqual([{ partNumber: 1, etag: '"etag-1"' }])
    })
  })

  describe('getUploadProgress()', () => {
    it('should return zero progress when no parts', () => {
      const video = makeVideo()
      const progress = video.getUploadProgress()
      expect(progress.totalParts).toBe(0)
      expect(progress.uploadedParts).toBe(0)
      expect(progress.percentage).toBe(0)
      expect(progress.parts).toEqual([])
    })

    it('should calculate correct progress with mixed parts', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, 'url-1'))
      video.addPart(makePart(video.id, 2, 'url-2'))
      video.markPartAsUploaded(1, '"etag"')

      const progress = video.getUploadProgress()
      expect(progress.totalParts).toBe(2)
      expect(progress.uploadedParts).toBe(1)
      expect(progress.percentage).toBe(50)
      expect(progress.parts.length).toBe(2)
    })
  })

  describe('isFullyUploaded()', () => {
    it('should return false when no parts exist', () => {
      const video = makeVideo()
      expect(video.isFullyUploaded()).toBe(false)
    })

    it('should return false when some parts are pending', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, 'url'))
      video.addPart(makePart(video.id, 2, 'url'))
      video.markPartAsUploaded(1, '"etag"')
      expect(video.isFullyUploaded()).toBe(false)
    })

    it('should return true when all parts are uploaded', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, 'url'))
      video.addPart(makePart(video.id, 2, 'url'))
      video.markPartAsUploaded(1, '"e1"')
      video.markPartAsUploaded(2, '"e2"')
      expect(video.isFullyUploaded()).toBe(true)
    })
  })

  describe('reconcileAllPartsAsUploaded()', () => {
    it('should mark all pending parts as uploaded with reconciled etag', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, 'url'))
      video.addPart(makePart(video.id, 2, 'url'))

      video.reconcileAllPartsAsUploaded()

      expect(video.parts.every((p) => p.isUploaded())).toBe(true)
      expect(video.parts[0].etag).toBe('reconciled')
    })
  })

  describe('startUploadingIfNeeded()', () => {
    it('should start uploading if status is CREATED', () => {
      const video = makeVideo()
      const result = video.startUploadingIfNeeded()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADING')
    })

    it('should be a no-op if already UPLOADING', () => {
      const video = makeVideo()
      video.startUploading()
      const result = video.startUploadingIfNeeded()
      expect(result.isSuccess).toBe(true)
      expect(video.status.value).toBe('UPLOADING')
    })
  })

  describe('segments tracking', () => {
    it('should set and get totalSegments', () => {
      const video = makeVideo()
      video.setTotalSegments(10)
      expect(video.totalSegments).toBe(10)
    })

    it('should increment processedSegments', () => {
      const video = makeVideo()
      video.setTotalSegments(5)
      const count = video.incrementProcessedSegments()
      expect(count).toBe(1)
      expect(video.processedSegments).toBe(1)
    })

    it('should report isFullyProcessed correctly', () => {
      const video = makeVideo()
      video.setTotalSegments(2)
      expect(video.isFullyProcessed()).toBe(false)

      video.incrementProcessedSegments()
      expect(video.isFullyProcessed()).toBe(false)

      video.incrementProcessedSegments()
      expect(video.isFullyProcessed()).toBe(true)
    })

    it('should return false for isFullyProcessed when totalSegments is 0', () => {
      const video = makeVideo()
      expect(video.isFullyProcessed()).toBe(false)
    })

    it('should return correct processing progress', () => {
      const video = makeVideo()
      video.setTotalSegments(4)
      video.incrementProcessedSegments()
      video.incrementProcessedSegments()

      const progress = video.getProcessingProgress()
      expect(progress.total).toBe(4)
      expect(progress.processed).toBe(2)
      expect(progress.percentage).toBe(50)
    })

    it('should return 0 percentage when totalSegments is 0', () => {
      const video = makeVideo()
      const progress = video.getProcessingProgress()
      expect(progress.percentage).toBe(0)
    })
  })

  describe('getPendingPartsBatch()', () => {
    it('should return parts without urls sorted by partNumber', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 2, ''))
      video.addPart(makePart(video.id, 1, ''))
      video.addPart(makePart(video.id, 3, 'has-url'))

      const { batch, nextPartNumber } = video.getPendingPartsBatch(10)
      expect(batch.length).toBe(2)
      expect(batch[0].partNumber).toBe(1)
      expect(batch[1].partNumber).toBe(2)
      expect(nextPartNumber).toBeNull()
    })

    it('should limit batch size and return next part number', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, ''))
      video.addPart(makePart(video.id, 2, ''))
      video.addPart(makePart(video.id, 3, ''))

      const { batch, nextPartNumber } = video.getPendingPartsBatch(2)
      expect(batch.length).toBe(2)
      expect(nextPartNumber).toBe(3)
    })
  })

  describe('assignUrlToPart()', () => {
    it('should assign url to existing part', () => {
      const video = makeVideo()
      video.addPart(makePart(video.id, 1, ''))
      const result = video.assignUrlToPart(1, 'https://new-url')
      expect(result.isSuccess).toBe(true)
      expect(video.parts[0].url).toBe('https://new-url')
    })

    it('should fail when part does not exist', () => {
      const video = makeVideo()
      const result = video.assignUrlToPart(999, 'url')
      expect(result.isFailure).toBe(true)
      expect(result.error.message).toContain('Part 999 not found')
    })
  })

  describe('setStorageMetadata()', () => {
    it('should set third-party video integration metadata', () => {
      const video = makeVideo()
      const result = video.setStorageMetadata({
        uploadId: 'upload-123',
        storagePath: 'bucket/path/to/video.mp4',
      })
      expect(result.thirdPartyVideoIntegration).toBeDefined()
      expect(result.thirdPartyVideoIntegration.uploadId).toBe('upload-123')
    })
  })

  describe('withIntegration()', () => {
    it('should set integration on the video', () => {
      const video = makeVideo()
      const integration = ThirdPartyIntegration.create()
      const result = video.withIntegration(integration)
      expect(result.integration).toBe(integration)
    })
  })
})
