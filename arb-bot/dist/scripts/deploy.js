import hre from "hardhat";
async function main() {
    const aavePool = process.env.AAVE_POOL;
    const weth = process.env.WETH_ADDRESS;
    if (!aavePool || !weth)
        throw new Error("Missing AAVE_POOL or WETH_ADDRESS env vars");
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);
    const FlashArb = await hre.ethers.getContractFactory("FlashArb");
    const flashArb = await FlashArb.deploy(aavePool, weth, deployer.address);
    await flashArb.waitForDeployment();
    console.log("FlashArb deployed at:", await flashArb.getAddress());
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
