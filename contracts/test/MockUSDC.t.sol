// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal usdc;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC(address(this));
    }

    function test_metadata() public view {
        assertEq(usdc.name(), "Mock USD Coin");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.owner(), address(this));
        assertEq(usdc.totalSupply(), 0);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        new MockUSDC(address(0));
    }

    // --- faucet ---

    function test_faucet_mintsFixedAmount() public {
        vm.prank(alice);
        uint256 minted = usdc.faucet();

        assertEq(minted, usdc.FAUCET_AMOUNT());
        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(usdc.totalSupply(), 1_000e6);
    }

    function test_faucet_hasNoCooldown() public {
        vm.startPrank(alice);
        usdc.faucet();
        usdc.faucet();
        usdc.faucet();
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 3_000e6);
    }

    function test_faucet_isOpenToAnyone() public {
        vm.prank(bob);
        usdc.faucet();
        assertEq(usdc.balanceOf(bob), 1_000e6);
    }

    // --- owner ---

    function test_mint_onlyOwner() public {
        usdc.mint(alice, 5e6);
        assertEq(usdc.balanceOf(alice), 5e6);

        vm.prank(alice);
        vm.expectRevert(MockUSDC.NotOwner.selector);
        usdc.mint(alice, 5e6);
    }

    function test_transferOwnership() public {
        usdc.transferOwnership(alice);
        assertEq(usdc.owner(), alice);

        vm.prank(alice);
        usdc.mint(bob, 1e6);
        assertEq(usdc.balanceOf(bob), 1e6);
    }

    function test_transferOwnership_rejectsZeroAndNonOwner() public {
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        usdc.transferOwnership(address(0));

        vm.prank(alice);
        vm.expectRevert(MockUSDC.NotOwner.selector);
        usdc.transferOwnership(alice);
    }

    // --- erc20 ---

    function test_transfer() public {
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        assertTrue(usdc.transfer(bob, 40e6));

        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(usdc.balanceOf(bob), 40e6);
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        usdc.mint(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(MockUSDC.InsufficientBalance.selector);
        usdc.transfer(bob, 11e6);
    }

    function test_transfer_revertsOnZeroAddress() public {
        usdc.mint(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(MockUSDC.ZeroAddress.selector);
        usdc.transfer(address(0), 1e6);
    }

    function test_transferFrom_spendsAllowance() public {
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(bob, 60e6);

        vm.prank(bob);
        assertTrue(usdc.transferFrom(alice, bob, 50e6));

        assertEq(usdc.allowance(alice, bob), 10e6);
        assertEq(usdc.balanceOf(bob), 50e6);
    }

    function test_transferFrom_infiniteAllowanceIsNotSpent() public {
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(bob, type(uint256).max);

        vm.prank(bob);
        usdc.transferFrom(alice, bob, 50e6);

        assertEq(usdc.allowance(alice, bob), type(uint256).max);
    }

    function test_transferFrom_revertsOnInsufficientAllowance() public {
        usdc.mint(alice, 100e6);
        vm.prank(alice);
        usdc.approve(bob, 10e6);

        vm.prank(bob);
        vm.expectRevert(MockUSDC.InsufficientAllowance.selector);
        usdc.transferFrom(alice, bob, 11e6);
    }

    function testFuzz_transferPreservesSupply(uint128 minted, uint128 sent) public {
        usdc.mint(alice, minted);
        uint256 amount = minted == 0 ? 0 : uint256(sent) % (uint256(minted) + 1);

        vm.prank(alice);
        usdc.transfer(bob, amount);

        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob), usdc.totalSupply());
    }
}
