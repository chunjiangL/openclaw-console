/**
 * Device identity for gateway authentication.
 * Ported from openclaw/ui/src/ui/device-identity.ts
 *
 * Uses Ed25519 key pairs to prove device identity to the gateway.
 * Without this, the gateway strips all scopes from the connection.
 */

import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string; // base64url
  privateKey: string; // base64url
};

const STORAGE_KEY = "claw-console-device-identity-v1";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          parsed.deviceId = derivedId;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
        return {
          deviceId: derivedId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // fall through to regenerate
  }

  const identity = await generateIdentity();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      ...identity,
      createdAtMs: Date.now(),
    })
  );
  return identity;
}

export async function signDevicePayload(
  privateKeyBase64Url: string,
  payload: string
): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}

export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

// Device auth token storage (persists server-issued tokens)
type DeviceAuthEntry = {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
};

const AUTH_STORAGE_KEY = "claw-console.device.auth.v1";

export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): DeviceAuthEntry | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw);
    if (store?.version !== 1 || store.deviceId !== params.deviceId) return null;
    return store.tokens?.[params.role] ?? null;
  } catch {
    return null;
  }
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): void {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const existing = raw ? JSON.parse(raw) : null;
    const tokens =
      existing?.version === 1 && existing.deviceId === params.deviceId
        ? { ...existing.tokens }
        : {};
    tokens[params.role] = {
      token: params.token,
      role: params.role,
      scopes: params.scopes ?? [],
      updatedAtMs: Date.now(),
    };
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ version: 1, deviceId: params.deviceId, tokens })
    );
  } catch {
    // best-effort
  }
}

export function clearDeviceAuthToken(params: {
  deviceId: string;
  role: string;
}): void {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return;
    const store = JSON.parse(raw);
    if (store?.version !== 1 || store.deviceId !== params.deviceId) return;
    delete store.tokens?.[params.role];
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // best-effort
  }
}
