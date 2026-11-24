import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { resolvePersistentDataDir } from './databasePersistence.ts';

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECURITY_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(SECURITY_MODULE_DIR, '..', '..', 'data');

export type SecretSource = 'env' | 'file';

export class ServerSecurityInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerSecurityInitializationError';
  }
}

export interface InitializeServerSecurityOptions {
  dataDir?: string;
  hostReceiptDir?: string;
  dbFile?: string;
  backupDir?: string;
  hadPriorInitialization?: boolean;
  allowFirstRunSecretGeneration?: boolean;
}

export interface ServerSecurityStatus {
  initialized: boolean;
  dataDir: string;
  authSource: SecretSource;
  adminSource: SecretSource;
  hadPriorInitialization: boolean;
}

interface SecurityRuntimeState {
  initialized: boolean;
  dataDir: string | null;
  authSecret: string | null;
  authSource: SecretSource | null;
  adminSecret: string | null;
  adminSource: SecretSource | null;
  hadPriorInitialization: boolean;
}

const securityState: SecurityRuntimeState = {
  initialized: false,
  dataDir: null,
  authSecret: null,
  authSource: null,
  adminSecret: null,
  adminSource: null,
  hadPriorInitialization: false
};

function detectPriorInitializationEvidence(
  secretDir: string,
  options: InitializeServerSecurityOptions
): boolean {
  if (options.hadPriorInitialization === true) {
    return true;
  }

  const hasAuthFile = fs.existsSync(path.join(secretDir, '.auth-secret'));
  const hasAdminFile = fs.existsSync(path.join(secretDir, '.admin-secret'));

  // When caller explicitly snapshotted DB/receipt/backup state BEFORE loadDatabase() ran
  // (so loadDatabase() only just created the fresh DB and receipts for first-run),
  // only pre-existing secret files can mark prior initialization.
  if (options.hadPriorInitialization === false) {
    return hasAuthFile || hasAdminFile;
  }

  const dbFile = options.dbFile || path.join(secretDir, 'database.json');
  const backupDir = options.backupDir || path.join(secretDir, 'backups');
  const hostReceiptDir = options.hostReceiptDir || secretDir;

  if (fs.existsSync(dbFile)) return true;
  if (fs.existsSync(path.join(secretDir, '.database_initialization_receipt.json'))) return true;
  if (fs.existsSync(path.join(secretDir, '.server_first_run_completed.json'))) return true;
  if (fs.existsSync(path.join(hostReceiptDir, '.server_first_run_completed.json'))) return true;
  if (hasAuthFile) return true;
  if (hasAdminFile) return true;

  try {
    if (fs.existsSync(backupDir)) {
      const hasBackup = fs
        .readdirSync(backupDir)
        .some(f => f.startsWith('database-backup-') && f.endsWith('.json'));
      if (hasBackup) return true;
    }
  } catch {
    // ignore read error; subsequent checks enforce strict safety
  }

  return false;
}

