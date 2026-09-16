import {describe, expect, it} from "vitest";
import {privateKeyToAccount} from "viem/accounts";

import {buildMessage} from "./signed.js";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

describe("buildMessage", () => {
  it("puts the address on the second line and the fields after a blank one", () => {
    const message = buildMessage({
      domain: "either.test",
      address: account.address,
      action: "withdraw",
      nonce: "abc",
      issuedAt: "2026-09-15T00:00:00.000Z",
    });
    const lines = message.split("\n");
    expect(lines[1]).toBe(account.address);
    expect(lines[2]).toBe("");
    expect(lines).toContain("domain: either.test");
    expect(lines).toContain("action: withdraw");
    expect(lines).toContain("nonce: abc");
  });

  it("is signable and verifiable by the same account", async () => {
    const message = buildMessage({
      domain: "either.test",
      address: account.address,
      action: "create account",
      nonce: "n",
      issuedAt: new Date().toISOString(),
    });
    const signature = await account.signMessage({message});
    const {verifyMessage} = await import("viem");
    expect(await verifyMessage({address: account.address, message, signature})).toBe(true);
  });
});
