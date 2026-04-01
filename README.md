# Backend Engineer Technical Assignment
## Introduction
This assessment aims to assess the technical, analytical, and collaboration skills of
the candidates for backend development positions in Sensorfact.

In this assignment, we included a few of the technologies that we use in our
existing products:

- **GraphQL:**
- **TypeScript:**

## Problem to solve (an imaginary one, of course ;)

Sustainability is starting to take a key role in every product or solution launched into the market, and software
systems are not an exception. It is not enough anymore to create and deploy in time complex and innovative
systems which bring value to customers; they also need to be efficient. They need to
be sustainable and consume the minimum amount of resources in their operations.

As you probably have heard, one of the principal arguments against using Bitcoin is the amount of energy needed to keep
the system running. To evaluate the sustainability of the blockchain network in which Bitcoin runs, we
want to create a platform to monitor the energy spent on financial transactions using Bitcoin.

The platform will visualize the energy consumed by the network and potentially calculate energy waste. Our frontend
development team will need an API (preferably GraphQL) to connect to which will provide this information. The platform should
be able to perform the following operations (already sorted by priority):

- Provide the energy consumption per transaction for a specific block.
- Provide the total energy consumption per day in the last `x` number of days.
- Advanced Feature: Optimize the number of calls made to the Blockchain API to avoid asking for the
  same information multiple times.
- Expert Feature: Provide the total energy consumption of all transactions performed by a specific wallet address.

Even if it is too soon in the product's lifetime to think about non-functional requirements, it will be beneficial to
build it considering that we hope to scale the solution and avoid significant refactoring.

## Assumptions

**- You can use a simple model of the BTC network: the network is composed of blocks (each block identified by a unique `hash` value
or a block index). Each block contains a set of transactions, each transaction also has a unique `hash` by which it can be identified.**
- Every transaction takes up a variable amount of storage space inside the block, indicated by the `size` field (in bytes).
- Assume that the energy cost per byte is 4,56 KwH.
- You can use the public Blockchain API from blockchain.com to retrieve information
  (https://www.blockchain.com/explorer/api/blockchain_api), for example:
    - Latest block: https://blockchain.info/latestblock
    - Information of blocks in a day: https://blockchain.info/blocks/$time_in_milliseconds?format=json
    - Information of a single block: https://blockchain.info/rawblock/$block_hash
    - Information of a single transaction: https://blockchain.info/rawtx/$tx_hash
    - Information on transactions for a specific wallet address: https://blockchain.info/rawaddr/$bitcoin_address

## Running the project
Requirements:
- NodeJS 20.x (run `nvm use` in root folder)
- Yarn cli

Install dependencies:

```sh
yarn
```

Run the serverless function in offline mode:

```sh
yarn start
```

The server will be ready at: `http://localhost:4000/graphql`

## Fetching data from the service

The API is exposed through GraphQL at:

`http://localhost:4000/graphql`

You can query it from GraphQL Playground, Postman, Insomnia, or cURL.

### Example 1: energy consumption for a single block

```sh
curl -X POST http://localhost:4000/graphql \
   -H "Content-Type: application/json" \
   -d '{
      "query": "query($blockHash: String!) { blockConsumption(blockHash: $blockHash) { blockHash blockTimeMs transactionCount totalTransactionEnergyWh totalTransactionEnergykWh transactions { txHash timestampMs sizeBytes energyWh } } }",
      "variables": {
         "blockHash": "00000000000000000000c191f7765901b21c1e2e222b1e1b7817d8fdac6202ea"
      }
   }'
```

### Example 2: total energy in a time range

```sh
curl -X POST http://localhost:4000/graphql \
   -H "Content-Type: application/json" \
   -d '{
      "query": "query($from: String!, $to: String!) { rangeConsumption(fromTimestampMs: $from, toTimestampMs: $to) { fromTimestampMs toTimestampMs blockHashes transactionCount totalTransactionEnergyWh totalTransactionEnergykWh } }",
      "variables": {
         "from": "1774036800000",
         "to": "1774037100000"
      }
   }'
```

### Example 3: total energy for a wallet address

```sh
curl -X POST http://localhost:4000/graphql \
   -H "Content-Type: application/json" \
   -d '{
      "query": "query($address: String!) { addressConsumption(address: $address) { address totalEnergyWh transactions { txHash timestampMs sizeBytes energyWh } } }",
      "variables": {
         "address": "bc1qlxjxptt4scqylcteyskvkwhy78rzaezffta3rnkhzag47wmknrhqejq8kp"
      }
   }'
```
Seems that the endpoint for wallet adresses has a daily quota and it blocks further request, so success for that request is low. I couldn't fetch consumption for wallet with more than 150 transactions which means 3 requests for pages. 

## Documentation and rationale

The full specification and rationale for calculations, API behavior, assumptions, and cache strategy are in:

- `docs/SPECv1.md`
- `docs/SPECv1_address_appendix.md`

These docs are also intended to be used as reference material for code agents.

## Running tests

Run all unit tests:

```sh
yarn test
```

Run tests in watch mode:

```sh
yarn test:watch
```