function resolveSecretFromEnvOrFile(params: {
  secretLabel: 'auth' | 'admin';
  envValue: string;
  envMinLength: number;
  fileMinLength: number;
  byteLength: number;
  secretDir: string;
  filePath: string;
  hadPriorInitialization: boolean;
  allowFirstRunSecretGeneration: boolean;
  isProductionLikeEnv: boolean;
  envVarName: string;
}): { secret: string; source: SecretSource } {
  const {
    secretLabel,
    envValue,
    envMinLength,
    fileMinLength,
    byteLength,
    secretDir,
    filePath,
    hadPriorInitialization,
    allowFirstRunSecretGeneration,
    isProductionLikeEnv,
    envVarName
  } = params;

  if (envValue.length >= envMinLength) {
    if (secretLabel === 'auth' && envValue.includes('replace_with') && process.env.NODE_ENV === 'production') {
      console.warn(
        '[security] FATTESHHA_AUTH_SECRET appears to be using the example placeholder. Replace it with a unique 32+ character secret in production.'
      );
    }
    return { secret: envValue, source: 'env' };
  }

  const fileName = path.basename(filePath);
  const fatalPrefix = secretLabel === 'auth' ? 'FATAL AUTH SECRET' : 'FATAL ADMIN SECRET';

  if (fs.existsSync(filePath)) {
    let stored = '';
    try {
      stored = fs.readFileSync(filePath, 'utf-8').trim();
    } catch (readErr) {
      throw new ServerSecurityInitializationError(
        `[${fatalPrefix} UNREADABLE] Failed to read "${filePath}": ${(readErr as Error).message}. Startup aborted without generating a replacement secret.`
      );
    }
    if (stored.length >= fileMinLength) {
      if (secretLabel === 'auth' && process.env.NODE_ENV === 'production') {
        console.warn(
          '[security] FATTESHHA_AUTH_SECRET env var is not set; using persisted .auth-secret in persistent data dir. Set FATTESHHA_AUTH_SECRET explicitly on Render.'
        );
      }
      return { secret: stored, source: 'file' };
    }
    throw new ServerSecurityInitializationError(
      `[${fatalPrefix} INVALID] File "${filePath}" is corrupted or shorter than ${fileMinLength} chars. Startup aborted without overwriting ${fileName}.`
    );
  }

  if (hadPriorInitialization) {
    throw new ServerSecurityInitializationError(
      `[${fatalPrefix} MISSING] Environment was previously initialized, but "${filePath}" is missing and ${envVarName} is not set. Startup aborted without generating a replacement secret to protect existing sessions and credentials.`
    );
  }

  if (!allowFirstRunSecretGeneration || (isProductionLikeEnv && !allowFirstRunSecretGeneration)) {
    throw new ServerSecurityInitializationError(
      `[${fatalPrefix} MISSING] "${filePath}" is missing and ${envVarName} is not set, without explicit first-run initialization approval. Startup aborted without creating a secret file.`
    );
  }

  if (!fs.existsSync(secretDir)) {
    fs.mkdirSync(secretDir, { recursive: true });
  }
  const generated = crypto.randomBytes(byteLength).toString('hex');
  try {
    fs.writeFileSync(filePath, generated, { mode: 0o600, flag: 'wx' });
    return { secret: generated, source: 'file' };
  } catch (writeErr: any) {
    if (writeErr?.code === 'EEXIST' && fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf-8').trim();
      if (existing.length >= fileMinLength) {
        return { secret: existing, source: 'file' };
      }
    }
    throw new ServerSecurityInitializationError(
      `[${fatalPrefix} WRITE FAILED] Could not persist "${filePath}": ${(writeErr as Error).message}`
    );
  }
}

export function initializeServerSecurity(options: InitializeServerSecurityOptions = {}): ServerSecurityStatus {
  const secretDir = options.dataDir
    ? path.resolve(options.dataDir)
    : resolvePersistentDataDir(DEFAULT_DATA_DIR);

  const authSecretFile = path.join(secretDir, '.auth-secret');
  const adminSecretFile = path.join(secretDir, '.admin-secret');

  // Evaluate prior-initialization BEFORE resolving/creating either secret file
  const hadPriorInitialization = detectPriorInitializationEvidence(secretDir, options);

  const isProductionLikeEnv =
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean((process.env.RENDER_SERVICE_ID || '').trim()) ||
    Boolean((process.env.RENDER_EXTERNAL_URL || '').trim());

  const allowFirstRunSecretGeneration = Boolean(
    !hadPriorInitialization && options.allowFirstRunSecretGeneration === true
  );

  const rawEnvAuth = (process.env.FATTESHHA_AUTH_SECRET || process.env.SESSION_SECRET || '').trim();
  const rawEnvAdmin = (process.env.FATTESHHA_ADMIN_SECRET || '').trim();

  const authResolved = resolveSecretFromEnvOrFile({
    secretLabel: 'auth',
    envValue: rawEnvAuth,
    envMinLength: 16,
    fileMinLength: 32,
    byteLength: 48,
    secretDir,
    filePath: authSecretFile,
    hadPriorInitialization,
    allowFirstRunSecretGeneration,
    isProductionLikeEnv,
    envVarName: 'FATTESHHA_AUTH_SECRET'
  });

  const adminResolved = resolveSecretFromEnvOrFile({
    secretLabel: 'admin',
    envValue: rawEnvAdmin,
    envMinLength: 16,
    fileMinLength: 24,
    byteLength: 32,
    secretDir,
    filePath: adminSecretFile,
    hadPriorInitialization,
    allowFirstRunSecretGeneration,
    isProductionLikeEnv,
    envVarName: 'FATTESHHA_ADMIN_SECRET'
  });

  securityState.initialized = true;
  securityState.dataDir = secretDir;
  securityState.authSecret = authResolved.secret;
  securityState.authSource = authResolved.source;
  securityState.adminSecret = adminResolved.secret;
  securityState.adminSource = adminResolved.source;
  securityState.hadPriorInitialization = hadPriorInitialization;

  return {
    initialized: true,
    dataDir: secretDir,
    authSource: authResolved.source,
    adminSource: adminResolved.source,
    hadPriorInitialization
  };
}

