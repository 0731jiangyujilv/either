import type {Address, Hex} from "viem";
import type {PrivateKeyAccount} from "viem/accounts";

import {erc20Abi, erc4626Abi} from "./abis.js";
import {confirmed, type Clients} from "./client.js";
import {ttlCache} from "../util/cache.js";

/**
 * The morpho vault as seen from a custodial account. Every write takes the unsealed
 * account and is meant to run inside `AccountProvider.withSigner`.
 *
 * Amounts returned by `deposit` / `redeem` are measured as balance deltas rather than
 * decoded return values — the same figure the account actually ends up with.
 */
export class MorphoVault {
  constructor(
    private readonly clients: Clients,
    readonly address: Address,
    readonly usdg: Address,
  ) {}

  async assetIsUsdg(): Promise<boolean> {
    const asset = await this.read("asset");
    return asset.toLowerCase() === this.usdg.toLowerCase();
  }

  async totals(): Promise<{totalAssets: bigint; totalSupply: bigint; block: bigint}> {
    const [totalAssets, totalSupply, block] = await Promise.all([
      this.read("totalAssets"),
      this.read("totalSupply"),
      this.clients.publicClient.getBlockNumber(),
    ]);
    return {totalAssets, totalSupply, block};
  }

  async sharesOf(owner: Address): Promise<bigint> {
    return this.clients.publicClient.readContract({
      address: this.address,
      abi: erc4626Abi,
      functionName: "balanceOf",
      args: [owner],
    });
  }

  async convertToAssets(shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n;
    return this.clients.publicClient.readContract({
      address: this.address,
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [shares],
    });
  }

  /** Shares that would be redeemed to pay out `assets` now — rounded up, never short. */
  async sharesFor(assets: bigint): Promise<bigint> {
    if (assets === 0n) return 0n;
    const shares = await this.clients.publicClient.readContract({
      address: this.address,
      abi: erc4626Abi,
      functionName: "previewDeposit",
      args: [assets],
    });
    return shares + 1n;
  }

  /** What `owner`'s shares are worth right now. */
  async valueOf(owner: Address): Promise<{shares: bigint; assets: bigint}> {
    const shares = await this.sharesOf(owner);
    return {shares, assets: await this.convertToAssets(shares)};
  }

  /**
   * Share price (assets per whole share), shared by every caller for a few seconds.
   * One `convertToAssets` per window instead of one per request.
   */
  private readonly pricePerShare = ttlCache(5_000, () => this.convertToAssets(10n ** 18n));

  /**
   * Assets behind `shares`, derived from the cached price. The result can differ from
   * a direct `convertToAssets` by at most one share-unit of rounding, which display
   * paths tolerate — money-moving paths use the exact reads and never this.
   */
  async assetsFromShares(shares: bigint): Promise<bigint> {
    if (shares === 0n) return 0n;
    return (shares * (await this.pricePerShare())) / 10n ** 18n;
  }

  async usdgBalance(owner: Address): Promise<bigint> {
    return this.clients.publicClient.readContract({
      address: this.usdg,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
  }

  /** `approve` then `deposit` from the custodial account. Returns the shares minted. */
  async deposit(account: PrivateKeyAccount, assets: bigint): Promise<{hash: Hex; shares: bigint}> {
    const wallet = this.clients.walletFor(account);
    const before = await this.sharesOf(account.address);

    const allowance = await this.clients.publicClient.readContract({
      address: this.usdg,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, this.address],
    });
    if (allowance < assets) {
      const approveHash = await wallet.writeContract({
        address: this.usdg,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.address, assets],
      });
      await confirmed(this.clients.publicClient, approveHash, "usdg.approve");
    }

    const hash = await wallet.writeContract({
      address: this.address,
      abi: erc4626Abi,
      functionName: "deposit",
      args: [assets, account.address],
    });
    await confirmed(this.clients.publicClient, hash, "vault.deposit");

    const after = await this.sharesOf(account.address);
    return {hash, shares: after - before};
  }

  /** Redeem `shares` to the custodial account itself. Returns the usdg received. */
  async redeem(account: PrivateKeyAccount, shares: bigint): Promise<{hash: Hex; assets: bigint}> {
    const wallet = this.clients.walletFor(account);
    const before = await this.usdgBalance(account.address);

    const hash = await wallet.writeContract({
      address: this.address,
      abi: erc4626Abi,
      functionName: "redeem",
      args: [shares, account.address, account.address],
    });
    await confirmed(this.clients.publicClient, hash, "vault.redeem");

    const after = await this.usdgBalance(account.address);
    return {hash, assets: after - before};
  }

  /** Plain usdg transfer out of the custodial account: the payout and the fee. */
  async transferUsdg(account: PrivateKeyAccount, to: Address, amount: bigint): Promise<Hex> {
    const wallet = this.clients.walletFor(account);
    const hash = await wallet.writeContract({
      address: this.usdg,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
    });
    return confirmed(this.clients.publicClient, hash, "usdg.transfer");
  }

  private read(functionName: "asset"): Promise<Address>;
  private read(functionName: "totalAssets" | "totalSupply"): Promise<bigint>;
  private read(functionName: "asset" | "totalAssets" | "totalSupply") {
    return this.clients.publicClient.readContract({address: this.address, abi: erc4626Abi, functionName});
  }
}
