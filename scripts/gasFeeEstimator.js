const { ethers } = require("hardhat")
const { quantile, mean, sum } = require("../utils/helperFunctions.js")

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
        console.log("Manuel estimate:", {
            slow: baseFeePerGas + slowMaxPriorityFee,
            average: baseFeePerGas + averageMaxPriorityFee,
            fast: baseFeePerGas + fastMaxPriorityFee,
        })
    })
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
        gasUsedRatio: gasUsed.toNumber() / gasLimit.toNumber(), // gasUsedRatio represents how full was the block
    }
}

gasEstimator()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
