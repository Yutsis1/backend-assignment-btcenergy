export interface TransactionConsumption {
  txHash: string
  timestampMs: number
  sizeBytes: number
  energyWh: number,
}

export interface BlockConsumptionResult {
  blockHash: string
  blockTimeMs: number
  transactionCount: number
  totalTransactionEnergyWh: number
  transactions: TransactionConsumption[],
  range?: { from: number; to: number } // Optional field to indicate the time range considered for the block consumption
}


export interface RangeConsumptionResult {
  range: { from: number; to: number }
  blockHashes: string[]
  totalRangeEnergyWh: number
  blockConsumptions?: BlockConsumptionResult[]
}

export interface AddressConsumptionResult {
  address: string
  totalEnergyWh: number
  transactions: TransactionConsumption[]
}
