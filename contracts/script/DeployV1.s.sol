// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EitherRoundV2} from "../src/EitherRoundV2.sol";
import {DepositRouter} from "../src/DepositRouter.sol";

/// @notice Deploys the v1 round ledger and its deposit router on Robinhood Chain.
///
/// Usage (mainnet, chain id 4663):
///   export RECORDER_ADDRESS=0x...        # the backend hot key — required
///   forge script script/DeployV1.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com/ \
///     --broadcast --private-key $DEPLOYER_KEY \
///     --verify --verifier blockscout \
///     --verifier-url https://robinhoodchain.blockscout.com/api/
///
/// Usage (mainnet fork, no cost):
///   anvil --fork-url https://rpc.mainnet.chain.robinhood.com/
///   RECORDER_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 forge script script/DeployV1.s.sol \
///     --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///
/// Optional env overrides:
///   USDG_ADDRESS        (default: robinhood chain usdg)
///   SIDE_A_NAME         (default "arc"), SIDE_B_NAME (default "robinhood")
///   ROUND_END_TIME      (unix seconds; default 2026-09-26 00:00:00 UTC)
///   LAUNCH_WINDOW       (seconds; default 7 days)
///   BACKING_THRESHOLD   (usdg base units; default 1 usdg)
///   LAUNCH_THRESHOLD    (usdg base units; default 1 usdg)
///   MAX_PER_ACCOUNT     (usdg base units; default 100 usdg)
///   MAX_TOTAL           (usdg base units; default 2,000 usdg)
contract DeployV1 is Script {
    address internal constant DEFAULT_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    uint256 internal constant DEFAULT_END_TIME = 1_790_380_800; // 2026-09-26 00:00:00 UTC

    function run() external returns (EitherRoundV2 round, DepositRouter router) {
        address recorder = vm.envAddress("RECORDER_ADDRESS");

        EitherRoundV2.Config memory cfg = EitherRoundV2.Config({
            usdg: vm.envOr("USDG_ADDRESS", DEFAULT_USDG),
            sideAName: vm.envOr("SIDE_A_NAME", string("arc")),
            sideBName: vm.envOr("SIDE_B_NAME", string("robinhood")),
            endTime: vm.envOr("ROUND_END_TIME", DEFAULT_END_TIME),
            launchWindow: vm.envOr("LAUNCH_WINDOW", uint256(7 days)),
            backingThreshold: vm.envOr("BACKING_THRESHOLD", uint256(1e6)),
            launchThreshold: vm.envOr("LAUNCH_THRESHOLD", uint256(1e6)),
            maxPerAccount: vm.envOr("MAX_PER_ACCOUNT", uint256(100e6)),
            maxTotal: vm.envOr("MAX_TOTAL", uint256(2_000e6)),
            owner: msg.sender,
            recorder: recorder
        });

        require(cfg.endTime > block.timestamp, "ROUND_END_TIME is in the past");

        vm.startBroadcast();

        round = new EitherRoundV2(cfg);
        router = new DepositRouter(address(round));
        round.setRouter(address(router));

        vm.stopBroadcast();

        console.log("chain id                          ", block.chainid);
        console.log("deployer / owner                  ", msg.sender);
        console.log("recorder                          ", recorder);
        console.log("usdg                              ", cfg.usdg);
        console.log("ends at (unix)                    ", cfg.endTime);
        console.log("");
        console.log("NEXT_PUBLIC_ROUND_V2_ADDRESS=      ", address(round));
        console.log("NEXT_PUBLIC_DEPOSIT_ROUTER_ADDRESS=", address(router));
        console.log("NEXT_PUBLIC_V1_DEPLOY_BLOCK=       ", block.number);
    }
}
