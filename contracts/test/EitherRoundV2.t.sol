// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {EitherRoundV2} from "../src/EitherRoundV2.sol";

/// @dev The test contract plays the router so `recordBack` can be driven directly. The real
///      router is exercised in `DepositRouter.t.sol`.
contract EitherRoundV2Test is Test {
    MockUSDC internal usdg;
    EitherRoundV2 internal round;

    address internal recorder = address(0x5EC0);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA401);
    address internal custAlice = address(0xCA11CE);
    address internal custBob = address(0xCB0B);
    address internal custCarol = address(0xCCA401);

    uint8 internal constant A = 0;
    uint8 internal constant B = 1;
    uint8 internal constant TIE = 2;

    uint256 internal constant LAUNCH_WINDOW = 7 days;
    uint256 internal constant H_B = 1e6;
    uint256 internal constant H_L = 1e6;
    uint256 internal constant MAX_PER_ACCOUNT = 100e6;
    uint256 internal constant MAX_TOTAL = 2_000e6;

    uint256 internal endTime;

    function setUp() public {
        usdg = new MockUSDC(address(this));
        endTime = block.timestamp + 10 days;
        round = new EitherRoundV2(_config(endTime));
        round.setRouter(address(this));

        _register(alice, custAlice);
        _register(bob, custBob);
        _register(carol, custCarol);
    }

    function _config(uint256 endTime_) internal view returns (EitherRoundV2.Config memory) {
        return EitherRoundV2.Config({
            usdg: address(usdg),
            sideAName: "arc",
            sideBName: "robinhood",
            endTime: endTime_,
            launchWindow: LAUNCH_WINDOW,
            backingThreshold: H_B,
            launchThreshold: H_L,
            maxPerAccount: MAX_PER_ACCOUNT,
            maxTotal: MAX_TOTAL,
            owner: address(this),
            recorder: recorder
        });
    }

    function _register(address user, address custodial) internal {
        vm.prank(recorder);
        round.registerAccount(user, custodial);
    }

    function _back(address user, uint8 side, uint256 amount, uint16 bps) internal {
        round.recordBack(user, side, amount, bps);
    }

    function _withdraw(address user, uint8 side, uint256 amount) internal {
        vm.prank(recorder);
        round.recordWithdraw(user, side, amount);
    }

    function _redeem(address user, uint8 side, uint256 amount) internal {
        vm.prank(recorder);
        round.recordRedeem(user, side, amount);
    }

    function _settle() internal {
        vm.warp(endTime);
        round.settle();
    }

    function _finalize() internal {
        vm.warp(round.settledAt() + LAUNCH_WINDOW);
        round.finalizeLaunch();
    }

    // --- construction ---

    function test_constructor_setsConfig() public view {
        assertEq(address(round.usdg()), address(usdg));
        assertEq(round.sideAName(), "arc");
        assertEq(round.sideBName(), "robinhood");
        assertEq(round.endTime(), endTime);
        assertEq(round.launchWindow(), LAUNCH_WINDOW);
        assertEq(round.backingThreshold(), H_B);
        assertEq(round.launchThreshold(), H_L);
        assertEq(round.maxPerAccount(), MAX_PER_ACCOUNT);
        assertEq(round.maxTotal(), MAX_TOTAL);
        assertEq(round.owner(), address(this));
        assertEq(round.recorder(), recorder);
        assertEq(round.router(), address(this));
        assertFalse(round.closed());
        assertFalse(round.settled());
    }

    function test_constructor_revertsOnZeroAddresses() public {
        EitherRoundV2.Config memory cfg = _config(endTime);
        cfg.usdg = address(0);
        vm.expectRevert(EitherRoundV2.ZeroAddress.selector);
        new EitherRoundV2(cfg);

        cfg = _config(endTime);
        cfg.recorder = address(0);
        vm.expectRevert(EitherRoundV2.ZeroAddress.selector);
        new EitherRoundV2(cfg);
    }

    function test_constructor_revertsOnPastEndTime() public {
        vm.expectRevert(EitherRoundV2.InvalidEndTime.selector);
        new EitherRoundV2(_config(block.timestamp));
    }

    function test_constructor_revertsOnInconsistentLimits() public {
        EitherRoundV2.Config memory cfg = _config(endTime);
        cfg.maxTotal = cfg.maxPerAccount - 1;
        vm.expectRevert(EitherRoundV2.InvalidThresholds.selector);
        new EitherRoundV2(cfg);
    }

    // --- roles ---

    function test_owner_canRotateRoles() public {
        round.setRecorder(address(0x1));
        round.setRouter(address(0x2));
        assertEq(round.recorder(), address(0x1));
        assertEq(round.router(), address(0x2));
    }

    function test_nonOwner_cannotRotateRoles() public {
        vm.startPrank(alice);
        vm.expectRevert(EitherRoundV2.NotOwner.selector);
        round.setRecorder(alice);
        vm.expectRevert(EitherRoundV2.NotOwner.selector);
        round.setRouter(alice);
        vm.expectRevert(EitherRoundV2.NotOwner.selector);
        round.setDepositsPaused(true);
        vm.stopPrank();
    }

    function test_nonRouter_cannotRecordBack() public {
        vm.prank(alice);
        vm.expectRevert(EitherRoundV2.NotRouter.selector);
        round.recordBack(alice, A, 1e6, 0);
    }

    function test_nonRecorder_cannotRecord() public {
        _back(alice, A, 10e6, 0);
        vm.startPrank(alice);
        vm.expectRevert(EitherRoundV2.NotRecorder.selector);
        round.recordWithdraw(alice, A, 1e6);
        vm.expectRevert(EitherRoundV2.NotRecorder.selector);
        round.registerAccount(address(0xD), address(0xE));
        vm.stopPrank();
    }

    // --- accounts ---

    function test_registerAccount_bindsBothWays() public view {
        assertEq(round.custodialOf(alice), custAlice);
        assertEq(round.userOf(custAlice), alice);
    }

    function test_registerAccount_isPermanent() public {
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.AccountAlreadyRegistered.selector);
        round.registerAccount(alice, address(0xDEAD));
    }

    function test_registerAccount_rejectsSharedCustodial() public {
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.CustodialInUse.selector);
        round.registerAccount(address(0xD), custAlice);
    }

    function test_registerAccount_rejectsSelfCustody() public {
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.CustodialInUse.selector);
        round.registerAccount(address(0xD), address(0xD));
    }

    // --- recordBack ---

    function test_recordBack_recordsPrincipalAndCounts() public {
        _back(alice, A, 40e6, 2_500);

        assertEq(round.totalBacked(A), 40e6);
        assertEq(round.backerCount(A), 1);
        assertEq(round.principalOf(alice, A), 40e6);
        assertEq(round.uniqueBackers(), 1);
        assertEq(round.launchWeighted(A), 10e6);

        (uint16 bps, bool isSet) = round.launchBpsOf(alice);
        assertEq(bps, 2_500);
        assertTrue(isSet);
    }

    function test_recordBack_emitsEvent() public {
        vm.expectEmit(true, true, false, true, address(round));
        emit EitherRoundV2.Backed(alice, A, 40e6, 2_500, 40e6);
        _back(alice, A, 40e6, 2_500);
    }

    function test_recordBack_countsAnAddressOncePerSide() public {
        _back(alice, A, 10e6, 0);
        _back(alice, A, 10e6, 0);
        _back(alice, B, 10e6, 0);

        assertEq(round.backerCount(A), 1);
        assertEq(round.backerCount(B), 1);
        assertEq(round.uniqueBackers(), 1);
    }

    function test_recordBack_locksLaunchBpsOnFirstDeposit() public {
        _back(alice, A, 10e6, 3_000);
        _back(alice, A, 10e6, 3_000); // same value passes
        _back(alice, B, 10e6, 3_000); // and applies to both sides

        vm.expectRevert(EitherRoundV2.LaunchBpsLocked.selector);
        _back(alice, A, 1e6, 3_001);

        vm.expectRevert(EitherRoundV2.LaunchBpsLocked.selector);
        _back(alice, B, 1e6, 0);
    }

    function test_recordBack_launchBpsIsPerUser() public {
        _back(alice, A, 10e6, 1_000);
        _back(bob, A, 10e6, 9_000);
        assertEq(round.launchWeighted(A), 1e6 + 9e6);
    }

    function test_recordBack_revertsOnBadInput() public {
        vm.expectRevert(EitherRoundV2.InvalidSide.selector);
        _back(alice, 2, 1e6, 0);

        vm.expectRevert(EitherRoundV2.ZeroAmount.selector);
        _back(alice, A, 0, 0);

        vm.expectRevert(EitherRoundV2.InvalidLaunchBps.selector);
        _back(alice, A, 1e6, 10_001);

        vm.expectRevert(EitherRoundV2.NoCustodialAccount.selector);
        _back(address(0xD), A, 1e6, 0);
    }

    function test_recordBack_revertsAfterEndTime() public {
        vm.warp(endTime);
        vm.expectRevert(EitherRoundV2.RoundClosed.selector);
        _back(alice, A, 1e6, 0);
    }

    function test_recordBack_revertsWhenPaused() public {
        round.setDepositsPaused(true);
        vm.expectRevert(EitherRoundV2.DepositsArePaused.selector);
        _back(alice, A, 1e6, 0);

        round.setDepositsPaused(false);
        _back(alice, A, 1e6, 0);
    }

    function test_recordBack_enforcesAccountLimitAcrossSides() public {
        _back(alice, A, 60e6, 0);
        _back(alice, B, 40e6, 0);
        vm.expectRevert(EitherRoundV2.AccountLimit.selector);
        _back(alice, A, 1, 0);
    }

    function test_recordBack_enforcesTotalLimit() public {
        // 20 accounts × 100 usdg fills the 2,000 usdg round
        for (uint160 i = 1; i <= 20; i++) {
            address user = address(0x1000 + i);
            _register(user, address(0x2000 + i));
            _back(user, i % 2 == 0 ? A : B, MAX_PER_ACCOUNT, 0);
        }
        vm.expectRevert(EitherRoundV2.TotalLimit.selector);
        _back(alice, A, 1, 0);
    }

    // --- recordWithdraw ---

    function test_recordWithdraw_lowersScoreCountsAndWeight() public {
        _back(alice, A, 40e6, 2_500);
        _withdraw(alice, A, 15e6);

        assertEq(round.totalBacked(A), 25e6);
        assertEq(round.principalOf(alice, A), 25e6);
        assertEq(round.backerCount(A), 1);
        assertEq(round.launchWeighted(A), 6.25e6);

        _withdraw(alice, A, 25e6);
        assertEq(round.backerCount(A), 0);
        assertEq(round.uniqueBackers(), 0);
        assertEq(round.launchWeighted(A), 0);
    }

    function test_recordWithdraw_keepsUniqueWhenOtherSideRemains() public {
        _back(alice, A, 10e6, 0);
        _back(alice, B, 10e6, 0);
        _withdraw(alice, A, 10e6);
        assertEq(round.uniqueBackers(), 1);
    }

    function test_recordWithdraw_revertsOverPosition() public {
        _back(alice, A, 10e6, 0);
        vm.expectRevert(EitherRoundV2.InsufficientBacking.selector);
        _withdraw(alice, A, 10e6 + 1);
    }

    function test_recordWithdraw_revertsAfterSettlement() public {
        _back(alice, A, 10e6, 0);
        _settle();
        vm.expectRevert(EitherRoundV2.AlreadySettled.selector);
        _withdraw(alice, A, 1e6);
    }

    // --- settle ---

    function test_settle_revertsBeforeEndTime() public {
        vm.warp(endTime - 1);
        vm.expectRevert(EitherRoundV2.RoundOpen.selector);
        round.settle();
    }

    function test_settle_onlyOnce() public {
        _settle();
        vm.expectRevert(EitherRoundV2.AlreadySettled.selector);
        round.settle();
    }

    function test_settle_picksWinnerAndFreezesCommitment() public {
        _back(alice, A, 40e6, 5_000);
        _back(bob, A, 20e6, 0);
        _back(carol, B, 50e6, 10_000);

        vm.expectEmit(false, false, false, true, address(round));
        emit EitherRoundV2.Settled(A, 60e6, 50e6, 20e6);
        _settle();

        assertTrue(round.settled());
        assertEq(round.winner(), A);
        assertEq(round.settledAt(), endTime);
        assertEq(uint8(round.launchState()), uint8(EitherRoundV2.LaunchState.Pending));
        assertEq(round.totalLaunchCommitted(), 20e6);
    }

    function test_settle_sideBCanWin() public {
        _back(alice, A, 10e6, 0);
        _back(bob, B, 11e6, 1_000);
        _settle();
        assertEq(round.winner(), B);
        assertEq(round.totalLaunchCommitted(), 1.1e6);
    }

    function test_settle_tieFailsLaunch() public {
        _back(alice, A, 10e6, 5_000);
        _back(bob, B, 10e6, 5_000);
        _settle();

        assertEq(round.winner(), TIE);
        assertEq(uint8(round.launchState()), uint8(EitherRoundV2.LaunchState.Failed));
        assertEq(round.totalLaunchCommitted(), 0);
        assertEq(round.launchCommitmentOf(alice), 0);
        assertEq(round.redeemableOf(alice, A), 10e6);
    }

    function test_settle_underBackingThresholdFailsLaunch() public {
        _back(alice, A, H_B - 1, 10_000);
        _settle();

        assertEq(round.winner(), A);
        assertEq(uint8(round.launchState()), uint8(EitherRoundV2.LaunchState.Failed));
        assertEq(round.launchCommitmentOf(alice), 0);
        assertEq(round.redeemableOf(alice, A), H_B - 1);
    }

    function test_settle_freezesTotalsAgainstLaterReads() public {
        _back(alice, A, 10e6, 0);
        _settle();
        _redeem(alice, A, 10e6);
        // redemption is tracked separately, the score stays as it was at the cutoff
        assertEq(round.totalBacked(A), 10e6);
        assertEq(round.principalOf(alice, A), 10e6);
    }

    // --- redemption ---

    function test_redeemable_isZeroBeforeSettlement() public {
        _back(alice, A, 10e6, 0);
        assertEq(round.redeemableOf(alice, A), 0);
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.NotSettled.selector);
        round.recordRedeem(alice, A, 1e6);
    }

    function test_redeem_loserGetsEverything() public {
        _back(alice, A, 40e6, 8_000);
        _back(bob, B, 50e6, 8_000);
        _settle();

        assertEq(round.winner(), B);
        assertEq(round.launchCommitmentOf(alice), 0);
        assertEq(round.redeemableOf(alice, A), 40e6);

        _redeem(alice, A, 40e6);
        assertEq(round.redeemableOf(alice, A), 0);
    }

    function test_redeem_winnerKeepsCommitmentLocked() public {
        _back(alice, A, 40e6, 2_500);
        _back(bob, B, 10e6, 0);
        _settle();

        assertEq(round.launchCommitmentOf(alice), 10e6);
        assertEq(round.redeemableOf(alice, A), 30e6);

        _redeem(alice, A, 20e6);
        assertEq(round.redeemableOf(alice, A), 10e6);

        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.LaunchLocked.selector);
        round.recordRedeem(alice, A, 10e6 + 1);

        _redeem(alice, A, 10e6);
        assertEq(round.redeemableOf(alice, A), 0);
        assertEq(round.launchCommitmentOf(alice), 10e6);
    }

    function test_redeem_winnerWithBothSidesRedeemsLosingSideFully() public {
        _back(alice, A, 40e6, 5_000);
        _back(alice, B, 10e6, 5_000);
        _back(bob, B, 20e6, 0);
        _settle();

        assertEq(round.winner(), A);
        assertEq(round.redeemableOf(alice, A), 20e6);
        assertEq(round.redeemableOf(alice, B), 10e6);
    }

    // --- release ---

    function test_releaseLaunch_unlocksPrincipalAndLowersTotal() public {
        _back(alice, A, 40e6, 2_500);
        _back(bob, A, 40e6, 2_500);
        _back(carol, B, 10e6, 0);
        _settle();
        assertEq(round.totalLaunchCommitted(), 20e6);

        vm.expectEmit(true, false, false, true, address(round));
        emit EitherRoundV2.LaunchReleased(alice, 10e6);
        vm.prank(recorder);
        round.releaseLaunch(alice);

        assertEq(round.totalLaunchCommitted(), 10e6);
        assertEq(round.launchCommitmentOf(alice), 0);
        assertEq(round.redeemableOf(alice, A), 40e6);
        assertEq(round.launchCommitmentOf(bob), 10e6);
    }

    function test_releaseLaunch_onlyOnce() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        vm.startPrank(recorder);
        round.releaseLaunch(alice);
        vm.expectRevert(EitherRoundV2.AlreadyReleased.selector);
        round.releaseLaunch(alice);
        vm.stopPrank();
    }

    function test_releaseLaunch_revertsWithNothingCommitted() public {
        _back(alice, A, 40e6, 0);
        _back(bob, B, 10e6, 5_000);
        _settle();

        vm.startPrank(recorder);
        vm.expectRevert(EitherRoundV2.NothingToRelease.selector);
        round.releaseLaunch(alice); // winner with 0 bps
        vm.expectRevert(EitherRoundV2.NothingToRelease.selector);
        round.releaseLaunch(bob); // loser
        vm.stopPrank();
    }

    function test_releaseLaunch_revertsOnceFinalized() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        _finalize();
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.LaunchNotPending.selector);
        round.releaseLaunch(alice);
    }

    // --- finalize ---

    function test_finalizeLaunch_waitsForWindow() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        vm.warp(round.settledAt() + LAUNCH_WINDOW - 1);
        vm.expectRevert(EitherRoundV2.LaunchWindowOpen.selector);
        round.finalizeLaunch();
    }

    function test_finalizeLaunch_succeedsOverThreshold() public {
        _back(alice, A, 40e6, 2_500);
        _settle();

        vm.expectEmit(false, false, false, true, address(round));
        emit EitherRoundV2.LaunchFinalized(EitherRoundV2.LaunchState.Succeeded, 10e6);
        _finalize();

        assertEq(uint8(round.launchState()), uint8(EitherRoundV2.LaunchState.Succeeded));
        assertEq(round.launchCommitmentOf(alice), 10e6);
        assertEq(round.redeemableOf(alice, A), 30e6);
    }

    function test_finalizeLaunch_failsUnderThreshold() public {
        _back(alice, A, 40e6, 200); // 0.8 usdg committed, under the 1 usdg launch threshold
        _settle();
        assertEq(round.totalLaunchCommitted(), 0.8e6);

        _finalize();

        assertEq(uint8(round.launchState()), uint8(EitherRoundV2.LaunchState.Failed));
        assertEq(round.launchCommitmentOf(alice), 0);
        assertEq(round.redeemableOf(alice, A), 40e6);
    }

    function test_finalizeLaunch_onlyOnce() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        _finalize();
        vm.expectRevert(EitherRoundV2.LaunchNotPending.selector);
        round.finalizeLaunch();
    }

    function test_finalizeLaunch_revertsBeforeSettlement() public {
        vm.expectRevert(EitherRoundV2.NotSettled.selector);
        round.finalizeLaunch();
    }

    // --- spend ---

    function test_recordLaunchSpent_consumesCommitment() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        _finalize();

        vm.prank(recorder);
        round.recordLaunchSpent(alice);

        EitherRoundV2.PositionView memory p = round.getPosition(alice);
        assertTrue(p.launchSpent);
        assertEq(p.redeemedA, 10e6);
        assertEq(p.redeemableA, 30e6);
        assertEq(p.launchCommitment, 10e6);

        _redeem(alice, A, 30e6);
        assertEq(round.redeemableOf(alice, A), 0);
    }

    function test_recordLaunchSpent_requiresSuccess() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        vm.prank(recorder);
        vm.expectRevert(EitherRoundV2.LaunchNotSucceeded.selector);
        round.recordLaunchSpent(alice);
    }

    function test_recordLaunchSpent_onlyOnce() public {
        _back(alice, A, 40e6, 2_500);
        _settle();
        _finalize();
        vm.startPrank(recorder);
        round.recordLaunchSpent(alice);
        vm.expectRevert(EitherRoundV2.AlreadySpent.selector);
        round.recordLaunchSpent(alice);
        vm.stopPrank();
    }

    // --- views ---

    function test_getRound_reportsState() public {
        _back(alice, A, 40e6, 2_500);
        _back(bob, B, 10e6, 0);

        EitherRoundV2.RoundView memory r = round.getRound();
        assertEq(r.sideABacked, 40e6);
        assertEq(r.sideBBacked, 10e6);
        assertEq(r.totalBackedAll, 50e6);
        assertEq(r.uniqueBackers, 2);
        assertFalse(r.closed);
        assertFalse(r.settled);
        assertEq(r.launchWindowEnd, 0);
        assertEq(r.maxPerAccount, MAX_PER_ACCOUNT);

        _settle();
        r = round.getRound();
        assertTrue(r.closed);
        assertTrue(r.settled);
        assertEq(r.winner, A);
        assertEq(r.launchState, uint8(EitherRoundV2.LaunchState.Pending));
        assertEq(r.totalLaunchCommitted, 10e6);
        assertEq(r.launchWindowEnd, endTime + LAUNCH_WINDOW);
    }

    function test_getPosition_reportsState() public {
        _back(alice, A, 40e6, 2_500);
        EitherRoundV2.PositionView memory p = round.getPosition(alice);
        assertEq(p.custodial, custAlice);
        assertEq(p.principalA, 40e6);
        assertEq(p.launchBps, 2_500);
        assertTrue(p.launchBpsSet);
        assertEq(p.launchCommitment, 0);
        assertEq(p.redeemableA, 0);
    }

    // --- fuzz ---

    /// @dev Any sequence of backs and withdrawals keeps the side totals equal to the sum of
    ///      positions, and the launch weight equal to the sum of floored per-user commitments.
    function testFuzz_ledgerStaysConsistent(uint256 seed, uint8 steps) public {
        address[3] memory users = [alice, bob, carol];
        uint16[3] memory bps = [uint16(0), 2_500, 10_000];
        steps = uint8(bound(steps, 1, 40));

        for (uint256 i = 0; i < steps; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 u = r % 3;
            uint8 side = uint8((r >> 8) % 2);
            uint256 amount = ((r >> 16) % 20e6) + 1;
            bool withdraw = ((r >> 64) % 3) == 0;

            if (withdraw) {
                uint256 held = round.principalOf(users[u], side);
                if (held == 0) continue;
                _withdraw(users[u], side, (amount % held) + 1);
            } else {
                uint256 heldAll = round.principalOf(users[u], 0) + round.principalOf(users[u], 1);
                if (heldAll + amount > MAX_PER_ACCOUNT) continue;
                _back(users[u], side, amount, bps[u]);
            }
        }

        for (uint8 side = 0; side < 2; side++) {
            uint256 sumPrincipal;
            uint256 sumWeight;
            uint256 holders;
            for (uint256 u = 0; u < 3; u++) {
                uint256 held = round.principalOf(users[u], side);
                sumPrincipal += held;
                sumWeight += (held * bps[u]) / 10_000;
                if (held > 0) holders++;
            }
            assertEq(round.totalBacked(side), sumPrincipal);
            assertEq(round.launchWeighted(side), sumWeight);
            assertEq(round.backerCount(side), holders);
        }
    }

    /// @dev For any winner, redeemable + commitment == principal on the winning side until the
    ///      commitment is released, and the round-level total equals the sum of commitments.
    function testFuzz_settlementSplitsPrincipal(uint256 a1, uint256 a2, uint256 b1, uint16 bpsA, uint16 bpsB)
        public
    {
        a1 = bound(a1, 1, MAX_PER_ACCOUNT);
        a2 = bound(a2, 1, MAX_PER_ACCOUNT);
        b1 = bound(b1, 1, MAX_PER_ACCOUNT);
        bpsA = uint16(bound(bpsA, 0, 10_000));
        bpsB = uint16(bound(bpsB, 0, 10_000));

        _back(alice, A, a1, bpsA);
        _back(bob, A, a2, bpsB);
        _back(carol, B, b1, bpsA);
        _settle();

        uint8 w = round.winner();
        if (w == TIE) {
            assertEq(round.totalLaunchCommitted(), 0);
            assertEq(round.redeemableOf(alice, A), a1);
            return;
        }

        address[3] memory users = [alice, bob, carol];
        uint256 sum;
        for (uint256 i = 0; i < 3; i++) {
            uint256 principal = round.principalOf(users[i], w);
            uint256 commitment = round.launchCommitmentOf(users[i]);
            assertEq(round.redeemableOf(users[i], w) + commitment, principal);
            assertLe(commitment, principal);
            sum += commitment;
        }
        assertEq(round.totalLaunchCommitted(), sum);
    }
}
