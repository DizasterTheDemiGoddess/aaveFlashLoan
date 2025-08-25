import * as dotenv from "dotenv";
dotenv.config();
export const CONFIG = {
    privateKey: process.env.PRIVATE_KEY || "",
    chain: process.env.CHAIN || "mainnet",
    usePrivateRpc: (process.env.USE_PRIVATE_RPC || "true").toLowerCase() === "true",
    slippageBps: Number(process.env.SLIPPAGE_BPS || 30),
    minProfitWei: BigInt(process.env.MIN_PROFIT_WEI || "0"),
    gasPriceGwei: process.env.GAS_PRICE_GWEI ? Number(process.env.GAS_PRICE_GWEI) : undefined,
    flashloanPremiumBps: Number(process.env.FLASHLOAN_PREMIUM_BPS || 5),
    payoutToBtc: (process.env.PAYOUT_TO_BTC || "true").toLowerCase() === "true",
    btcAddress: process.env.BTC_ADDRESS || "",
    addresses: {
        AAVE_POOL: process.env.AAVE_POOL || "",
        UNISWAP_V2_ROUTER: process.env.UNISWAP_V2_ROUTER || "",
        UNISWAP_V3_ROUTER: process.env.UNISWAP_V3_ROUTER || "",
        UNISWAP_V3_QUOTER: process.env.UNISWAP_V3_QUOTER || "",
        WETH: process.env.WETH_ADDRESS || "",
        WBTC: process.env.WBTC_ADDRESS || ""
    },
    rpcs: {
        mainnet: process.env.ETH_RPC_URL || "",
        arbitrum: process.env.ARB_RPC_URL || "",
        base: process.env.BASE_RPC_URL || ""
    }
};
