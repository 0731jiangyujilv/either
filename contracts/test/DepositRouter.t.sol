// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockUSDGPermit} from "./MockUSDGPermit.sol";
import {EitherRoundV2} from "../src/EitherRoundV2.sol";
import {DepositRouter} from "../src/DepositRouter.sol";

contract DepositRouterTest is Test {
    MockUSDGPermit internal usdg;
    EitherRoundV2 internal round;
    DepositRouter internal router;

    address internal recorder = address(0x5EC0);
    address internal alice = address(0xA11CE);
    address internal custAlice = address(0xCA11CE);
    address internal stranger = address(0x57);

    /// @dev Permit needs a signer, so this one is derived from a key rather than literal.
    uint256 internal carolKey = 0xC0FFEE;
    address internal carol;
    address internal custCarol = address(0xCCA401);

    uint8 internal constant A = 0;
    uint8 internal constant B = 1;

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    uint256 internal endTime;

    function setUp() public {
        carol = vm.addr(carolKey);

        usdg = new MockUSDGPermit(address(this));
        endTime = block.timestamp + 10 days;
        round = new EitherRoundV2(
            EitherRoundV2.Config({
                usdg: address(usdg),
                sideAName: "arc",
                sideBName: "robinhood",
                endTime: endTime,
                launchWindow: 7 days,
                backingThreshold: 1e6,
                launchThreshold: 1e6,
                maxPerAccount: 100e6,
                maxTotal: 2_000e6,
                owner: address(this),
                recorder: recorder
            })
        );
        router = new DepositRouter(address(round));
        round.setRouter(address(router));

        vm.startPrank(recorder);
        round.registerAccount(alice, custAlice);
        round.registerAccount(carol, custCarol);
        vm.stopPrank();

        usdg.mint(alice, 1_000e6);
        usdg.mint(stranger, 1_000e6);
        usdg.mint(carol, 1_000e6);
        vm.prank(alice);
        usdg.approve(address(router), type(uint256).max);
        vm.prank(stranger);
        usdg.approve(address(router), type(uint256).max);
    }

    function test_constructor_readsUsdgFromRound() public view {
        assertEq(address(router.usdg()), address(usdg));
        assertEq(address(router.round()), address(round));
    }

    function test_constructor_revertsOnZeroRound() public {
        vm.expectRevert(DepositRouter.ZeroAddress.selector);
        new DepositRouter(address(0));
    }

    function test_deposit_movesUsdgAndRecordsInOneTx() public {
        vm.expectEmit(true, true, true, true, address(router));
        emit DepositRouter.Deposited(alice, custAlice, A, 40e6, 2_500);

        vm.prank(alice);
        router.deposit(A, 40e6, 2_500);

        assertEq(usdg.balanceOf(custAlice), 40e6);
        assertEq(usdg.balanceOf(alice), 960e6);
        assertEq(usdg.balanceOf(address(router)), 0);
        assertEq(round.principalOf(alice, A), 40e6);
        assertEq(round.totalBacked(A), 40e6);
        assertEq(round.launchWeighted(A), 10e6);
    }

    function test_deposit_revertsWithoutCustodialAccount() public {
        vm.prank(stranger);
        vm.expectRevert(DepositRouter.NoCustodialAccount.selector);
        router.deposit(A, 1e6, 0);
        assertEq(usdg.balanceOf(stranger), 1_000e6);
    }

    function test_deposit_rollsBackTransferWhenLedgerRejects() public {
        vm.warp(endTime);
        vm.prank(alice);
        vm.expectRevert(EitherRoundV2.RoundClosed.selector);
        router.deposit(A, 1e6, 0);

        assertEq(usdg.balanceOf(alice), 1_000e6);
        assertEq(usdg.balanceOf(custAlice), 0);
    }

    function test_deposit_rollsBackLedgerWhenTransferFails() public {
        vm.prank(alice);
        usdg.approve(address(router), 0);

        vm.prank(alice);
        vm.expectRevert(MockUSDC.InsufficientAllowance.selector);
        router.deposit(A, 1e6, 0);

        assertEq(round.principalOf(alice, A), 0);
        assertEq(round.totalBacked(A), 0);
    }

    function test_deposit_surfacesLockedLaunchBps() public {
        vm.startPrank(alice);
        router.deposit(A, 10e6, 5_000);
        vm.expectRevert(EitherRoundV2.LaunchBpsLocked.selector);
        router.deposit(B, 10e6, 0);
        vm.stopPrank();
    }

    function test_deposit_onlyRouterMayRecord() public {
        vm.prank(alice);
        vm.expectRevert(EitherRoundV2.NotRouter.selector);
        round.recordBack(alice, A, 1e6, 0);
    }

    // --- permit ---

    function test_depositWithPermit_backsWithoutAnyPriorApproval() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(carolKey, address(router), 40e6, deadline);

        assertEq(usdg.allowance(carol, address(router)), 0);

        vm.prank(carol);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(usdg.balanceOf(custCarol), 40e6);
        assertEq(usdg.balanceOf(carol), 960e6);
        assertEq(round.principalOf(carol, A), 40e6);
        assertEq(round.totalBacked(A), 40e6);
        assertEq(round.launchWeighted(A), 10e6);
        // the permit is spent exactly, leaving nothing standing
        assertEq(usdg.allowance(carol, address(router)), 0);
        assertEq(usdg.nonces(carol), 1);
    }

    /// @dev Anyone may broadcast a seen permit first. That must not brick the deposit.
    function test_depositWithPermit_survivesAFrontRunPermit() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(carolKey, address(router), 40e6, deadline);

        vm.prank(stranger);
        usdg.permit(carol, address(router), 40e6, deadline, v, r, s);
        assertEq(usdg.nonces(carol), 1);

        // the same signature is now worthless, but the allowance it granted stands
        vm.prank(carol);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(usdg.balanceOf(custCarol), 40e6);
        assertEq(round.principalOf(carol, A), 40e6);
    }

    function test_depositWithPermit_revertsOnExpiredDeadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(carolKey, address(router), 40e6, deadline);

        vm.warp(deadline + 1);
        vm.prank(carol);
        vm.expectRevert(MockUSDGPermit.PermitExpired.selector);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(round.principalOf(carol, A), 0);
    }

    function test_depositWithPermit_revertsOnSignatureFromAnotherKey() public {
        uint256 deadline = block.timestamp + 1 hours;
        // signed by a key that is not carol's, for carol's allowance
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(0xBEEF, address(router), 40e6, deadline);

        vm.prank(carol);
        vm.expectRevert(MockUSDGPermit.InvalidSignature.selector);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(round.principalOf(carol, A), 0);
    }

    function test_depositWithPermit_skipsPermitWhenAllowanceAlreadyCovers() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(carolKey, address(router), 40e6, deadline);

        vm.prank(carol);
        usdg.approve(address(router), type(uint256).max);

        vm.prank(carol);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(round.principalOf(carol, A), 40e6);
        // untouched: the standing allowance was enough, so the nonce stays available
        assertEq(usdg.nonces(carol), 0);
    }

    function test_depositWithPermit_rollsBackEverythingWhenLedgerRejects() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(carolKey, address(router), 40e6, deadline);

        vm.warp(endTime);
        vm.prank(carol);
        vm.expectRevert(EitherRoundV2.RoundClosed.selector);
        router.depositWithPermit(A, 40e6, 2_500, deadline, v, r, s);

        assertEq(usdg.balanceOf(carol), 1_000e6);
        assertEq(usdg.balanceOf(custCarol), 0);
        assertEq(usdg.nonces(carol), 0);
    }

    function test_depositWithPermit_revertsWithoutCustodialAccount() public {
        uint256 strangerKey = 0xD00D;
        address noAccount = vm.addr(strangerKey);
        usdg.mint(noAccount, 10e6);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(strangerKey, address(router), 5e6, deadline);

        vm.prank(noAccount);
        vm.expectRevert(DepositRouter.NoCustodialAccount.selector);
        router.depositWithPermit(A, 5e6, 0, deadline, v, r, s);

        assertEq(usdg.balanceOf(noAccount), 10e6);
    }

    function _signPermit(uint256 key, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        address owner_ = vm.addr(key);
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner_, spender, value, usdg.nonces(owner_), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdg.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(key, digest);
    }
}
