import {randomBytes} from "node:crypto";
import {getAddress, verifyMessage, type Address, type Hex} from "viem";

import type {Db} from "../db/index.js";

/**
 * Every request that acts on a user's behalf carries a signature over a short message
 * bound to this deployment, a single-use nonce and the action being taken. No sessions:
 * the wallet is the identity, and the nonce stops a captured signature being replayed.
 */

export type Action = "create account" | "withdraw" | "release launch";

const NONCE_TTL_MS = 10 * 60 * 1000;

export function buildMessage(input: {
  domain: string;
  address: Address;
  action: Action;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `either wants you to sign in with your wallet`,
    input.address,
    ``,
    `domain: ${input.domain}`,
    `action: ${input.action}`,
    `nonce: ${input.nonce}`,
    `issued at: ${input.issuedAt}`,
  ].join("\n");
}

export async function issueNonce(sql: Db): Promise<{nonce: string; expiresAt: string}> {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  await sql`insert into auth_nonces (nonce, expires_at) values (${nonce}, ${expiresAt})`;
  return {nonce, expiresAt: expiresAt.toISOString()};
}

export class AuthError extends Error {}

export type SignedRequest = {address: string; message: string; signature: string};

/**
 * Check the signature, the domain, the action and the nonce, then burn the nonce.
 * Returns the checksummed signer address.
 */
export async function verifySigned(
  sql: Db,
  expected: {domain: string; action: Action},
  body: SignedRequest,
): Promise<Address> {
  let address: Address;
  try {
    address = getAddress(body.address);
  } catch {
    throw new AuthError("malformed address");
  }

  const fields = parseMessage(body.message);
  if (fields.address?.toLowerCase() !== address.toLowerCase()) throw new AuthError("message is for another address");
  if (fields.domain !== expected.domain) throw new AuthError("message is for another domain");
  if (fields.action !== expected.action) throw new AuthError(`message does not authorise "${expected.action}"`);
  if (!fields.nonce) throw new AuthError("message has no nonce");

  const ok = await verifyMessage({address, message: body.message, signature: body.signature as Hex}).catch(
    () => false,
  );
  if (!ok) throw new AuthError("signature does not match");

  // burn atomically: only one request ever succeeds with a given nonce
  const burned = await sql`
    update auth_nonces
    set used_at = now(), wallet_address = ${address.toLowerCase()}
    where nonce = ${fields.nonce} and used_at is null and expires_at > now()
    returning nonce
  `;
  if (burned.length === 0) throw new AuthError("nonce is unknown, used or expired");

  return address;
}

function parseMessage(message: string) {
  const lines = message.split("\n");
  const field = (name: string) =>
    lines
      .find((line) => line.startsWith(`${name}: `))
      ?.slice(name.length + 2)
      .trim();
  return {
    address: lines[1]?.trim(),
    domain: field("domain"),
    action: field("action"),
    nonce: field("nonce"),
  };
}
