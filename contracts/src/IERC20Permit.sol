// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The eip-2612 half of usdg — enough to spend a signed approval.
/// @dev Usdg on robinhood chain implements this; `DOMAIN_SEPARATOR` and `nonces` are here
///      so an interface can build the signature without a second source for the domain.
interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function nonces(address owner) external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
