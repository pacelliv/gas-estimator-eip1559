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
