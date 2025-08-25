require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETH_RPC_URL = process.env.ETH_RPC_URL || "";
const ARB_RPC_URL = process.env.ARB_RPC_URL || "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "";

const hardhatNet = {};
if (ETH_RPC_URL) {
	// only add forking if provided
	hardhatNet.forking = { url: ETH_RPC_URL };
}

const networks = { hardhat: hardhatNet };
if (ETH_RPC_URL) {
	networks.mainnet = { url: ETH_RPC_URL, accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [] };
}
if (ARB_RPC_URL) {
	networks.arbitrum = { url: ARB_RPC_URL, accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [] };
}
if (BASE_RPC_URL) {
	networks.base = { url: BASE_RPC_URL, accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [] };
}

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
	solidity: {
		version: "0.8.24",
		settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
	},
	networks,
	etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "" },
	paths: {
		sources: "contracts",
		tests: "test",
		cache: "cache",
		artifacts: "artifacts",
	},
};

module.exports = config;

