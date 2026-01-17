import { DefaultEntity } from '@core/domain/entity/default-entity'
import { UniqueEntityID } from '@modules/video-processor/domain/value-objects/unique-entity-id.vo'

export type IntegrationType = 's3'

export class ThirdPartyIntegration extends DefaultEntity {
  readonly provider: IntegrationType

  constructor() {
    super(UniqueEntityID.create())
    this.provider = 's3'
  }
}
