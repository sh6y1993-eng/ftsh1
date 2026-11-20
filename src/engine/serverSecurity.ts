import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECURITY_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(SECURITY_MODULE_DIR, '..', '..', 'data');

function resolveServerAuthSecret(): { secret: string; source: 'env' | 'file' | 'ephemeral' } {
  const envSecret = process.env.FATTESHHA_AUTH_SECRET || process.env.SESSION_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return { secret: envSecret.trim(), source: 'env' };
  }
  const secretDir = process.env.FATTESHHA_DATA_DIR ? path.resolve(process.env.FATTESHHA_DATA_DIR) : DEFAULT_DATA_DIR;
  const secretFile = path.join(secretDir, '.auth-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf-8').trim();
      if (stored.length >= 32) return { secret: stored, source: 'file' };
    }
    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }
    const generated = crypto.randomBytes(48).toString('hex');
    try {
      fs.writeFileSync(secretFile, generated, { mode: 0o600, flag: 'wx' });
      return { secret: generated, source: 'file' };
    } catch (writeErr: any) {
      if (writeErr?.code === 'EEXIST' && fs.existsSync(secretFile)) {
        const existing = fs.readFileSync(secretFile, 'utf-8').trim();
        if (existing.length >= 32) return { secret: existing, source: 'file' };
      }
      throw writeErr;
    }
  } catch {
    return { secret: crypto.randomBytes(48).toString('hex'), source: 'ephemeral' };
  }
}

const RESOLVED_AUTH_SECRET = resolveServerAuthSecret();
const SERVER_AUTH_SECRET = RESOLVED_AUTH_SECRET.secret;
if (RESOLVED_AUTH_SECRET.source !== 'env' && process.env.NODE_ENV === 'production') {
  console.warn(
    '[security] FATTESHHA_AUTH_SECRET env var is not set; using persisted data/.auth-secret. For multi-container Cloud Run scaling, set FATTESHHA_AUTH_SECRET.'
  );
}

export interface VerifiedTokenPayload {
  username: string;
  userId: string;
  iat: number;
  jti: string;
}

