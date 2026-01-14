import { Result } from '@core/domain/result'
import { DatabaseExecutionError } from '@core/errors/database.error'
import { DataSource } from '@core/libs/database/datasource'

export type InsertEntity<T> = {
  table: string
  data: Partial<T>
}

export type UpdateEntity<T> = {
  table: string
  data: Partial<T>
  where: Partial<T>
}

export abstract class DefaultDatabase {
  constructor(protected readonly datasource: DataSource) {}

  protected prepareInsert<T>(entity: InsertEntity<T>) {
    const columns = Object.keys(entity.data)
    const values = Object.values(entity.data)
    const placeholders = columns.map(() => '?').join(', ')

    return {
      query: `INSERT INTO ${entity.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    }
  }

  protected prepareUpdate<T>(entity: UpdateEntity<T>) {
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

  async insert<T>(
    entity: InsertEntity<T>,
  ): Promise<Result<void, DatabaseExecutionError>> {
    const { query, values } = this.prepareInsert(entity)
    const result = await this.datasource.execute(query, values)
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }

  async update<T>(
    entity: UpdateEntity<T>,
  ): Promise<Result<void, DatabaseExecutionError>> {
    const { query, values } = this.prepareUpdate(entity)
    const result = await this.datasource.execute(query, values)
    return result.isSuccess ? Result.ok(undefined) : Result.fail(result.error)
  }
}
