// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Aave V3 simple flash loan interfaces
interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IAaveFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

// Uniswap V2 and V3 interfaces (minimal)
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112, uint112, uint32);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract FlashArb is Ownable, ReentrancyGuard, IAaveFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    address public immutable aavePool;
    address public immutable weth;

    event ExecutedArb(address indexed asset, uint256 amountIn, uint256 profit, uint256 premium);

    constructor(address _aavePool, address _weth, address initialOwner) Ownable(initialOwner) {
        require(_aavePool != address(0) && _weth != address(0), "zero addr");
        aavePool = _aavePool;
        weth = _weth;
    }

    struct ArbParams {
        // First swap (e.g., V2)
        address routerA;
        address[] pathA; // path[0] must equal asset
        uint256 minOutA;

        // Second swap (e.g., V3 or V2 back)
        address routerB;
        bool isV3;
        // V3 params
        uint24 v3Fee;
        address tokenOutB; // final token, must equal asset for profit calc
        uint256 minOutB;

        // Execution guards
        uint256 minProfit; // in asset units
        uint256 deadline;  // unix ts to avoid stale quotes
    }

    function initiateFlashArb(address asset, uint256 amount, ArbParams calldata arb)
        external
        onlyOwner
        nonReentrant
    {
        require(block.timestamp <= arb.deadline, "stale");
        require(arb.pathA.length >= 2, "pathA short");
        require(arb.pathA[0] == asset, "pathA mismatch");
        IAavePool(aavePool).flashLoanSimple(address(this), asset, amount, abi.encode(arb), 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == aavePool, "only pool");
        ArbParams memory arb = abi.decode(params, (ArbParams));
        require(block.timestamp <= arb.deadline, "expired");

        IERC20(asset).forceApprove(arb.routerA, amount);
        // Swap A via V2 router
        uint[] memory amountsA = IUniswapV2Router02(arb.routerA).swapExactTokensForTokens(
            amount,
            arb.minOutA,
            arb.pathA,
            address(this),
            arb.deadline
        );

        uint256 intermediateAmount = amountsA[amountsA.length - 1];

        uint256 amountBOut;
        if (arb.isV3) {
            IERC20(arb.pathA[arb.pathA.length - 1]).forceApprove(arb.routerB, intermediateAmount);
            amountBOut = IUniswapV3Router(arb.routerB).exactInputSingle(
                IUniswapV3Router.ExactInputSingleParams({
                    tokenIn: arb.pathA[arb.pathA.length - 1],
                    tokenOut: arb.tokenOutB,
                    fee: arb.v3Fee,
                    recipient: address(this),
                    deadline: arb.deadline,
                    amountIn: intermediateAmount,
                    amountOutMinimum: arb.minOutB,
                    sqrtPriceLimitX96: 0
                })
            );
        } else {
            IERC20(arb.pathA[arb.pathA.length - 1]).forceApprove(arb.routerB, intermediateAmount);
            address[] memory pathB = new address[](2);
            pathB[0] = arb.pathA[arb.pathA.length - 1];
            pathB[1] = arb.tokenOutB;
            uint[] memory amountsB = IUniswapV2Router02(arb.routerB).swapExactTokensForTokens(
                intermediateAmount,
                arb.minOutB,
                pathB,
                address(this),
                arb.deadline
            );
            amountBOut = amountsB[amountsB.length - 1];
        }

        require(arb.tokenOutB == asset, "final must be asset");

        uint256 repayAmount = amount + premium;
        require(amountBOut >= repayAmount + arb.minProfit, "no profit");

        // repay Aave
        IERC20(asset).safeTransfer(aavePool, repayAmount);

        uint256 profit = amountBOut - repayAmount;
        // transfer remaining profit to owner for off-chain payout handling
        uint256 bal = IERC20(asset).balanceOf(address(this));
        if (bal > 0) {
            IERC20(asset).safeTransfer(owner(), bal);
        }

        emit ExecutedArb(asset, amount, profit, premium);
        return true;
    }

    function rescue(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}

