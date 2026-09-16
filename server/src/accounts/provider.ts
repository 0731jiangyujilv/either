import type {Address, Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";

import type {Db} from "../db/index.js";
import {accountAad, sealSecret, withSecret, type EncryptedSecret, type KeyProvider} from "../keys/envelope.js";

/**
 * What the rest of the system — and the api — is allowed to know about a custodial account.
 * There is deliberately no field a private key could travel in.
 */
export type PublicAccount = {
  address: Address;
  userWallet: Address;
  roundId: string;
  registeredTx: Hex | null;
};

/**
 * Where custodial accounts come from and how they sign. The only implementation today
 * generates one eoa per user per round; a proxy-vault implementation would fit the same
 * interface, which is the point of having it.
 */
export interface AccountProvider {
  /** Idempotent: returns the existing account if one is already bound. */
  getOrCreate(userWallet: Address, roundId: string): Promise<PublicAccount>;
  get(userWallet: Address, roundId: string): Promise<PublicAccount | null>;
  markRegistered(account: PublicAccount, txHash: Hex): Promise<void>;
  /** Sign with the account inside `fn`; the key is unsealed only for that call. */
  withSigner<T>(account: PublicAccount, fn: (signer: PrivateKeyAccount) => Promise<T>): Promise<T>;
}

type Row = {
  user_wallet: string;
  round_id: string;
  address: string;
  kek_id: string;
  key_version: number;
  dek_ciphertext: Buffer;
  key_iv: Buffer;
  key_auth_tag: Buffer;
  key_ciphertext: Buffer;
  registered_tx: string | null;
};

export class EoaAccountProvider implements AccountProvider {
  constructor(
    private readonly sql: Db,
    private readonly keys: KeyProvider,
  ) {}

  async get(userWallet: Address, roundId: string): Promise<PublicAccount | null> {
    const row = await this.load(userWallet, roundId);
    return row ? toPublic(row) : null;
  }

  async getOrCreate(userWallet: Address, roundId: string): Promise<PublicAccount> {
    const existing = await this.get(userWallet, roundId);
    if (existing) return existing;

    const wallet = userWallet.toLowerCase();
    const privateKey = generatePrivateKey();
    const address = privateKeyToAccount(privateKey).address.toLowerCase() as Address;

    // the hex string is immutable, so only the buffer copy can be zeroed afterwards
    const keyBytes = Buffer.from(privateKey.slice(2), "hex");
    let sealed: EncryptedSecret;
    try {
      sealed = await sealSecret(this.keys, keyBytes, accountAad(address, wallet, roundId));
    } finally {
      keyBytes.fill(0);
    }

    await this.sql.begin(async (tx) => {
      await tx`insert into users (wallet_address) values (${wallet}) on conflict do nothing`;
      // a concurrent create for the same user loses on the primary key and we fall through to `get`
      await tx`
        insert into custodial_accounts
          (user_wallet, round_id, address, kek_id, key_version, dek_ciphertext, key_iv, key_auth_tag, key_ciphertext)
        values
          (${wallet}, ${roundId}, ${address}, ${sealed.kekId}, ${sealed.version},
           ${sealed.dekCiphertext}, ${sealed.iv}, ${sealed.authTag}, ${sealed.ciphertext})
        on conflict (user_wallet, round_id) do nothing
      `;
    });

    const created = await this.get(userWallet, roundId);
    if (!created) throw new Error("custodial account vanished after insert");
    return created;
  }

  async markRegistered(account: PublicAccount, txHash: Hex): Promise<void> {
    await this.sql`
      update custodial_accounts set registered_tx = ${txHash}
      where user_wallet = ${account.userWallet.toLowerCase()} and round_id = ${account.roundId}
    `;
  }

  async withSigner<T>(account: PublicAccount, fn: (signer: PrivateKeyAccount) => Promise<T>): Promise<T> {
    const row = await this.load(account.userWallet, account.roundId);
    if (!row) throw new Error("custodial account not found");

    const sealed: EncryptedSecret = {
      kekId: row.kek_id,
      version: 1,
      dekCiphertext: Buffer.from(row.dek_ciphertext),
      iv: Buffer.from(row.key_iv),
      authTag: Buffer.from(row.key_auth_tag),
      ciphertext: Buffer.from(row.key_ciphertext),
    };
    const aad = accountAad(row.address, row.user_wallet, row.round_id);

    return withSecret(this.keys, sealed, aad, async (plaintext) => {
      const signer = privateKeyToAccount(`0x${plaintext.toString("hex")}` as Hex);
      // the aad already binds the row to its address; this catches a corrupted row anyway
      if (signer.address.toLowerCase() !== row.address) throw new Error("custodial key does not match address");
      return fn(signer);
    });
  }

  private async load(userWallet: Address, roundId: string): Promise<Row | null> {
    const rows = await this.sql<Row[]>`
      select user_wallet, round_id, address, kek_id, key_version,
             dek_ciphertext, key_iv, key_auth_tag, key_ciphertext, registered_tx
      from custodial_accounts
      where user_wallet = ${userWallet.toLowerCase()} and round_id = ${roundId}
    `;
    return rows[0] ?? null;
  }
}

function toPublic(row: Row): PublicAccount {
  return {
    address: row.address as Address,
    userWallet: row.user_wallet as Address,
    roundId: row.round_id,
    registeredTx: (row.registered_tx as Hex | null) ?? null,
  };
}
