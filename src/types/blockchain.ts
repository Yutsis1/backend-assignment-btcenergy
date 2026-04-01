export interface BlockchainTransactionPayload {
  hash: string
  size: number
  time: number
}

export interface BlockchainAddressPagePayload {
  address: string
  hash160?: string | unknown
  n_tx: number // to keep contract with the API response
  txs: BlockchainTransactionPayload[]
  limit: number
  offset: number
}

export interface BlockchainDayBlockSummary {
  hash: string
  time: number
}

export interface BlockchainBlockPayload {
  hash: string
  time: number
  tx: BlockchainTransactionPayload[]
}
