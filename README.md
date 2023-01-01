# EIP-1559 Gas Estimator with Hardhat and Ethers.js

## Overview

Most dApps offer to their users the choice to select their gas fee bids with a "slow", "average" and "fast" options. These options represent the amount of gas you will offer to miners to include your transaction in a block -- the higher the bid, the quicker the transaction will be mined.

Users will consider different gas bids depending on the relevance of the transaction, for that reason is important to offer a range of options to satisfy all needs.

In this project we will build a gas estimator that complies with [EIP-1559](https://www.youtube.com/watch?v=MGemhK9t44Q) using Hardhat development framework and Ethers.js library. This gas estimator will make API calls to collect and track fee data from the network to programatically estimate different fee bids to include in a transaction.

## Setting up the project

For this tutorial is required that you should already know how to setup a Hardhat project and the basics of the framework. If not, please follow this [tutorial](https://github.com/pacelliv/hardhat-deploy-tutorial) and come back.

Let's setup the project. Run the following commands:

```
mkdir gas-estimator
cd gas-estimator
yarn init --yes
```

After initializing yarn, let's install `@nomicfoundation/hardhat-toolbox`. This plugin brings all necessary tools to create a robust development environment for this tutorial and more.

To install the toolbox in your project paste and run the following command in your terminal:

```
yarn add -D hardhat @nomicfoundation/hardhat-toolbox @nomicfoundation/hardhat-network-helpers @nomicfoundation/hardhat-chai-matchers @nomiclabs/hardhat-ethers @nomiclabs/hardhat-etherscan chai ethers hardhat-gas-reporter solidity-coverage @typechain/hardhat typechain @typechain/ethers-v5 @ethersproject/abi @ethersproject/providers prettier dotenv
```

After intallation of the plugin create a `hardhat.config.js` file in your project root directory and paste the following content: 

```javascript
require("@nomicfoundation/hardhat-toolbox")
require("dotenv").config()

const MAINNET_RPC_URL =
    process.env.ALCHEMY_MAINNET_RPC_URL ||
    "https://eth-mainnet.alchemyapi.io/v2/your-api-key"

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    networks: {
        mainnet: {
            url: MAINNET_RPC_URL,
        },
    },
}
```
As you can see, in this project we use environment variables to handle our keys. See the `.env-example` file to see what you should put in your `.env` file. **Never use a private key associated with real funds for testing purposes, create a new wallet and import the private key**.

For this tutorial to interact with Ethereum network we need a RPC URL, which is a point to which we can connect and make API calls to interact with the blockchain, [Alchemy](https://www.alchemy.com/) offer free RPC url so go there and get one.

To complete the structure of the project create a `.prettierc`, `.prettierignore` and `.gitignore` files and paste in them the contents that appear in the repo of the tutorial.

## Building the gas estimator

### EIP-1559

Before the London Fork, the gas price calculators used a gas price of the previous blocks to estimate the spread of bid users had to offer to miners to have their transactions included in blocks. After the fork, the gas prices are split into base fee and priority fees. Since the base fee is set at protocol level for each block, we only need to estimate how much fee we have to bid as priority fee or tips to the miners.

### Important metrics

To get a better understanding of how `EIP-1559` affects gas prices, we need to know (a) how full was the previous block and (b) how much did transactions paid as fees.

The answers to these questions will help us determine how much to bid to miners to have our transactions be included in the pending block.

### Helper functions

To simplify things, let's create a couple of new folders and paste some code and then we will explain them. 

For our gas estimator to perform its tasks appropiately, we need a few helper functions that will handle some of the math to help our estimator.

Create a new folder named `utils` and in it create a file with the name `helperFunctions.js` and paste the following content:

```javascript

const asc = (arr) => arr.sort((a, b) => a - b) // sorts the arrays in a ascending order
const sum = (arr) => arr.reduce((a, b) => a + b, 0) // sums the elements of the array
const mean = (arr) => Math.round(sum(arr) / arr.length) // gets the mean

// calculates the percentiles of the values of an array
const quantile = (arr, q) => {
    const sorted = asc(arr)
    const pos = (sorted.length - 1) * q
    const base = Math.floor(pos)
    const rest = pos - base
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base])
    } else {
        return sorted[base]
    }
}

module.exports = {
    quantile,
    mean,
    sum
}
```
Feel free the comments to know what are the tasks of these functions and let's continue.

### Gas estimator functions

Now let's create a new folder named `scripts` and in it create a new file named `gasEstimator.js` and paste the code you see below. 

In this file we will make a few API calls to get fee and block data to have more in-depth study of the metrics.

```javascript
const { ethers } = require("hardhat")
const { quantile,mean, sum } = require("../utils/helperFunctions.js")

async function gasEstimator() {
    const blockNumber = await ethers.provider.getBlockNumber()
    const blocks = []
    for (let i = blockNumber; i > blockNumber - 4; i--) {
        blocks.push(
            dataFormatter(await ethers.provider.getBlockWithTransactions(i))
        )
    }

    console.log(blocks)
}

function dataFormatter(blocks) {
    const { number, baseFeePerGas, gasUsed, gasLimit, transactions } = blocks

    const maxPriorityFeePerGasArray = transactions
        .filter((tx) => tx.type === 2)
        .map((tx) => tx.maxPriorityFeePerGas.toNumber())

    const q30 = quantile(maxPriorityFeePerGasArray, 0.3)
    const q60 = quantile(maxPriorityFeePerGasArray, 0.6)
    const q90 = quantile(maxPriorityFeePerGasArray, 0.9)

    return {
        number: number,
        baseFeePerGas: baseFeePerGas.toNumber(),
        maxPriorityFeePerGas: [q30, q60, q90],
        gasUsedRatio: gasUsed.toNumber() / gasLimit.toNumber(), // represents how full was the block
    }
}

gasEstimator()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
```

Our `gasEstimator.js` file consist of two functions:

- `gasEstimator`: makes API calls to the network to collect block and fee raw data from the previous 4 blocks, and pass this data to `dataFormatter`.
- `dataFormatter`: receives the the raw data from `gasEstimator` function, it filters the transactions of `Txn Type: 2 (EIP-1559)` and mapped them in new arrays, calls `quantile` (see code below) to get the 30th, 60th and 90% percentiles of `maxPriorityFeePerGas` paid in transactions and finally creates new objects to send back formatted data back to `gasEstimator`.

### Relationship between `gasUsedRatio` and `baseFeePerGas`

After setting up our `gasEstimator` and `helperFunctions`, we can cover this important relationship, which is the central point of `EIP-1559`, to do this run the following command:

```
yarn hardhat run scripts/gasFeeEstimator.js --network mainnet
```

The result should look something similar to this:

```
[
  {
    number: 16308999,
    baseFeePerGas: 13969109554,
    maxPriorityFeePerGas: [ 1500000000, 2000000000, 4414699129.800012 ],
    gasUsedRatio: 0.66342
  },
  {
    number: 16309000,
    baseFeePerGas: 14539817524,
    maxPriorityFeePerGas: [ 1500000000, 1500000000, 2000000000 ],
    gasUsedRatio: 0.276676
  },
  {
    number: 16309001,
    baseFeePerGas: 13728044972,
    maxPriorityFeePerGas: [ 1500000000, 1899999999.9999986, 2500000000 ],
    gasUsedRatio: 0.2860559
  },
  {
    number: 16309002,
    baseFeePerGas: 12993786416,
    maxPriorityFeePerGas: [ 1500000000, 1500000000, 2500000000 ],
    gasUsedRatio: 0.9069658333333334
  }
]
```
Let's analyze the results:

In Ethereum, blocks have a target of `15,000,000` gas and a `gasLimit` of `30,000,000` gas, depending on how full the previous block was, at protocol level the `baseFeePerGas` is either increased or decreased accordingly.

Block 16308999 was 66% full which is 16% above the target of 50%, this means that for the next block the `baseFeePerGas` will be increased by approximately a 12.5% ratio and that's what happened -- the base fee increased from 13969109554 to 14539817524 for block 16309000. The opposite the occured for block 16309001, since block 16309000 was 27.66% full, the base fee decreased by a 12.5% ratio from 14539817524 to 13728044972.

## Giving estimates

Let's start giving estimates to users, now modify your `gasEstimator` function and make it look like this:

```javascript
async function gasEstimator() {
    const blockNumber = await ethers.provider.getBlockNumber()
    const blocks = []
    for (let i = blockNumber - 4; i < blockNumber; i++) {
        blocks.push(
            dataFormatter(await ethers.provider.getBlockWithTransactions(i))
        )
    }

    // we create a new array with only the 30th maxPriorityFeePerGas percentile
    const slowMaxPriorityFee = blocks.map(
        (block) => block.maxPriorityFeePerGas[0]
    )

    // we add the values
    const firtPercentilesSum = sum(slowMaxPriorityFee)

    // we give our estimes for the 30th percentile
    console.log(
        "Manual estimate:",
        firtPercentilesSum / slowMaxPriorityFee.length
    )

    // we get the recomended value by the network for comparison
    console.log(
        "Recommended value by the network:",
        (await ethers.provider.getFeeData()).maxPriorityFeePerGas.toNumber()
    )
}
```

If you run: 

```
yarn hardhat run scripts/gasFeeEstimator.js --network mainnet
```

The output should look like this:

```
Manual estimate 1045851079
Recommended value by the network: 1500000000
```

Our estimator recommended a priority fee of 1045851079 wei, which represents approximately a 30% in saved gas from the recommended value from the network. This is not a bad estimation.


### Presenting the three options with full estimates

So far we've only made an estimation for the `maxPriorityFeePerGas` that the user should bid, but users usually are more interested in knowing the maximum amount of fee they will have to pay and not just the tip. The value that represents the full fee to pay is the `maxFeePerGas` which value is the sum of the `maxPriorityFeePerGas` and the `baseFeePerGas`.

Now let's present to the users the full fee to pay and the `slow`, `average` and `fast` options they might consider to bid.

We need to refactor our `gasEstimator` agan, make it look like this:

```javascript
async function gasEstimator() {
    const blockNumber = await ethers.provider.getBlockNumber()
    const blocks = []
    for (let i = blockNumber - 4; i < blockNumber; i++) {
        blocks.push(
            dataFormatter(await ethers.provider.getBlockWithTransactions(i))
        )
    }

    const slowMaxPriorityFee = mean(
        blocks.map((block) => block.maxPriorityFeePerGas[0])
    )

    const averageMaxPriorityFee = mean(
        blocks.map((block) => block.maxPriorityFeePerGas[1])
    )

    const fastMaxPriorityFee = mean(
        blocks.map((block) => block.maxPriorityFeePerGas[2])
    )

    await ethers.provider.getBlock("pending").then((block) => {
        const baseFeePerGas = block.baseFeePerGas.toNumber()
        console.log({
            slow: baseFeePerGas + slowMaxPriorityFee,
            average: baseFeePerGas + averageMaxPriorityFee,
            fast: baseFeePerGas + fastMaxPriorityFee,
        })
    })
}
```

Run again: `yarn hardhat run scripts/gasFeeEstimator.js --network mainnet`

The result:

```
Manual estimate: { slow: 14271043641, average: 14396043641, fast: 15146143641 }
```

## Outro ⭐️

Congratulations 💯 for completing this tutorial, it was fun building this estimator, but it might not be viable for production. Running these calculations for personal purposes might work but serving an app that handle thousands of transactions per second might not result in good performance.

Usually clients like Geth use entities called "Oracles" whose only job is keeping track of blocks and other data. Geth will ask the Oracle for a current estimate of the fees and get a immediate answer.

Despite not being a estimator for production, we learned a lot about how the EVM works regarding fees.

I hope you enjoyed this tutorial and I encouraged you to make your own modifications and try new things. 👩🏻‍💻 🎉 👨🏻‍💻 🎉