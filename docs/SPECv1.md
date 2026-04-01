# Blockchain Energy Consumption API Spec

## 0. Acceptance Criteria
* A single block can be calculated from its hash.
* A time range can be calculated from fromTimestampMs and toTimestampMs.
* Returned totals are mathematically correct.
* Repeated identical requests do not re-fetch identical upstream data unnecessarily.
* The service remains functional when cache is unavailable.

## 1. Purpose

This service provides energy-consumption calculations for Bitcoin blockchain data retrieved from Blockchain.com endpoints. It is implemented as a serverless GraphQL API and supports caching to reduce repeated upstream requests.

## 2. External Data Sources

The service uses these Blockchain.com endpoints:

```
GET https://blockchain.info/rawblock/{blockHash}
GET https://blockchain.info/rawtx/{txHash}
GET https://blockchain.info/blocks/{timestampMs}?format=json
```

Notes:

`blocks/{timestampMs}` expects a millisecond timestamp.
The endpoint returns blocks associated with the requested day window.
Response examples are stored in:
`block-example.json`
`tx-example.json`
`blocks-example.json`
## 3. Scope
Supported functionality
Calculate energy consumption for all transactions in a specific block.
Calculate total energy consumption for transactions within a requested time range.
Minimize repeated Blockchain API calls through caching of upstream responses and calculated results.
### Out of scope
Multi-chain support beyond BTC.
Wallet-level aggregation.
Real-time streaming.
Persisting historical analytics beyond cache lifetime.

## 4. Assumptions
Initial blockchain supported: Bitcoin only.
Energy cost model:
energyPerBytekWh = 4.56
Transaction energy is derived from transaction size:
transactionEnergyWh = tx.size * energyPerBytekWh
Timestamps are handled in milliseconds at the API boundary.
Internally, the service may convert timestamps to seconds where required by upstream payloads.
## 5. API Operations
### 5.1 Block consumption

Returns transaction-level and aggregated energy consumption for a single block.

Input
```
{
  "blockHash": "string"
}
```

Output
```
{
  "blockHash": "string",
  "blockTimeMs": 0,
  "transactionCount": 0,
  "totalTransactionEnergyWh": 0,
  "transactions": [
    {
      "txHash": "string",
      "timestampMs": 0,
      "sizeBytes": 0,
      "energyWh": 0
    }
  ]
}
```
### 5.2 Range consumption

Returns energy consumption for all transactions whose timestamps fall within a requested interval.

Input
```
{
  "fromTimestampMs": 0,
  "toTimestampMs": 0
}
```
Output
```
{
  "fromTimestampMs": 0,
  "toTimestampMs": 0,
  "blockHashes": ["string"],
  "transactionCount": 0,
  "totalTransactionEnergyWh": 0,
  "transactions": [
    {
      "txHash": "string",
      "blockHash": "string",
      "timestampMs": 0,
      "sizeBytes": 0,
      "energyWh": 0
    }
  ]
}
```
## 6. Processing Rules
### 6.1 Range query flow
Receive fromTimestampMs and toTimestampMs.
Determine all day buckets needed to cover the range.
Fetch block lists for those day buckets using blocks/{timestampMs}.
Fetch each block by hash.
Include only transactions whose timestamps satisfy:
fromTimestampMs <= tx.timestampMs < toTimestampMs
Calculate transaction energy using tx.size.
Aggregate total energy across matched transactions.
### 6.2 Block query flow
Receive blockHash.
Fetch block by hash or load it from cache.
Calculate energy for every transaction in the block.
Return transaction list and aggregate totals.
## 7. Caching
### 7.1 Goals
Reduce duplicate external API calls.
Reduce recalculation for identical requests.
Keep cache independent from business logic.
### 7.2 Cacheable entities
Day block lists:
key: blocks:day:{timestampMs}
Raw block payload:
key: block:{blockHash}
Raw transaction payload, if used:
key: tx:{txHash}
Calculated block result:
key: calc:block:{blockHash}
Calculated range result:
key: calc:range:{fromTimestampMs}:{toTimestampMs}
### 7.3 Cache behavior
Cache read is attempted before external fetch.
On cache miss, data is fetched and then stored.
Cache TTL must be configurable.
Cache failures must not fail the request; the service should continue without cache.
Memory Cache only for simplicity
## 8. Error Handling

The service should return structured errors for:

invalid timestamp range
missing block hash
upstream API failure
malformed upstream response
cache unavailability

Example:
```
{
  "code": "UPSTREAM_API_ERROR",
  "message": "Failed to fetch block data",
  "details": {}
}
```
## 9. Non-Functional Requirements
Serverless-compatible
Idempotent read operations
Configurable cache backend
Deterministic calculation results for identical inputs
Minimal upstream API usage for repeated requests
## 10. Test Plan
### 10.1 Unit tests

Pure logic only. No real network. No real cache.

* EnergyCalculator
* calculates transaction energy from sizeBytes
* sums block transaction energy correctly
* returns zero for empty transaction list
* Range filtering
* includes transactions at fromTimestampMs
* excludes transactions at toTimestampMs
* excludes transactions outside the interval
* handles empty result set
* Day bucket resolution
* resolves one day for same-day ranges
* resolves multiple day buckets for cross-day ranges
### 10.2 Integration tests

Run with mocked Blockchain API and mocked/in-memory cache.

* Cache behavior
* first block request fetches upstream and populates cache
* second identical block request uses cache
* repeated day-range request uses cached day block list
* cache TTL expiry triggers refetch
* cache failure falls back to direct fetch
* Service orchestration
* range query fetches only required day buckets
* range query fetches only referenced blocks
* aggregation matches expected fixture result

## 11. GraphQL Contract
``` JavaScript
type Query {
  blockConsumption(blockHash: String!): BlockConsumptionResult!
  rangeConsumption(fromTimestampMs: String!, toTimestampMs: String!): RangeConsumptionResult!
}

type BlockConsumptionResult {
  blockHash: String!
  blockTimeMs: String!
  transactionCount: Int!
  totalTransactionEnergyWh: Number!
  transactions: [TransactionConsumption!]!
}

type RangeConsumptionResult {
  fromTimestampMs: String!
  toTimestampMs: String!
  blockHashes: [String!]!
  transactionCount: Int!
  totalTransactionEnergyWh: Number!
  transactions: [RangeTransactionConsumption!]!
}
```

## 12. Repository Structure
```
src/
  clients/
    blockchain-api.client.ts
  services/
    energy-calculator.service.ts
    consumption.service.ts
  cache/
    cache-store.interface.ts
  graphql/
    schema.ts
    resolvers.ts
  utils/
    day-bucket.ts
    timestamp.ts
tests/
  unit/
  integration/
  fixtures/
```

## 13. Numerical Rules

- Use `energyWh` (1000 W is 1kW)
- Convert time into `ms`
- size in `bytes`
It is easier to convert on client side, but storing should be always in minimal integers.
### 13.1 Timestamp Rules

- API inputs use milliseconds
- Blockchain.com block `time` fields use seconds
- Convert upstream seconds to milliseconds before filtering
- Range interval is inclusive start, exclusive end: `[fromTimestampMs, toTimestampMs)`

