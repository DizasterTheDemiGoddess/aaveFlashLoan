import { ethers } from "ethers";
import { CONFIG } from "./config";

const V2_ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"
];

const V3_QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

export type Quote = {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutOnA: bigint;
  amountOutOnB: bigint;
  routerA: string;
  routerB: string;
  isV3OnB: boolean;
  v3Fee: number;
};

export class TwoDexScanner {
  private provider: ethers.JsonRpcProvider;
  private v2: ethers.Contract;
  private v3q: ethers.Contract;

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.v2 = new ethers.Contract(CONFIG.addresses.UNISWAP_V2_ROUTER, V2_ROUTER_ABI, provider);
    this.v3q = new ethers.Contract(CONFIG.addresses.UNISWAP_V3_QUOTER, V3_QUOTER_ABI, provider);
  }

  async quoteV2(amountIn: bigint, path: string[]): Promise<bigint> {
    const amounts: bigint[] = await this.v2.getAmountsOut(amountIn, path);
    return amounts[amounts.length - 1];
  }

  async quoteV3(amountIn: bigint, tokenIn: string, tokenOut: string, fee: number): Promise<bigint> {
    const out: bigint = await this.v3q.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
    return out;
  }

  async getQuoteWethWbtc(amountIn: bigint): Promise<Quote | null> {
    const weth = CONFIG.addresses.WETH;
    const wbtc = CONFIG.addresses.WBTC;
    if (!weth || !wbtc) return null;

    // A: V2 WETH->WBTC
    const outA = await this.quoteV2(amountIn, [weth, wbtc]);
    // B: V3 WBTC->WETH (3000 fee tier default)
    const outB = await this.quoteV3(outA, wbtc, weth, 3000);

    return {
      tokenIn: weth,
      tokenOut: weth,
      amountIn,
      amountOutOnA: outA,
      amountOutOnB: outB,
      routerA: CONFIG.addresses.UNISWAP_V2_ROUTER,
      routerB: CONFIG.addresses.UNISWAP_V3_ROUTER,
      isV3OnB: true,
      v3Fee: 3000,
    };
  }

  async findOpportunity(): Promise<Quote | null> {
    const sizes = [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("5")];
    for (const size of sizes) {
      try {
        const q = await this.getQuoteWethWbtc(size);
        if (!q) continue;
        // Expected final amount in WETH after round trip
        const roundTrip = q.amountOutOnB;
        const premium = (size * BigInt(CONFIG.flashloanPremiumBps)) / 10000n;
        const expectedProfit = roundTrip - size - premium;
        if (expectedProfit > CONFIG.minProfitWei) {
          return q;
        }
      } catch {
        // ignore size failures
      }
    }
    return null;
  }
}

export function buildProvider(): ethers.JsonRpcProvider {
  const url = CONFIG.rpcs[CONFIG.chain];
  if (!url) throw new Error(`Missing RPC for ${CONFIG.chain}`);
  return new ethers.JsonRpcProvider(url);
}

