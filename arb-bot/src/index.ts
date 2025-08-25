import { ethers } from "ethers";
import { CONFIG } from "./config";
import { buildProvider, TwoDexScanner } from "./scanner";
import { Executor } from "./executor";

async function main() {
  const provider = buildProvider();
  const signer = new ethers.Wallet(CONFIG.privateKey, provider);

  const flashArbAddress = process.env.FLASH_ARB_ADDRESS;
  if (!flashArbAddress) {
    console.error("Missing FLASH_ARB_ADDRESS env var");
    process.exit(1);
  }

  const scanner = new TwoDexScanner(provider);
  const executor = new Executor(provider, signer, flashArbAddress);

  while (true) {
    try {
      const opp = await scanner.findOpportunity();
      if (opp) {
        const size = opp.amountIn;
        const premium = (size * BigInt(CONFIG.flashloanPremiumBps)) / 10000n;
        const roundTrip = opp.amountOutOnB;
        let gasCostWei = 0n;
        if (CONFIG.gasPriceGwei) {
          // rough constant gas budget; refine with estimator when executing
          gasCostWei = ethers.parseUnits(String(CONFIG.gasPriceGwei), "gwei") * 600000n;
        }
        const net = roundTrip - size - premium - gasCostWei;
        if (net > CONFIG.minProfitWei) {
          console.log("Executing with expected net profit wei:", net.toString());
          const params = executor.buildArbParams({});
          const receipt = await executor.initiate(opp.amountIn, opp.tokenIn, params);
          console.log("Executed, receipt:", receipt?.hash);
        } else {
          console.log("Skipping, net insufficient:", net.toString());
        }
      }
    } catch (e) {
      console.error("loop error", e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

