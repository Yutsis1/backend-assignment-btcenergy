export type NumericApiValue = string | number

export interface TransactionConsumptionApi {
  txHash: string
  timestampMs: NumericApiValue
  sizeBytes: NumericApiValue
  energyWh: NumericApiValue
}

export interface BlockConsumptionApi {
  blockHash: string
  blockTimeMs: NumericApiValue
  transactionCount: number
  totalTransactionEnergyWh: NumericApiValue
  transactions: TransactionConsumptionApi[]
}

export interface BlockConsumptionQueryResult {
  blockConsumption: BlockConsumptionApi | null
}

export interface RangeTransactionConsumptionApi {
  txHash: string
  blockHash: string
  timestampMs: NumericApiValue
  sizeBytes: NumericApiValue
  energyWh: NumericApiValue
}

export interface RangeConsumptionApi {
  fromTimestampMs: NumericApiValue
  toTimestampMs: NumericApiValue
  blockHashes: string[]
  transactionCount: number
  totalTransactionEnergyWh: NumericApiValue
  transactions: RangeTransactionConsumptionApi[]
}

export interface RangeConsumptionQueryResult {
  rangeConsumption: RangeConsumptionApi | null
}
