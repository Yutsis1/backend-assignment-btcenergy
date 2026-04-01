# Appendix A — Address Functionality Extension

## A.1 Purpose

This appendix extends the service with Bitcoin address-level energy consumption queries based on the Blockchain.com address endpoint:

`GET https://blockchain.info/rawaddr/{bitcoin_address}`

The goal is to provide energy-consumption results for transactions associated with a specific Bitcoin address, while preserving:
- deterministic calculation
- minimal upstream API calls
- cache-first behavior
- serverless compatibility

## A.2 Endpoint Notes

Address endpoint:
`GET https://blockchain.info/rawaddr/{bitcoin_address}`

Supported address input forms:
- base58 address
- hash160

Query parameters:
- `limit` optional, default `50`, maximum `50`
- `offset` optional

## A.3 Scope of Address Queries

Supported:
- energy calculation for address transactions
- range-based filtering
- pagination support
- caching

Out of scope:
- UTXO attribution modeling
- ownership clustering
- multi-address wallets
- mempool analytics (unless extended)

## A.4 Energy Model

- `energyPerByteWh = 4560`
- `transactionEnergyWh = tx.size * energyPerByteWh`

Rule:
- full transaction energy is attributed to the address

## A.5 Query Types

### Address Consumption

Input:
{
  "address": "string"
}

### Address Range Consumption

Input:
{
  "address": "string",
  "fromTimestampMs": 0,
  "toTimestampMs": 0
}

### Address Summary

Input:
{
  "address": "string",
  "limit": 50,
  "offset": 0
}

## A.6 Processing Rules

- paginate using limit/offset
- deduplicate by tx.hash
- convert timestamps to ms
- filter: from <= t < to

## A.7 Caching

Keys:
- addr:{address}:limit:{limit}:offset:{offset}
- calc:addr:{address}
- calc:addr:{address}:range:{from}:{to}

## A.8 API Extensions

BlockchainApiClient:
- getAddressPage(address, limit, offset)

ConsumptionService:
- getAddressConsumption(address)
- getAddressRangeConsumption(address, from, to)
- getAddressSummary(address, limit, offset)

## A.9 GraphQL Extension

Types for:
- AddressConsumptionResult
- AddressRangeConsumptionResult
- AddressSummaryPageResult

## A.10 Errors

- INVALID_ADDRESS
- ADDRESS_NOT_FOUND
- UPSTREAM_ADDRESS_API_ERROR

## A.11 Testing

Unit:
- pagination
- filtering
- aggregation

Integration:
- caching behavior
- multi-page fetch

System:
- real API validation

## A.12 Fixtures

- address-page-1.json
- address-page-2.json
- address-single-page.json

## A.13 Open Decisions

- attribution model
- unconfirmed tx handling
- result size limits
