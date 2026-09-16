import {createCipheriv, createDecipheriv, randomBytes, timingSafeEqual} from "node:crypto";

/**
 * Envelope encryption for custodial private keys.
 *
 *   kek (never leaves the provider)
 *     └─ wraps ─► dek, one per secret
 *                   └─ aes-256-gcm ─► the private key, bound to `aad`
 *
 * The database stores only what `EncryptedSecret` holds: nothing in it is usable without
 * the provider. `aad` ties a ciphertext to the account it belongs to, so a row moved
 * between accounts fails authentication instead of quietly decrypting to the wrong key.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface KeyProvider {
  /** Identifies which kek wrapped a dek, so keks can be rotated without re-wrapping at once. */
  readonly id: string;
  generateDataKey(): Promise<{plaintext: Buffer; ciphertext: Buffer}>;
  decryptDataKey(ciphertext: Buffer): Promise<Buffer>;
}

export type EncryptedSecret = {
  kekId: string;
  version: 1;
  dekCiphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

/**
 * Wraps data keys with a kek held in process memory. Fine for development and a small demo
 * as long as the kek comes from outside the database and the repository; a real kms
 * provider should replace it before the platform holds more than pocket money.
 */
export class LocalKekProvider implements KeyProvider {
  readonly id: string;
  private readonly kek: Buffer;

  constructor(kek: Buffer, id = "local-kek-v1") {
    if (kek.length !== KEY_BYTES) throw new Error("kek must be 32 bytes");
    this.kek = Buffer.from(kek); // own copy, so the caller can zero theirs
    this.id = id;
  }

  static fromHex(hex: string, id?: string): LocalKekProvider {
    return new LocalKekProvider(Buffer.from(hex.replace(/^0x/, ""), "hex"), id);
  }

  async generateDataKey() {
    const plaintext = randomBytes(KEY_BYTES);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.kek, iv);
    const wrapped = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const ciphertext = Buffer.concat([iv, cipher.getAuthTag(), wrapped]);
    return {plaintext, ciphertext};
  }

  async decryptDataKey(ciphertext: Buffer) {
    if (ciphertext.length !== IV_BYTES + TAG_BYTES + KEY_BYTES) throw new Error("malformed wrapped dek");
    const iv = ciphertext.subarray(0, IV_BYTES);
    const tag = ciphertext.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const wrapped = ciphertext.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(wrapped), decipher.final()]);
  }
}

/** The additional data every custodial key is bound to. */
export function accountAad(custodial: string, userWallet: string, roundId: string): Buffer {
  return Buffer.from(`either:v1:${custodial.toLowerCase()}:${userWallet.toLowerCase()}:${roundId}`);
}

export async function sealSecret(
  provider: KeyProvider,
  plaintext: Buffer,
  aad: Buffer,
): Promise<EncryptedSecret> {
  const dek = await provider.generateDataKey();
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, dek.plaintext, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      kekId: provider.id,
      version: 1,
      dekCiphertext: dek.ciphertext,
      iv,
      authTag: cipher.getAuthTag(),
      ciphertext,
    };
  } finally {
    dek.plaintext.fill(0);
  }
}

export async function openSecret(
  provider: KeyProvider,
  sealed: EncryptedSecret,
  aad: Buffer,
): Promise<Buffer> {
  if (sealed.kekId !== provider.id) {
    throw new Error(`secret was wrapped by ${sealed.kekId}, provider is ${provider.id}`);
  }
  const dek = await provider.decryptDataKey(sealed.dekCiphertext);
  try {
    const decipher = createDecipheriv(ALGORITHM, dek, sealed.iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  } finally {
    dek.fill(0);
  }
}

/**
 * Run `fn` with the decrypted secret, then zero it. The only sanctioned way to touch a
 * custodial private key: it never escapes the callback's scope.
 */
export async function withSecret<T>(
  provider: KeyProvider,
  sealed: EncryptedSecret,
  aad: Buffer,
  fn: (plaintext: Buffer) => Promise<T>,
): Promise<T> {
  const plaintext = await openSecret(provider, sealed, aad);
  try {
    return await fn(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

/** Constant-time buffer equality, for tests and for checking a re-derived address. */
export function bufferEquals(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
