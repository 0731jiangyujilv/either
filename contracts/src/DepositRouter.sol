// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";
import {IERC20Permit} from "./IERC20Permit.sol";
import {EitherRoundV2} from "./EitherRoundV2.sol";

/// @title DepositRouter
/// @notice The one way into a v1 round. In a single transaction it moves the user's usdg into
///         their custodial account and records the backing on the round ledger, so neither can
///         happen without the other — the backend cannot miss a deposit, and a failed record
///         returns the usdg.
/// @dev Requires prior usdg approval to this contract. Holds no funds itself.
contract DepositRouter {
    IERC20 public immutable usdg;
    EitherRoundV2 public immutable round;

    uint256 private _entered;

    event Deposited(
        address indexed user, address indexed custodial, uint8 indexed side, uint256 amount, uint16 launchBps
    );

    error ZeroAddress();
    error NoCustodialAccount();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address round_) {
        if (round_ == address(0)) revert ZeroAddress();
        round = EitherRoundV2(round_);
        usdg = EitherRoundV2(round_).usdg();
    }

    /// @notice Back `side` with `amount` usdg, committing `launchBps` of principal to a launch
    ///         should that side win. `launchBps` is locked on the caller's first deposit.
    /// @dev Requires a prior `approve`. Prefer `depositWithPermit`, which needs neither.
    function deposit(uint8 side, uint256 amount, uint16 launchBps) external nonReentrant {
        _deposit(side, amount, launchBps);
    }

    /// @notice `deposit`, taking the allowance from an eip-2612 signature rather than a
    ///         prior `approve` — one transaction and one wallet prompt instead of two.
    function depositWithPermit(
        uint8 side,
        uint256 amount,
        uint16 launchBps,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        // A permit is public the moment it is broadcast, and anyone may submit it first to
        // burn the nonce. Spending it only when the allowance is actually short turns that
        // griefing into a no-op instead of a reverted deposit — and leaves a genuinely bad
        // signature to revert inside the token, where the error says what went wrong.
        if (usdg.allowance(msg.sender, address(this)) < amount) {
            IERC20Permit(address(usdg)).permit(msg.sender, address(this), amount, deadline, v, r, s);
        }
        _deposit(side, amount, launchBps);
    }

    function _deposit(uint8 side, uint256 amount, uint16 launchBps) private {
        address custodial = round.custodialOf(msg.sender);
        if (custodial == address(0)) revert NoCustodialAccount();

        // ledger first: every validation (side, deadline, limits, locked bps) lives there
        round.recordBack(msg.sender, side, amount, launchBps);
        _transferFrom(msg.sender, custodial, amount);

        emit Deposited(msg.sender, custodial, side, amount, launchBps);
    }

    /// @dev Tolerates tokens that return nothing on success as well as those returning `true`.
    ///      A revert inside the token is re-raised as-is, so the interface can tell an
    ///      insufficient allowance from a failed transfer.
    function _transferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(usdg).call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok) {
            if (data.length == 0) revert TransferFailed();
            assembly ("memory-safe") {
                revert(add(data, 32), mload(data))
            }
        }
        if (data.length != 0 && !abi.decode(data, (bool))) revert TransferFailed();
    }
}
