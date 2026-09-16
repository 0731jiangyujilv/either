// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice `MockUSDC` plus eip-2612, standing in for usdg — which carries permit on
///         robinhood chain mainnet.
/// @dev A test fixture, and deliberately a separate contract: v0's `MockUSDC` is deployed
///      on arc testnet and is left byte-for-byte alone.
contract MockUSDGPermit is MockUSDC {
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private immutable _domainSeparator;

    mapping(address => uint256) public nonces;

    error PermitExpired();
    error InvalidSignature();

    constructor(address initialOwner) MockUSDC(initialOwner) {
        _domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Global Dollar")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator;
    }

    function permit(
        address owner_,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (block.timestamp > deadline) revert PermitExpired();

        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner_, spender, value, nonces[owner_]++, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));

        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != owner_) revert InvalidSignature();

        allowance[owner_][spender] = value;
        emit Approval(owner_, spender, value);
    }
}