export function isServerSecurityInitialized(): boolean {
  return securityState.initialized;
}

function requireInitializedAuthSecret(): string {
  if (!securityState.initialized || !securityState.authSecret) {
    throw new ServerSecurityInitializationError(
      '[FATAL SECURITY STATE] Auth secret accessed before initializeServerSecurity() completed.'
    );
  }
  return securityState.authSecret;
}

function requireInitializedAdminSecret(): string {
  if (!securityState.initialized || !securityState.adminSecret) {
    throw new ServerSecurityInitializationError(
      '[FATAL SECURITY STATE] Admin secret accessed before initializeServerSecurity() completed.'
    );
  }
  return securityState.adminSecret;
}

export function getAuthSecretSource(): SecretSource {
  if (!securityState.initialized || !securityState.authSource) {
    throw new ServerSecurityInitializationError(
      '[FATAL SECURITY STATE] Auth secret source accessed before initializeServerSecurity() completed.'
    );
  }
  return securityState.authSource;
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

  const cleanUser = normalizeUsernameClean(user.username);
  const isCandidateAlreadyFtsPw = candidatePassword.startsWith('fts_pw_');
  const legacyClientHash = isCandidateAlreadyFtsPw
    ? candidatePassword
    : computeLegacyClientPasswordHash(cleanUser, candidatePassword);

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

      // Support legacy `fts_pw_` hash that was previously wrapped inside scrypt:
      if (!isCandidateAlreadyFtsPw) {
        const derivedLegacyBuf = crypto.scryptSync(legacyClientHash, salt, 64);
        if (
          expectedBuf.length === derivedLegacyBuf.length &&
          crypto.timingSafeEqual(expectedBuf, derivedLegacyBuf)
        ) {
          user.passwordHash = hashPasswordScrypt(candidatePassword);
          return { valid: true, upgraded: true };
        }
      }

      return { valid: false, upgraded: false };
    } catch {
      return { valid: false, upgraded: false };
    }
  }

  // Legacy migration check (plain-text seed or legacy `fts_pw_` hash)
  if (stored === candidatePassword || stored === legacyClientHash) {
    if (!isCandidateAlreadyFtsPw) {
      user.passwordHash = hashPasswordScrypt(candidatePassword);
      return { valid: true, upgraded: true };
    }
    return { valid: true, upgraded: false };
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
    .createHmac('sha256', requireInitializedAuthSecret())
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
      .createHmac('sha256', requireInitializedAuthSecret())
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
    .createHmac('sha256', requireInitializedAuthSecret())
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
      .createHmac('sha256', requireInitializedAuthSecret())
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
  return crypto.createHmac('sha256', requireInitializedAuthSecret()).update(data).digest('base64url');
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

export function getResolvedAdminSecretForServerOnly(): string {
  return requireInitializedAdminSecret();
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
    .createHmac('sha256', `${requireInitializedAuthSecret()}:admin`)
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
      .createHmac('sha256', `${requireInitializedAuthSecret()}:admin`)
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

