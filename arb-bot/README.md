## Flashloan Arbitrage Bot (Hardhat + TypeScript)

This project contains:
- Solidity `FlashArb` contract using Aave V3 simple flashloans and Uniswap V2/V3 swaps with slippage and profit guards.
- TypeScript scanner/executor skeletons to wire opportunities to on-chain execution.
- Configurable slippage and min profit, and a stub for BTC payout via Thorchain.

### Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install deps:
   ```bash
   npm install
   ```
3. Compile contracts:
   ```bash
   npx hardhat compile | cat
   ```

### Deploy

```bash
npx hardhat run scripts/deploy.ts --network mainnet | cat
```

Requires `AAVE_POOL` and `WETH_ADDRESS` env vars for the chosen network.

### Execute

Use `src/executor.ts` in a small script to trigger `initiateFlashArb` with safe parameters. Ensure minProfit and deadline are set, and send via a private/protected RPC to mitigate frontrunning.

### Notes

- Always send transactions to private relays (e.g., Flashbots Protect) to avoid MEV.
- Use on-chain quoter contracts and pool math for accurate quotes.
- Carefully account for gas costs and premiums; only execute if expected profit > fees + buffers.

