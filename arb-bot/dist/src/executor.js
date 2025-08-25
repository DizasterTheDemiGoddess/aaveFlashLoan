import { ethers } from "ethers";
import { CONFIG } from "./config";
import FlashArbArtifact from "../artifacts/contracts/FlashArb.sol/FlashArb.json" assert { type: "json" };
export class Executor {
    constructor(provider, signer, flashArbAddress) {
        this.provider = provider;
        this.signer = signer;
        this.flashArbAddress = flashArbAddress;
    }
    buildArbParams(example) {
        const now = BigInt(Math.floor(Date.now() / 1000));
        return {
            routerA: CONFIG.addresses.UNISWAP_V2_ROUTER,
            pathA: [CONFIG.addresses.WETH, CONFIG.addresses.WBTC],
            minOutA: 0n,
            routerB: CONFIG.addresses.UNISWAP_V3_ROUTER,
            isV3: true,
            v3Fee: 3000,
            tokenOutB: CONFIG.addresses.WETH,
            minOutB: 0n,
            minProfit: CONFIG.minProfitWei,
            deadline: now + 120n,
            ...example,
        };
    }
    applySlippage(amount) {
        const bps = BigInt(CONFIG.slippageBps);
        return (amount * (10000n - bps)) / 10000n;
    }
    async initiate(amount, asset, params) {
        const contract = new ethers.Contract(this.flashArbAddress, FlashArbArtifact.abi, this.signer);
        // Derive conservative mins from provided params if they are zero
        const minOutA = params.minOutA === 0n ? this.applySlippage(amount) : params.minOutA;
        const minOutB = params.minOutB === 0n ? this.applySlippage(amount) : params.minOutB;
        const finalParams = { ...params, minOutA, minOutB };
        const gasPrice = CONFIG.gasPriceGwei ? ethers.parseUnits(String(CONFIG.gasPriceGwei), "gwei") : undefined;
        const tx = await contract.initiateFlashArb(asset, amount, finalParams, {
            gasPrice,
        });
        const receipt = await tx.wait();
        return receipt;
    }
}
