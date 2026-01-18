import { DefaultEntity } from '@core/domain/entity/default-entity'
import { UniqueEntityID } from '@core/domain/value-objects/unique-entity-id.vo'

export type IntegrationType = 's3'

export class ThirdPartyIntegration extends DefaultEntity {
  readonly provider: IntegrationType

  private constructor() {
    super(UniqueEntityID.create())
    this.provider = 's3'
  }

  static create(): ThirdPartyIntegration {
    return new ThirdPartyIntegration()
  }
}
