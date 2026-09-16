// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./IERC20.sol";

/// @title EitherRoundV2
/// @notice The ledger for a single time-bounded round between two sides, on Robinhood Chain.
///
///         Unlike v0, this contract never holds funds. Backing is transferred by the
///         `DepositRouter` straight into a per-user custodial account that the platform
///         operates; this contract only records who backed what, decides the winner at
///         `endTime`, and tracks how much of each winner's principal is committed to the
///         launchpad.
///
///         Three parties write to it:
///           - `router`   — the only caller of `recordBack`; it moves the usdg and records
///                          the backing in one transaction, so the ledger cannot miss a deposit.
///           - `recorder` — the platform's hot key. Registers custodial accounts, and records
///                          the withdrawals and redemptions the backend executes offchain.
///           - `owner`    — governance: rotates the recorder and router, pauses deposits.
///
///         Each user picks `launchBps` — the share of principal committed to a launch should
///         their side win — on their first deposit. It is locked for the round after that.
/// @dev Amounts are usdg base units (6 decimals). Side 0 = A, side 1 = B.
contract EitherRoundV2 {
    // --- constants ---

    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @dev `winner` value when the two sides tie. A tie settles as redemption-only.
    uint8 public constant TIE = 2;

    enum LaunchState {
        Pending, // settled, winner eligible, commitment window open
        Failed, // ineligible, tie, or under the launch threshold — commitments are redeemable
        Succeeded // over the launch threshold — commitments are consumed by the launch
    }

    // --- immutable config ---

    IERC20 public immutable usdg;

    /// @notice Unix timestamp at which the round closes to new backing and can be settled.
    uint256 public immutable endTime;

    /// @notice Seconds after settlement during which winners may still release their commitment.
    uint256 public immutable launchWindow;

    /// @notice `H_B` — minimum winning-side backing for the side to be launch-eligible.
    uint256 public immutable backingThreshold;

    /// @notice `H_L` — minimum total committed principal for the launch to proceed.
    uint256 public immutable launchThreshold;

    /// @notice Demo guardrails: caps on one address and on the round, in usdg base units.
    uint256 public immutable maxPerAccount;
    uint256 public immutable maxTotal;

    string public sideAName;
    string public sideBName;

    // --- roles ---

    address public owner;
    address public recorder;
    address public router;

    bool public depositsPaused;

    // --- ledger ---

    /// @notice The platform-operated account holding a user's usdg, or zero if none yet.
    mapping(address => address) public custodialOf;

    /// @dev Reverse lookup, so a custodial address can never serve two users.
    mapping(address => address) public userOf;

    /// @dev user => [principal on A, principal on B]. Frozen at settlement.
    mapping(address => uint256[2]) private _principal;

    /// @dev user => [redeemed from A, redeemed from B]. Only moves after settlement.
    mapping(address => uint256[2]) private _redeemed;

    mapping(address => uint16) private _launchBps;
    mapping(address => bool) private _launchBpsSet;
    mapping(address => bool) private _launchReleased;
    mapping(address => bool) private _launchSpent;

    uint256[2] private _totalBacked;
    uint256[2] private _backerCount;

    /// @dev Σ over users of `principal × launchBps / 10_000`, per side. Kept exact by applying
    ///      each user's floored delta, so at settlement it is the winning side's total commitment.
    uint256[2] private _launchWeighted;

    /// @notice Addresses currently holding backing on at least one side.
    uint256 public uniqueBackers;

    // --- settlement ---

    bool public settled;
    uint256 public settledAt;

    /// @notice 0 = side A, 1 = side B, `TIE` = neither. Meaningless until `settled`.
    uint8 public winner;

    LaunchState public launchState;

    /// @notice Winning-side principal still committed to the launch. Falls as winners release.
    uint256 public totalLaunchCommitted;

    uint256 private _entered;

    // --- types ---

    struct Config {
        address usdg;
        string sideAName;
        string sideBName;
        uint256 endTime;
        uint256 launchWindow;
        uint256 backingThreshold;
        uint256 launchThreshold;
        uint256 maxPerAccount;
        uint256 maxTotal;
        address owner;
        address recorder;
    }

    struct RoundView {
        string sideAName;
        string sideBName;
        uint256 endTime;
        uint256 sideABacked;
        uint256 sideBBacked;
        uint256 sideABackers;
        uint256 sideBBackers;
        uint256 totalBackedAll;
        uint256 uniqueBackers;
        bool closed;
        bool settled;
        uint8 winner;
        uint256 settledAt;
        uint8 launchState;
        uint256 totalLaunchCommitted;
        uint256 backingThreshold;
        uint256 launchThreshold;
        uint256 launchWindowEnd;
        uint256 maxPerAccount;
        uint256 maxTotal;
        bool depositsPaused;
    }

    struct PositionView {
        address custodial;
        uint256 principalA;
        uint256 principalB;
        uint256 redeemedA;
        uint256 redeemedB;
        uint256 redeemableA;
        uint256 redeemableB;
        uint16 launchBps;
        bool launchBpsSet;
        uint256 launchCommitment;
        bool launchReleased;
        bool launchSpent;
    }

    // --- events ---

    event AccountRegistered(address indexed user, address indexed custodial);
    event Backed(
        address indexed user, uint8 indexed side, uint256 amount, uint16 launchBps, uint256 sideTotal
    );
    event Withdrawn(address indexed user, uint8 indexed side, uint256 amount, uint256 sideTotal);
    event Redeemed(address indexed user, uint8 indexed side, uint256 amount);
    event Settled(uint8 winner, uint256 sideABacked, uint256 sideBBacked, uint256 launchCommitted);
    event LaunchReleased(address indexed user, uint256 amount);
    event LaunchFinalized(LaunchState state, uint256 committed);
    event LaunchSpent(address indexed user, uint256 amount);
    event RecorderSet(address indexed recorder);
    event RouterSet(address indexed router);
    event DepositsPausedSet(bool paused);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    // --- errors ---

    error ZeroAddress();
    error ZeroAmount();
    error InvalidSide();
    error InvalidEndTime();
    error InvalidThresholds();
    error InvalidLaunchBps();
    error LaunchBpsLocked();
    error NotOwner();
    error NotRecorder();
    error NotRouter();
    error RoundClosed();
    error RoundOpen();
    error AlreadySettled();
    error NotSettled();
    error DepositsArePaused();
    error NoCustodialAccount();
    error AccountAlreadyRegistered();
    error CustodialInUse();
    error AccountLimit();
    error TotalLimit();
    error InsufficientBacking();
    error LaunchLocked();
    error LaunchNotPending();
    error LaunchWindowOpen();
    error LaunchNotSucceeded();
    error NothingToRelease();
    error AlreadyReleased();
    error AlreadySpent();
    error Reentrancy();

    // --- modifiers ---

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter();
        _;
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(Config memory config) {
        if (config.usdg == address(0) || config.owner == address(0) || config.recorder == address(0)) {
            revert ZeroAddress();
        }
        if (config.endTime <= block.timestamp) revert InvalidEndTime();
        if (config.maxPerAccount == 0 || config.maxTotal < config.maxPerAccount) revert InvalidThresholds();

        usdg = IERC20(config.usdg);
        sideAName = config.sideAName;
        sideBName = config.sideBName;
        endTime = config.endTime;
        launchWindow = config.launchWindow;
        backingThreshold = config.backingThreshold;
        launchThreshold = config.launchThreshold;
        maxPerAccount = config.maxPerAccount;
        maxTotal = config.maxTotal;

        owner = config.owner;
        recorder = config.recorder;
        emit OwnerTransferred(address(0), config.owner);
        emit RecorderSet(config.recorder);
    }

    // --- owner ---

    function setRecorder(address recorder_) external onlyOwner {
        if (recorder_ == address(0)) revert ZeroAddress();
        recorder = recorder_;
        emit RecorderSet(recorder_);
    }

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
        emit RouterSet(router_);
    }

    function setDepositsPaused(bool paused) external onlyOwner {
        depositsPaused = paused;
        emit DepositsPausedSet(paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // --- recorder: accounts ---

    /// @notice Bind `user` to the custodial account the platform generated for them. Permanent.
    function registerAccount(address user, address custodial) external onlyRecorder {
        if (user == address(0) || custodial == address(0)) revert ZeroAddress();
        if (custodialOf[user] != address(0)) revert AccountAlreadyRegistered();
        if (userOf[custodial] != address(0) || custodialOf[custodial] != address(0)) revert CustodialInUse();
        if (user == custodial) revert CustodialInUse();

        custodialOf[user] = custodial;
        userOf[custodial] = user;
        emit AccountRegistered(user, custodial);
    }

    // --- router: backing ---

    /// @notice Record `amount` of backing for `user` on `side`. Called by the router in the same
    ///         transaction that moves the usdg into the user's custodial account.
    /// @dev `launchBps` is stored on the user's first deposit and must match on every later one —
    ///      a mismatch reverts rather than silently keeping the old value, so the interface can
    ///      never let a user believe they changed it.
    function recordBack(address user, uint8 side, uint256 amount, uint16 launchBps)
        external
        onlyRouter
        nonReentrant
    {
        if (side > 1) revert InvalidSide();
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= endTime) revert RoundClosed();
        if (depositsPaused) revert DepositsArePaused();
        if (custodialOf[user] == address(0)) revert NoCustodialAccount();
        if (launchBps > BPS_DENOMINATOR) revert InvalidLaunchBps();

        if (_launchBpsSet[user]) {
            if (launchBps != _launchBps[user]) revert LaunchBpsLocked();
        } else {
            _launchBps[user] = launchBps;
            _launchBpsSet[user] = true;
        }

        uint256[2] storage position = _principal[user];
        uint256 previousOnSide = position[side];
        uint256 previousTotal = position[0] + position[1];

        if (previousTotal + amount > maxPerAccount) revert AccountLimit();
        if (_totalBacked[0] + _totalBacked[1] + amount > maxTotal) revert TotalLimit();

        // An address counts once per side, and once globally, no matter how often it backs.
        if (previousOnSide == 0) _backerCount[side] += 1;
        if (previousTotal == 0) uniqueBackers += 1;

        uint256 nextOnSide = previousOnSide + amount;
        position[side] = nextOnSide;

        uint256 sideTotal = _totalBacked[side] + amount;
        _totalBacked[side] = sideTotal;
        _launchWeighted[side] += _bps(nextOnSide, launchBps) - _bps(previousOnSide, launchBps);

        emit Backed(user, side, amount, launchBps, sideTotal);
    }

    // --- recorder: withdrawals before settlement ---

    /// @notice Record that the backend returned `amount` of `user`'s backing on `side` before
    ///         the round settled. Lowers the side's score.
    function recordWithdraw(address user, uint8 side, uint256 amount) external onlyRecorder nonReentrant {
        if (side > 1) revert InvalidSide();
        if (amount == 0) revert ZeroAmount();
        if (settled) revert AlreadySettled();

        uint256[2] storage position = _principal[user];
        uint256 previousOnSide = position[side];
        if (previousOnSide < amount) revert InsufficientBacking();

        uint256 remainingOnSide = previousOnSide - amount;
        position[side] = remainingOnSide;

        if (remainingOnSide == 0) {
            _backerCount[side] -= 1;
            if (position[side ^ 1] == 0) uniqueBackers -= 1;
        }

        uint256 sideTotal = _totalBacked[side] - amount;
        _totalBacked[side] = sideTotal;

        uint16 bps = _launchBps[user];
        _launchWeighted[side] -= _bps(previousOnSide, bps) - _bps(remainingOnSide, bps);

        emit Withdrawn(user, side, amount, sideTotal);
    }

    // --- settlement ---

    /// @notice Fix the result. Anyone may call once `endTime` has passed; it succeeds once.
    /// @dev Scores are frozen from here: `recordBack` is closed by `endTime`, `recordWithdraw`
    ///      by `settled`. A tie, or a winner under `backingThreshold`, fails the launch outright
    ///      so every backer is redemption-only immediately.
    function settle() external {
        if (block.timestamp < endTime) revert RoundOpen();
        if (settled) revert AlreadySettled();

        uint256 a = _totalBacked[0];
        uint256 b = _totalBacked[1];
        uint8 result = a > b ? 0 : (b > a ? 1 : TIE);

        settled = true;
        settledAt = block.timestamp;
        winner = result;

        uint256 committed;
        if (result == TIE || _totalBacked[result] < backingThreshold) {
            launchState = LaunchState.Failed;
            emit LaunchFinalized(LaunchState.Failed, 0);
        } else {
            committed = _launchWeighted[result];
            totalLaunchCommitted = committed;
        }

        emit Settled(result, a, b, committed);
    }

    /// @notice Close the commitment window. Anyone may call once `launchWindow` has elapsed.
    function finalizeLaunch() external {
        if (!settled) revert NotSettled();
        if (launchState != LaunchState.Pending) revert LaunchNotPending();
        if (block.timestamp < settledAt + launchWindow) revert LaunchWindowOpen();

        LaunchState state =
            totalLaunchCommitted >= launchThreshold ? LaunchState.Succeeded : LaunchState.Failed;
        launchState = state;
        emit LaunchFinalized(state, totalLaunchCommitted);
    }

    // --- recorder: after settlement ---

    /// @notice Record that the backend paid `amount` of `user`'s principal on `side` back to them.
    /// @dev Yield is settled offchain and is not part of this ledger — only principal is.
    function recordRedeem(address user, uint8 side, uint256 amount) external onlyRecorder nonReentrant {
        if (side > 1) revert InvalidSide();
        if (amount == 0) revert ZeroAmount();
        if (!settled) revert NotSettled();
        if (amount > redeemableOf(user, side)) revert LaunchLocked();

        _redeemed[user][side] += amount;
        emit Redeemed(user, side, amount);
    }

    /// @notice A winner gives up their launchpad share; it becomes redeemable principal again.
    function releaseLaunch(address user) external onlyRecorder {
        if (!settled) revert NotSettled();
        if (launchState != LaunchState.Pending) revert LaunchNotPending();
        if (_launchReleased[user]) revert AlreadyReleased();

        uint256 commitment = _commitmentOf(user);
        if (commitment == 0) revert NothingToRelease();

        _launchReleased[user] = true;
        totalLaunchCommitted -= commitment;
        emit LaunchReleased(user, commitment);
    }

    /// @notice After a successful launch, mark `user`'s commitment as consumed by it.
    function recordLaunchSpent(address user) external onlyRecorder {
        if (launchState != LaunchState.Succeeded) revert LaunchNotSucceeded();
        if (_launchSpent[user]) revert AlreadySpent();

        uint256 commitment = _commitmentOf(user);
        if (commitment == 0) revert NothingToRelease();

        _launchSpent[user] = true;
        _redeemed[user][winner] += commitment;
        emit LaunchSpent(user, commitment);
    }

    // --- read ---

    /// @notice Everything the interface needs for the round, in one call.
    function getRound() external view returns (RoundView memory r) {
        r.sideAName = sideAName;
        r.sideBName = sideBName;
        r.endTime = endTime;
        r.sideABacked = _totalBacked[0];
        r.sideBBacked = _totalBacked[1];
        r.sideABackers = _backerCount[0];
        r.sideBBackers = _backerCount[1];
        r.totalBackedAll = _totalBacked[0] + _totalBacked[1];
        r.uniqueBackers = uniqueBackers;
        r.closed = block.timestamp >= endTime;
        r.settled = settled;
        r.winner = winner;
        r.settledAt = settledAt;
        r.launchState = uint8(launchState);
        r.totalLaunchCommitted = totalLaunchCommitted;
        r.backingThreshold = backingThreshold;
        r.launchThreshold = launchThreshold;
        r.launchWindowEnd = settled ? settledAt + launchWindow : 0;
        r.maxPerAccount = maxPerAccount;
        r.maxTotal = maxTotal;
        r.depositsPaused = depositsPaused;
    }

    /// @notice A user's full position, in one call.
    function getPosition(address user) external view returns (PositionView memory p) {
        uint256[2] storage principal = _principal[user];
        uint256[2] storage redeemed = _redeemed[user];
        p.custodial = custodialOf[user];
        p.principalA = principal[0];
        p.principalB = principal[1];
        p.redeemedA = redeemed[0];
        p.redeemedB = redeemed[1];
        p.redeemableA = redeemableOf(user, 0);
        p.redeemableB = redeemableOf(user, 1);
        p.launchBps = _launchBps[user];
        p.launchBpsSet = _launchBpsSet[user];
        p.launchCommitment = launchCommitmentOf(user);
        p.launchReleased = _launchReleased[user];
        p.launchSpent = _launchSpent[user];
    }

    /// @notice Principal still owed to `user` on `side` after settlement, net of anything
    ///         locked for the launch. Zero before settlement — use `recordWithdraw` then.
    function redeemableOf(address user, uint8 side) public view returns (uint256) {
        if (side > 1) revert InvalidSide();
        if (!settled) return 0;

        uint256 outstanding = _principal[user][side] - _redeemed[user][side];
        // a spent commitment is already inside `_redeemed`, so it must not be subtracted twice
        if (side == winner && !_launchSpent[user]) outstanding -= launchCommitmentOf(user);
        return outstanding;
    }

    /// @notice How much of `user`'s principal is committed to the launch right now.
    ///         Zero until settlement, for losers, after a release, and once a launch has failed.
    function launchCommitmentOf(address user) public view returns (uint256) {
        if (launchState == LaunchState.Failed || _launchReleased[user]) return 0;
        return _commitmentOf(user);
    }

    function principalOf(address user, uint8 side) external view returns (uint256) {
        if (side > 1) revert InvalidSide();
        return _principal[user][side];
    }

    function launchBpsOf(address user) external view returns (uint16 bps, bool isSet) {
        return (_launchBps[user], _launchBpsSet[user]);
    }

    function totalBacked(uint8 side) external view returns (uint256) {
        if (side > 1) revert InvalidSide();
        return _totalBacked[side];
    }

    function backerCount(uint8 side) external view returns (uint256) {
        if (side > 1) revert InvalidSide();
        return _backerCount[side];
    }

    /// @notice Σ `principal × launchBps / 10_000` on `side` — what the launch pool would be if
    ///         that side won right now.
    function launchWeighted(uint8 side) external view returns (uint256) {
        if (side > 1) revert InvalidSide();
        return _launchWeighted[side];
    }

    function closed() external view returns (bool) {
        return block.timestamp >= endTime;
    }

    // --- internal ---

    /// @dev The raw commitment on the winning side, ignoring releases and launch state.
    function _commitmentOf(address user) private view returns (uint256) {
        if (!settled || winner == TIE) return 0;
        return _bps(_principal[user][winner], _launchBps[user]);
    }

    function _bps(uint256 amount, uint16 bps) private pure returns (uint256) {
        return (amount * bps) / BPS_DENOMINATOR;
    }
}
