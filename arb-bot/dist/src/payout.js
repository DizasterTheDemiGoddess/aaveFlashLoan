import { CONFIG } from "./config";
// Placeholder: In production, integrate Thorchain or CEX off-ramp.
export async function payoutToBtcIfEnabled(provider, signer, amountWei) {
    if (!CONFIG.payoutToBtc)
        return { skipped: true };
    if (!CONFIG.btcAddress)
        throw new Error("BTC_ADDRESS not configured");
    // Strategy suggestion:
    // 1) Swap WETH -> WBTC on-chain
    // 2) Bridge WBTC->BTC via Thorchain Router (contract call)
    // Due to environment specificity, this is left as an integration hook.
    return { skipped: true };
}
