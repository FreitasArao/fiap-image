import { Result } from '@core/domain/result'
import { DatabaseExecutionError } from '@core/errors/database.error'
import { DataSource } from '@core/libs/database/datasource'
import { AbstractLoggerService } from '@core/libs/logging/abstract-logger'

export type InsertEntity<T> = {
  table: string
  data: Partial<T>
}

export type UpdateEntity<T> = {
  table: string
  data: Partial<T>
  where: Partial<T>
}

export type SelectEntity<T> = {
  table: string
  where: Partial<T>
  columns?: (keyof T)[]
}

export abstract class DefaultDatabase {
  constructor(
    protected readonly datasource: DataSource,
    protected readonly logger: AbstractLoggerService,
  ) {}

  protected prepareInsert<T>(entity: InsertEntity<T>) {
    this.logger.log('Preparing insert', { entity })
    const columns = Object.keys(entity.data)
    const values = Object.values(entity.data)
    const placeholders = columns.map(() => '?').join(', ')

    return {
      query: `INSERT INTO ${entity.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    }
  }

  protected prepareUpdate<T>(entity: UpdateEntity<T>) {
    this.logger.log('Preparing update', { entity })
    const setCols = Object.keys(entity.data)
    const setValues = Object.values(entity.data)

    const whereCols = Object.keys(entity.where)
    const whereValues = Object.values(entity.where)

    const setClause = setCols.map((c) => `${c} = ?`).join(', ')
    const whereClause = whereCols.map((c) => `${c} = ?`).join(' AND ')

    return {
      query: `UPDATE ${entity.table} SET ${setClause} WHERE ${whereClause}`,
      values: [...setValues, ...whereValues],
    }
  }

  protected prepareSelect<T>(entity: SelectEntity<T>) {
    this.logger.log('Preparing select', { entity })
    const columns = entity.columns
      ? (entity.columns as string[]).join(', ')
      : '*'
    const whereCols = Object.keys(entity.where)
    const whereValues = Object.values(entity.where)
    const whereClause = whereCols.map((c) => `${c} = ?`).join(' AND ')

    return {
      query: `SELECT ${columns} FROM ${entity.table} WHERE ${whereClause}`,
      values: whereValues,
    }
  }

  async insert<T>(
    entity: InsertEntity<T>,
  ): Promise<Result<void, DatabaseExecutionError>> {
    this.logger.log('Inserting entity', { entity })
    const { query, values } = this.prepareInsert(entity)
    const result = await this.datasource.execute(query, values)
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async update<T>(
    entity: UpdateEntity<T>,
  ): Promise<Result<void, DatabaseExecutionError>> {
    this.logger.log('Updating entity', { entity })
    const { query, values } = this.prepareUpdate(entity)
    const result = await this.datasource.execute(query, values)
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async select<T>(
    entity: SelectEntity<T>,
  ): Promise<Result<T[], DatabaseExecutionError>> {
    this.logger.log('Selecting entities', { entity })
    const { query, values } = this.prepareSelect(entity)
    const result = await this.datasource.query<T>(query, values)
    return result.isSuccess
      ? Result.ok(result.value)
      : Result.fail(result.error)
  }
}
