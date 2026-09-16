import {randomBytes} from "node:crypto";
import {describe, expect, it} from "vitest";

import {LocalKekProvider, accountAad, openSecret, sealSecret, withSecret} from "./envelope.js";

const provider = new LocalKekProvider(randomBytes(32));
const aad = accountAad("0xCA11CE", "0xA11CE", "round-1");

describe("envelope", () => {
  it("round-trips a secret", async () => {
    const secret = randomBytes(32);
    const sealed = await sealSecret(provider, secret, aad);
    const opened = await openSecret(provider, sealed, aad);
    expect(opened.equals(secret)).toBe(true);
  });

  it("stores nothing that equals the plaintext", async () => {
    const secret = randomBytes(32);
    const sealed = await sealSecret(provider, secret, aad);
    expect(sealed.ciphertext.equals(secret)).toBe(false);
    expect(sealed.dekCiphertext.includes(secret)).toBe(false);
  });

  it("fails when the aad does not match", async () => {
    const sealed = await sealSecret(provider, randomBytes(32), aad);
    const other = accountAad("0xCB0B", "0xB0B", "round-1");
    await expect(openSecret(provider, sealed, other)).rejects.toThrow();
  });

  it("fails when the ciphertext is tampered with", async () => {
    const sealed = await sealSecret(provider, randomBytes(32), aad);
    sealed.ciphertext[0]! ^= 0xff;
    await expect(openSecret(provider, sealed, aad)).rejects.toThrow();
  });

  it("fails under a different kek", async () => {
    const sealed = await sealSecret(provider, randomBytes(32), aad);
    const stranger = new LocalKekProvider(randomBytes(32), provider.id);
    await expect(openSecret(stranger, sealed, aad)).rejects.toThrow();
  });

  it("refuses a secret wrapped by another provider id", async () => {
    const sealed = await sealSecret(provider, randomBytes(32), aad);
    const rotated = new LocalKekProvider(randomBytes(32), "local-kek-v2");
    await expect(openSecret(rotated, sealed, aad)).rejects.toThrow(/wrapped by/);
  });

  it("zeroes the plaintext after withSecret", async () => {
    const secret = randomBytes(32);
    const sealed = await sealSecret(provider, secret, aad);
    let seen: Buffer | null = null;
    const result = await withSecret(provider, sealed, aad, async (plaintext) => {
      seen = plaintext;
      return plaintext.equals(secret);
    });
    expect(result).toBe(true);
    expect(seen!.every((byte) => byte === 0)).toBe(true);
  });

  it("uses a fresh dek and iv per seal", async () => {
    const secret = randomBytes(32);
    const first = await sealSecret(provider, secret, aad);
    const second = await sealSecret(provider, secret, aad);
    expect(first.dekCiphertext.equals(second.dekCiphertext)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });
});