export function normalizeUsernameClean(raw?: string | null): string {
  return (raw || '')
    .toString()
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Legacy deterministic hash used by older client localStorage versions,
 * kept solely for seamless one-time migration to scrypt.
 */
export function computeLegacyClientPasswordHash(usernameKey: string, rawPassword: string): string {
  const normalized = `${usernameKey.trim().toLowerCase()}::${rawPassword}`;
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fts_pw_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Hashes a password using Node's cryptographic `crypto.scryptSync` with a random 16-byte salt.
 */
export function hashPasswordScrypt(rawPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(rawPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

export function isScryptHash(stored?: string): boolean {
  return typeof stored === 'string' && stored.startsWith('scrypt$') && stored.split('$').length === 3;
}

/**
 * Verifies a password against a stored `scrypt$salt$hash` record, or transparently
 * migrates a legacy record on successful match.
 */
export function verifyAndUpgradePassword(
  user: { username: string; passwordHash?: string },
  candidatePassword?: string
): { valid: boolean; upgraded: boolean } {
  if (!candidatePassword || typeof candidatePassword !== 'string' || !candidatePassword.trim()) {
    return { valid: false, upgraded: false };
  }

  const stored = user.passwordHash || '';
  if (!stored || stored === 'guest' || stored === 'synced' || stored === 'synced_account') {
    return { valid: false, upgraded: false };
  }

  if (isScryptHash(stored)) {
    const parts = stored.split('$');
    const salt = parts[1];
    const keyHex = parts[2];
    try {
      const expectedBuf = Buffer.from(keyHex, 'hex');
      const derivedBuf = crypto.scryptSync(candidatePassword, salt, 64);
      if (expectedBuf.length === derivedBuf.length && crypto.timingSafeEqual(expectedBuf, derivedBuf)) {
        return { valid: true, upgraded: false };
      }
      return { valid: false, upgraded: false };
    } catch {
      return { valid: false, upgraded: false };
    }
  }

  // Legacy migration check (plain-text seed or legacy `fts_pw_` hash)
  const cleanUser = normalizeUsernameClean(user.username);
  const legacyClientHash = computeLegacyClientPasswordHash(cleanUser, candidatePassword);
  if (stored === candidatePassword || stored === legacyClientHash) {
    user.passwordHash = hashPasswordScrypt(candidatePassword);
    return { valid: true, upgraded: true };
  }

  return { valid: false, upgraded: false };
}

/**
 * Strips sensitive fields (`passwordHash`, internal idempotency arrays, recovery nonces)
 * before sending a user object in any HTTP or WebSocket response.
 */
export function sanitizeUserForClient<T extends Record<string, any>>(
  user: T | null | undefined,
  includeToken?: string
): Omit<T, 'passwordHash' | 'processedRequestIds' | 'claimedSessionIds' | 'usedRecoveryNonces' | 'activeRecoveryNonce'> | null {
  if (!user) return null;
  const {
    passwordHash: _pw,
    processedRequestIds: _reqIds,
    claimedSessionIds: _sessIds,
    usedRecoveryNonces: _recNonces,
    activeRecoveryNonce: _actNonce,
    ...safeUser
  } = user;

  if (includeToken) {
    (safeUser as any).authToken = includeToken;
  }
  return safeUser;
}

/**
 * Issues an HMAC-SHA256 signed authentication session token for the given user.
 */
export function createAuthToken(username: string, userId: string): string {
  const cleanUser = normalizeUsernameClean(username);
  const payload: VerifiedTokenPayload = {
    username: cleanUser,
    userId: userId || `usr_${cleanUser}`,
    iat: Date.now(),
    jti: crypto.randomBytes(8).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SERVER_AUTH_SECRET)
    .update(`fts_tok.${payloadB64}`)
    .digest('base64url');
  return `fts_tok.${payloadB64}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed authentication token and checks token freshness (TTL).
 */
export function verifyAuthToken(rawToken?: string | null): VerifiedTokenPayload | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const trimmed = rawToken.replace(/^Bearer\s+/i, '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'fts_tok') return null;

  const [, payloadB64, sigB64] = parts;
  try {
    const expectedSig = crypto
      .createHmac('sha256', SERVER_AUTH_SECRET)
      .update(`fts_tok.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sigB64, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as VerifiedTokenPayload;
    if (!parsed || typeof parsed.username !== 'string' || !parsed.username || typeof parsed.iat !== 'number') {
      return null;
    }
    if (Date.now() - parsed.iat > TOKEN_MAX_AGE_MS) {
      return null;
    }
    return {
      ...parsed,
      username: normalizeUsernameClean(parsed.username)
    };
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  const xAuthToken = req.headers['x-auth-token'];
  if (typeof xAuthToken === 'string' && xAuthToken.trim()) {
    return xAuthToken.trim();
  }
  if (req.body && typeof req.body.authToken === 'string' && req.body.authToken.trim()) {
    return req.body.authToken.trim();
  }
  if (req.query && typeof req.query.authToken === 'string' && req.query.authToken.trim()) {
    return req.query.authToken.trim();
  }
  return null;
}

/**
 * Verifies the caller's authentication token and ensures they own the target account.
 * Returns the verified token payload, or sends 401/403 HTTP response and returns null.
 */
export function requireVerifiedRequestUser(
  req: Request,
  res: Response,
  targetUsername?: string | null
): VerifiedTokenPayload | null {
  const rawToken = extractTokenFromRequest(req);
  const verified = verifyAuthToken(rawToken);
  if (!verified) {
    res.status(401).json({
      success: false,
      error: 'جلسة المصادقة غير صالحة أو مفقودة، يرجى تسجيل الدخول أولاً'
    });
    return null;
  }

  if (targetUsername) {
    const cleanTarget = normalizeUsernameClean(targetUsername);
    if (cleanTarget && cleanTarget !== verified.username) {
      res.status(403).json({
        success: false,
        error: 'غير مصرح لك بالوصول إلى حساب لاعب آخر أو تنفيذ عمليات نيابة عنه'
      });
      return null;
    }
  }

  return verified;
}

/**
 * Single-use signed account recovery token generator & verifier.
 */
export function createSignedRecoveryCode(username: string, userId: string): {
  recoveryCode: string;
  nonce: string;
} {
  const cleanUser = normalizeUsernameClean(username);
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = {
    u: cleanUser,
    id: userId,
    n: nonce,
    iat: Date.now()
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SERVER_AUTH_SECRET)
    .update(`FTS-REC.${payloadB64}`)
    .digest('base64url');
  return {
    recoveryCode: `FTS-REC.${payloadB64}.${sig}`,
    nonce
  };
}

export function verifySignedRecoveryCode(rawCode?: string | null): {
  username: string;
  userId: string;
  nonce: string;
} | null {
  if (!rawCode || typeof rawCode !== 'string') return null;
  const trimmed = rawCode.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'FTS-REC') return null;

  const [, payloadB64, sigB64] = parts;
  try {
    const expectedSig = crypto
      .createHmac('sha256', SERVER_AUTH_SECRET)
      .update(`FTS-REC.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sigB64, 'utf-8');
    const expBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!parsed || typeof parsed.u !== 'string' || typeof parsed.n !== 'string') {
      return null;
    }
    return {
      username: normalizeUsernameClean(parsed.u),
      userId: parsed.id || `usr_${parsed.u}`,
      nonce: parsed.n
    };
  } catch {
    return null;
  }
}

/**
 * Signs a real-time multiplayer event payload so MQTT fallback relays cannot be forged.
 */
export function signRealtimeEvent(payload: Record<string, any>): string {
  const data = `${String(payload.code || '').toUpperCase()}:${String(payload.type || '')}:${String(payload.playerId || '')}:${String(payload.word || '')}:${Number(payload.wordScore || 0)}`;
  return crypto.createHmac('sha256', SERVER_AUTH_SECRET).update(data).digest('base64url');
}

export function verifyRealtimeEventSignature(
  payload: Record<string, any>,
  signature?: string
): boolean {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signRealtimeEvent(payload);
  try {
    const a = Buffer.from(signature, 'utf-8');
    const b = Buffer.from(expected, 'utf-8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * In-memory atomic lock manager to block concurrent race-condition requests.
 */
const activeAtomicLocks = new Set<string>();

export function acquireAtomicLock(lockKey: string): boolean {
  if (activeAtomicLocks.has(lockKey)) {
    return false;
  }
  activeAtomicLocks.add(lockKey);
  return true;
}

export function releaseAtomicLock(lockKey: string): void {
  activeAtomicLocks.delete(lockKey);
}

// ============================================================================
// ADMIN MODERATION CREDENTIAL & HMAC SESSION TOKENS (Zero Hardcoded Passwords)
// ============================================================================
const ADMIN_TOKEN_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

function resolveServerAdminSecret(): { secret: string; source: 'env' | 'file' | 'ephemeral' } {
  const envAdmin = (process.env.FATTESHHA_ADMIN_SECRET || '').trim();
  if (envAdmin.length >= 16) {
    return { secret: envAdmin, source: 'env' };
  }
  const secretDir = process.env.FATTESHHA_DATA_DIR
    ? path.resolve(process.env.FATTESHHA_DATA_DIR)
    : DEFAULT_DATA_DIR;
  const adminSecretFile = path.join(secretDir, '.admin-secret');
  try {
    if (fs.existsSync(adminSecretFile)) {
      const stored = fs.readFileSync(adminSecretFile, 'utf-8').trim();
      if (stored.length >= 24) return { secret: stored, source: 'file' };
    }
    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(adminSecretFile, generated, { mode: 0o600, flag: 'wx' });
      return { secret: generated, source: 'file' };
    } catch (err: any) {
      if (err?.code === 'EEXIST' && fs.existsSync(adminSecretFile)) {
        const existing = fs.readFileSync(adminSecretFile, 'utf-8').trim();
        if (existing.length >= 24) return { secret: existing, source: 'file' };
      }
      throw err;
    }
  } catch {
    return { secret: crypto.randomBytes(32).toString('hex'), source: 'ephemeral' };
  }
}

const RESOLVED_ADMIN_SECRET = resolveServerAdminSecret();

export function getResolvedAdminSecretForServerOnly(): string {
  const envAdmin = (process.env.FATTESHHA_ADMIN_SECRET || '').trim();
  if (envAdmin.length >= 16) return envAdmin;
  return RESOLVED_ADMIN_SECRET.secret;
}

export function verifyAdminSecretCandidate(candidate?: unknown): boolean {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  const expected = getResolvedAdminSecretForServerOnly();
  const a = Buffer.from(candidate.trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function createAdminSessionToken(): string {
  const payload = {
    role: 'moderator',
    iat: Date.now(),
    jti: crypto.randomBytes(8).toString('hex')
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', `${SERVER_AUTH_SECRET}:admin`)
    .update(`fts_adm.${payloadB64}`)
    .digest('base64url');
  return `fts_adm.${payloadB64}.${sig}`;
}

export function verifyAdminSessionToken(rawToken?: string | null): { role: 'moderator'; iat: number; jti: string } | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const trimmed = rawToken.replace(/^Bearer\s+/i, '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'fts_adm') return null;
  const [, payloadB64, sigB64] = parts;
  try {
    const expectedSig = crypto
      .createHmac('sha256', `${SERVER_AUTH_SECRET}:admin`)
      .update(`fts_adm.${payloadB64}`)
      .digest('base64url');
    const a = Buffer.from(sigB64, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!parsed || parsed.role !== 'moderator' || typeof parsed.iat !== 'number') return null;
    if (Date.now() - parsed.iat > ADMIN_TOKEN_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractAdminTokenFromRequest(req: Request): string | null {
  const xAdmin = req.headers['x-admin-token'];
  if (typeof xAdmin === 'string' && xAdmin.trim()) return xAdmin.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.trim().startsWith('Bearer fts_adm.')) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

