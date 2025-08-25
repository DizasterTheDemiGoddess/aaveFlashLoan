import { ethers } from "ethers";
import { CONFIG } from "./config";
import { buildProvider, TwoDexScanner } from "./scanner";
import { Executor } from "./executor";

async function main() {
  const provider = buildProvider();
  const signer = new ethers.Wallet(CONFIG.privateKey || "0x0000000000000000000000000000000000000000000000000000000000000001", provider);

  const flashArbAddress = process.env.FLASH_ARB_ADDRESS;
  if (!flashArbAddress) {
    console.error("Missing FLASH_ARB_ADDRESS env var");
    process.exit(1);
  }

  const scanner = new TwoDexScanner(provider);
  const executor = new Executor(provider, signer, flashArbAddress);

  const oneShot = (process.env.ONE_SHOT || "false").toLowerCase() === "true";

  do {
    try {
      const opp = await scanner.findOpportunity();
      if (opp) {
        const size = opp.amountIn;
        const premium = (size * BigInt(CONFIG.flashloanPremiumBps)) / 10000n;
        const roundTrip = opp.amountOutOnB;
        let gasCostWei = 0n;
        if (CONFIG.gasPriceGwei) {
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
      } else {
        console.log("No opportunity found in this scan.");
      }
    } catch (e) {
      console.error("loop error", e);
    }
    if (oneShot) break;
    await new Promise((r) => setTimeout(r, 2000));
  } while (true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

