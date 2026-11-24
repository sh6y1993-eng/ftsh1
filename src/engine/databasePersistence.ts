import fs from 'node:fs';
import path from 'node:path';

/**
 * Interface representing the core persisted state of Fatteshha game database.
 */
export interface DatabaseState {
  users: Record<string, any>;
  localProfiles: Record<string, { id: string; name: string; avatar: string; color: string }>;
  leaderboard: { username: string; displayName: string; avatar: string; xp: number; wins: number; stars: number }[];
  unifiedDailyAttempts?: Record<string, any>;
  unifiedDailyStreaks?: Record<string, any>;
  deletedUsernames?: string[];
  reports?: any[];
  adminAuditLog?: any[];
}

export interface ValidBackupCandidate {
  filename: string;
  filePath: string;
  timestamp: number;
  state: DatabaseState;
  userCount: number;
}

export interface InitializationReceipt {
  version: number;
  status: 'INITIALIZED';
  targetFile: string;
  initializedAt: string;
  receiptNonce: string;
}

export interface LoadDatabaseOptions {
  testDbFile?: string;
  backupDir?: string;
  corruptedDir?: string;
  maxBackups?: number;
  onStateLoaded?: (state: DatabaseState) => void;
  allowFirstRunInit?: boolean;
  isTestIsolation?: boolean;
  hostReceiptDir?: string;
  storageReceiptFile?: string;
  simulateReceiptWriteFailure?: boolean;
}

export class DatabasePersistenceError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabasePersistenceError';
    this.cause = cause;
  }
}

/**
 * Resolves the authoritative persistent data directory:
 * 1. Explicit FATTESHHA_DATA_DIR environment variable (e.g. /var/data on Render).
 * 2. Mounted Render Persistent Disk at /var/data when running on Render or in production.
 * 3. Fallback local ./data directory.
 */
export function resolvePersistentDataDir(fallbackDataDir?: string): string {
  const envDataDir = (process.env.FATTESHHA_DATA_DIR || '').trim();
  if (envDataDir) {
    return path.resolve(envDataDir);
  }

  const renderDiskPath = '/var/data';
  try {
    if (
      (process.env.RENDER === 'true' || process.env.NODE_ENV === 'production') &&
      fs.existsSync(renderDiskPath) &&
      fs.statSync(renderDiskPath).isDirectory()
    ) {
      fs.accessSync(renderDiskPath, fs.constants.R_OK | fs.constants.W_OK);
      return renderDiskPath;
    }
  } catch {
    // Ignore unwritable /var/data probe and fall back
  }

  return fallbackDataDir ? path.resolve(fallbackDataDir) : path.resolve('data');
}

/**
 * Validates that an unparsed or parsed object satisfies the required DatabaseState schema.
 * Rejects primitives, null, arrays, empty objects missing core tables, or malformed user maps.
 */
export function isValidDatabaseState(parsed: unknown): parsed is DatabaseState {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;

  // 1. users must be a non-null object (not array)
  if (!obj.users || typeof obj.users !== 'object' || Array.isArray(obj.users)) {
    return false;
  }

  // 2. localProfiles must be an object
  if (!obj.localProfiles || typeof obj.localProfiles !== 'object' || Array.isArray(obj.localProfiles)) {
    return false;
  }

  // 3. leaderboard must be an array
  if (!Array.isArray(obj.leaderboard)) {
    return false;
  }

  // 4. Validate user records structure
  const userEntries = Object.entries(obj.users as Record<string, unknown>);
  for (const [, u] of userEntries) {
    if (!u || typeof u !== 'object' || Array.isArray(u)) {
      return false;
    }
    const userRec = u as Record<string, unknown>;
    if (typeof userRec.id !== 'string' || typeof userRec.username !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Creates a clean default database state for genuine first-run initializations.
 */
export function createFreshDefaultDatabaseState(): DatabaseState {
  return {
    users: {},
    localProfiles: {
      p1: { id: 'p1', name: 'اللاعب 1 (فهد)', avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg', color: '#0ea5e9' },
      p2: { id: 'p2', name: 'اللاعب 2 (سارة)', avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg', color: '#ec4899' },
      p3: { id: 'p3', name: 'اللاعب 3 (عبدالله)', avatar: '/assets/images/avatar_kuwaiti_boy_1794404782928.jpg', color: '#10b981' },
      p4: { id: 'p4', name: 'اللاعب 4 (ريم)', avatar: '/assets/images/avatar_kuwaiti_girl_1794404783186.jpg', color: '#f59e0b' }
    },
    leaderboard: [],
    unifiedDailyAttempts: {},
    unifiedDailyStreaks: {},
    deletedUsernames: [],
    reports: [],
    adminAuditLog: []
  };
}

/**
 * Writes data atomically to a target file.
 * Guaranteed steps:
 * 1. Writes to a unique temp file in the same filesystem directory.
 * 2. Flushes data to disk with fs.fsyncSync before close to prevent 0-byte/corrupted files on crash.
 * 3. Atomically replaces targetFile via fs.renameSync (POSIX atomic replacement).
 * 4. Fsyncs directory when supported.
 * 5. Cleans up temp file if any error occurs; targetFile remains untouched until rename succeeds.
 */
export function atomicWriteJsonFile(targetFile: string, state: unknown): void {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const serialized = JSON.stringify(state, null, 2);
  const tmpFile = `${targetFile}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpFile, 'w');
    fs.writeFileSync(fd, serialized, 'utf-8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    // Atomically swap file pointer
    fs.renameSync(tmpFile, targetFile);

    // Optional directory sync on POSIX filesystems
    try {
      const dirFd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Directory fsync is platform dependent; ignore unsupported environments
    }
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
    throw new DatabasePersistenceError(`Atomic write failed for ${targetFile}: ${(err as Error).message}`, err);
  }
}

/**
 * Parses timestamp from backup filename (ISO pattern: database-backup-YYYY-MM-DDTHH-mm-ss-SSSZ.json)
 * or falls back to file modification time.
 */
export function extractBackupTimestamp(filename: string, fileMtimeMs: number): number {
  const match = filename.match(/database-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json/i);
  if (match) {
    const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/i, 'T$1:$2:$3.$4Z');
    const parsed = Date.parse(iso);
    if (!isNaN(parsed)) return parsed;
  }
  return fileMtimeMs;
}

/**
 * Scans a backup directory, parses every backup file, validates schema and data integrity,
 * and returns the NEWEST VALID backup (ignoring any corrupted or empty backup files).
 */
export function findNewestValidBackup(backupDir: string): ValidBackupCandidate | null {
  if (!fs.existsSync(backupDir)) return null;

  const files = fs
    .readdirSync(backupDir)
    .filter(f => f.startsWith('database-backup-') && f.endsWith('.json'));

  const validCandidates: ValidBackupCandidate[] = [];

  for (const filename of files) {
    const fullPath = path.join(backupDir, filename);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size === 0) {
        continue;
      }
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!isValidDatabaseState(parsed)) {
        continue;
      }

      const timestamp = extractBackupTimestamp(filename, stat.mtimeMs);
      validCandidates.push({
        filename,
        filePath: fullPath,
        timestamp,
        state: parsed,
        userCount: Object.keys(parsed.users || {}).length
      });
    } catch {
      // Corrupt backup file, safely skip
    }
  }

  if (validCandidates.length === 0) return null;

  // Sort descending: newest timestamp first
  validCandidates.sort((a, b) => b.timestamp - a.timestamp);
  return validCandidates[0];
}

// In-flight backup lock flag to prevent overlapping backup executions
let isBackupOperationInProgress = false;

/**
 * Creates a verified rolling backup of the given database file:
 * - Guards against concurrent in-flight backups.
 * - Verifies the source file is NOT empty and contains VALID JSON before backing up (never backs up corrupt data).
 * - Writes atomically with fsync.
 * - Reads back and validates the backup file immediately after creation.
 * - Prunes older backups without ever deleting the last valid backup.
 */
export function createRollingBackupIfExists(
  targetFile: string,
  options: { backupDir?: string; maxBackups?: number; testDbFile?: string } = {}
): boolean {
  if (isBackupOperationInProgress) {
    console.warn('[BACKUP LOCK] Another backup operation is currently active, skipping to prevent overlap.');
    return false;
  }
  isBackupOperationInProgress = true;

  try {
    const testDb = options.testDbFile;
    if (!fs.existsSync(targetFile) || (testDb && targetFile === testDb)) {
      return false;
    }

    const stat = fs.statSync(targetFile);
    if (stat.size === 0) {
      console.warn(`[BACKUP REFUSED] Target file ${targetFile} is 0 bytes; refusing to create backup of empty file.`);
      return false;
    }

    const raw = fs.readFileSync(targetFile, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.warn(`[BACKUP REFUSED] Target file ${targetFile} has invalid JSON; refusing to create backup of corrupt file.`);
      return false;
    }

    if (!isValidDatabaseState(parsed)) {
      console.warn(`[BACKUP REFUSED] Target file ${targetFile} does not satisfy valid DatabaseState schema.`);
      return false;
    }

    const backupDir = options.backupDir || path.join(path.dirname(targetFile), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `database-backup-${stamp}.json`);

    // Atomically write backup file with fsync
    atomicWriteJsonFile(backupPath, parsed);

    // Verify newly written backup immediately
    const verifyRaw = fs.readFileSync(backupPath, 'utf-8');
    const verifyParsed = JSON.parse(verifyRaw);
    if (!isValidDatabaseState(verifyParsed)) {
      console.error(`[BACKUP VERIFICATION FAILED] Backup file at ${backupPath} failed schema validation! Removing...`);
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // ignore
      }
      return false;
    }

    // Prune old backups, retaining up to maxBackups (default 20), safeguarding at least one valid backup
    pruneOldBackups(backupDir, options.maxBackups ?? 20);
    return true;
  } catch (err) {
    console.error('[BACKUP ERROR] Failed to create rolling backup:', err);
    return false;
  } finally {
    isBackupOperationInProgress = false;
  }
}

/**
 * Prunes older backups beyond maxToKeep.
 * Critical safety rule: NEVER deletes backups if doing so would leave 0 valid backups.
 */
export function pruneOldBackups(backupDir: string, maxToKeep = 20): void {
  try {
    if (!fs.existsSync(backupDir)) return;
    const files = fs
      .readdirSync(backupDir)
      .filter(f => f.startsWith('database-backup-') && f.endsWith('.json'))
      .sort((a, b) => {
        // Sort ascending by timestamp (oldest first)
        const timeA = extractBackupTimestamp(a, 0);
        const timeB = extractBackupTimestamp(b, 0);
        return timeA - timeB;
      });

    if (files.length <= maxToKeep) {
      return;
    }

    // Check which files are valid before deleting anything
    const validFileSet = new Set<string>();
    for (const f of files) {
      try {
        const full = path.join(backupDir, f);
        const content = fs.readFileSync(full, 'utf-8');
        if (isValidDatabaseState(JSON.parse(content))) {
          validFileSet.add(f);
        }
      } catch {
        // ignore corrupt
      }
    }

    while (files.length > maxToKeep) {
      const oldest = files.shift();
      if (!oldest) break;

      // If the oldest file is valid, ensure we have at least 1 valid backup remaining
      if (validFileSet.has(oldest)) {
        if (validFileSet.size <= 1) {
          // Never delete the last remaining valid backup!
          files.push(oldest);
          break;
        }
        validFileSet.delete(oldest);
      }

      try {
        fs.unlinkSync(path.join(backupDir, oldest));
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('[BACKUP PRUNE WARNING] Error during backup pruning:', err);
  }
}

/**
 * Committed In-Memory State Tracker to enforce RAM / Disk Consistency:
 * Whenever an atomic save succeeds, the committed snapshot is recorded.
 * If saving fails, the in-memory state object is immediately rolled back in-place
 * to the exact state matching the on-disk file, preventing uncommitted coins,
 * XP, stages, rewards, or deletions from remaining active in RAM.
 */
const COMMITTED_SNAPSHOT_SYM = Symbol.for('fatteshha_committed_snapshot');
const committedStateMap = new WeakMap<object, DatabaseState>();

export function registerCommittedState(state: DatabaseState): void {
  try {
    const clone = structuredClone(state);
    committedStateMap.set(state, clone);
    try {
      Object.defineProperty(state, COMMITTED_SNAPSHOT_SYM, {
        value: structuredClone(clone),
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch {
      // non-configurable or frozen object fallback
    }
  } catch {
    const jsonClone = JSON.parse(JSON.stringify(state));
    committedStateMap.set(state, jsonClone);
    try {
      Object.defineProperty(state, COMMITTED_SNAPSHOT_SYM, {
        value: JSON.parse(JSON.stringify(jsonClone)),
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch {
      // non-configurable or frozen object fallback
    }
  }
}

export function rollbackInMemoryStateToLastCommitted(state: DatabaseState): boolean {
  const committed = (state as any)[COMMITTED_SNAPSHOT_SYM] || committedStateMap.get(state);
  if (!committed) {
    return false;
  }
  // Mutate state in-place so all external references remain synchronized
  for (const key of Object.keys(state)) {
    if (!(key in committed)) {
      delete (state as any)[key];
    }
  }
  for (const [key, val] of Object.entries(committed)) {
    try {
      (state as any)[key] = structuredClone(val);
    } catch {
      (state as any)[key] = JSON.parse(JSON.stringify(val));
    }
  }
  return true;
}

export function saveDatabaseStateWithRollback(
  targetFile: string,
  state: DatabaseState,
  options?: {
    onBeforeSave?: (state: DatabaseState) => void;
    customRollback?: () => void;
  }
): boolean {
  if (options?.onBeforeSave) {
    options.onBeforeSave(state);
  }

  try {
    atomicWriteJsonFile(targetFile, state);
    // Write succeeded: update committed snapshot
    registerCommittedState(state);
    return true;
  } catch (err) {
    // Write failed! Revert in-memory state immediately to prevent RAM / Disk drift!
    if (options?.customRollback) {
      try {
        options.customRollback();
      } catch (rbErr) {
        console.error('[ROLLBACK ERROR] Custom rollback failed:', rbErr);
      }
    }
    const rolledBack = rollbackInMemoryStateToLastCommitted(state);
    if (options?.onBeforeSave) {
      try {
        options.onBeforeSave(state);
      } catch {
        // ignore
      }
    }
    console.error(
      `[DATABASE SAVE FAILED] Changes to "${targetFile}" failed to persist to disk. ` +
      (rolledBack
        ? 'In-memory state was automatically rolled back to match on-disk database.'
        : 'In-memory state could not be rolled back (no committed snapshot found).'),
      (err as Error).message
    );
    throw new DatabasePersistenceError(`فشل حفظ قاعدة البيانات على القرص: ${(err as Error).message}`, err);
  }
}

export function getStorageReceiptPath(targetFile: string, options?: LoadDatabaseOptions): string {
  if (options?.storageReceiptFile) return options.storageReceiptFile;
  const dir = path.dirname(targetFile);
  return path.join(dir, '.database_initialization_receipt.json');
}

export function getHostReceiptPath(targetFile: string, options?: LoadDatabaseOptions): string {
  const hostDir = options?.hostReceiptDir || path.resolve('.');
  return path.join(hostDir, '.server_first_run_completed.json');
}

export function isStorageReceiptPresent(targetFile: string, options?: LoadDatabaseOptions): boolean {
  const p = getStorageReceiptPath(targetFile, options);
  try {
    if (!fs.existsSync(p)) return false;
    const content = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(content);
    return Boolean(parsed && parsed.status === 'INITIALIZED');
  } catch {
    return false;
  }
}

export function isHostReceiptPresent(targetFile: string, options?: LoadDatabaseOptions): boolean {
  if (options?.isTestIsolation && !options?.hostReceiptDir) {
    return false;
  }
  const p = getHostReceiptPath(targetFile, options);
  try {
    if (!fs.existsSync(p)) return false;
    const content = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(content);
    return Boolean(parsed && parsed.status === 'INITIALIZED');
  } catch {
    return false;
  }
}

export function writeInitializationReceipts(
  targetFile: string,
  state: DatabaseState,
  options?: LoadDatabaseOptions
): void {
  if (options?.simulateReceiptWriteFailure) {
    throw new DatabasePersistenceError('Simulated receipt write failure for verification testing.');
  }

  const receipt: InitializationReceipt = {
    version: 1,
    status: 'INITIALIZED',
    targetFile: path.resolve(targetFile),
    initializedAt: new Date().toISOString(),
    receiptNonce: `init_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  };

  const storageReceiptPath = getStorageReceiptPath(targetFile, options);
  atomicWriteJsonFile(storageReceiptPath, receipt);

  if (!options?.isTestIsolation || options?.hostReceiptDir) {
    const hostReceiptPath = getHostReceiptPath(targetFile, options);
    atomicWriteJsonFile(hostReceiptPath, receipt);
  }
}

export function consumeFirstRunAuthorization(targetFile: string, options?: LoadDatabaseOptions): void {
  const dir = path.dirname(targetFile);
  const hostDir = options?.hostReceiptDir || path.resolve('.');

  const candidateMarkers = [
    path.join(dir, '.authorized_first_run'),
    path.join(hostDir, '.authorized_first_run'),
    path.join(dir, '.fatteshha_first_run_token'),
    path.join(hostDir, '.fatteshha_first_run_token')
  ];

  for (const m of candidateMarkers) {
    if (fs.existsSync(m)) {
      try {
        fs.unlinkSync(m);
      } catch {
        // ignore
      }
    }
  }

  delete process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT;
  delete process.env.FATTESHHA_INIT_FIRST_RUN;
}

export function ensureReceiptsCreated(targetFile: string, options?: LoadDatabaseOptions): void {
  try {
    const storageReceiptPath = getStorageReceiptPath(targetFile, options);
    if (!fs.existsSync(storageReceiptPath)) {
      const receipt: InitializationReceipt = {
        version: 1,
        status: 'INITIALIZED',
        targetFile: path.resolve(targetFile),
        initializedAt: new Date().toISOString(),
        receiptNonce: `init_existing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      };
      atomicWriteJsonFile(storageReceiptPath, receipt);
    }
    if (!options?.isTestIsolation || options?.hostReceiptDir) {
      const hostReceiptPath = getHostReceiptPath(targetFile, options);
      if (!fs.existsSync(hostReceiptPath)) {
        const receipt: InitializationReceipt = {
          version: 1,
          status: 'INITIALIZED',
          targetFile: path.resolve(targetFile),
          initializedAt: new Date().toISOString(),
          receiptNonce: `init_existing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        };
        atomicWriteJsonFile(hostReceiptPath, receipt);
      }
    }
  } catch {
    // Non-blocking for existing databases
  }
}

/**
 * Loads database with automated recovery and corruption protection:
 * 1. If file exists and is healthy: loads normally without overwriting data, takes verified backup, returns state.
 * 2. If file exists but is 0 bytes or corrupt JSON:
 *    - Preserves corrupted file in `corrupted/` directory with timestamp.
 *    - Does NOT overwrite with empty default data.
 *    - Searches `backups/` for the NEWEST VALID backup.
 *    - Restores atomically to targetFile.
 * 3. If file is corrupt and NO valid backup exists:
 *    - ABORTS server startup with a descriptive fatal error.
 *    - Does NOT create a default database.
 *    - Preserves the corrupted file.
 * 4. If file does NOT exist:
 *    - If valid backups exist, auto-heals from the newest valid backup.
 *    - If storage receipt or host receipt exists, STRICTLY HALTS (guards against unmounted volume / storage loss).
 *    - If neither exists, strictly requires proof of authorized first run; otherwise halts.
 */
export function loadDatabaseState(targetFile: string, options: LoadDatabaseOptions = {}): DatabaseState {
  const dir = path.dirname(targetFile);
  const backupDir = options.backupDir || path.join(dir, 'backups');
  const corruptedDir = options.corruptedDir || path.join(dir, 'corrupted');
  const testDbFile = options.testDbFile;
  const isTest = options.isTestIsolation || (Boolean(testDbFile) && targetFile === testDbFile);

  const fileExists = fs.existsSync(targetFile);

  if (fileExists) {
    const stat = fs.statSync(targetFile);
    let isHealthy = false;
    let parsedState: DatabaseState | null = null;

    if (stat.size > 0) {
      try {
        const content = fs.readFileSync(targetFile, 'utf-8');
        const parsed = JSON.parse(content);
        if (isValidDatabaseState(parsed)) {
          isHealthy = true;
          parsedState = parsed;
        } else {
          console.error(`[DATABASE INVALID SCHEMA] File ${targetFile} does not contain valid DatabaseState root tables.`);
        }
      } catch (parseErr) {
        console.error(`[DATABASE PARSE CORRUPTION] Failed to parse ${targetFile}:`, (parseErr as Error).message);
      }
    } else {
      console.error(`[DATABASE EMPTY DETECTED] File ${targetFile} exists but has 0 bytes (empty file).`);
    }

    // 1. File is valid and healthy -> load normally!
    if (isHealthy && parsedState) {
      if (options.onStateLoaded) {
        options.onStateLoaded(parsedState);
      }
      createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
      registerCommittedState(parsedState);
      ensureReceiptsCreated(targetFile, options);
      return parsedState;
    }

    // 2. File exists but is corrupt or empty:
    // Preserve corrupted file for forensics without deleting it!
    if (!fs.existsSync(corruptedDir)) {
      fs.mkdirSync(corruptedDir, { recursive: true });
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptedInvestigationPath = path.join(corruptedDir, `database-corrupted-${stamp}.json.corrupt`);
    try {
      fs.copyFileSync(targetFile, corruptedInvestigationPath);
      console.warn(`[CORRUPTED FILE PRESERVED] Saved corrupted database copy to: ${corruptedInvestigationPath}`);
    } catch (copyErr) {
      console.error('[CORRUPTED PRESERVE ERROR] Failed to save corrupted copy:', copyErr);
    }

    // Search backups for the newest valid backup
    const newestValidBackup = findNewestValidBackup(backupDir);

    if (newestValidBackup) {
      console.warn(
        `[DATABASE AUTO-RECOVERY] Restoring database from newest valid backup "${newestValidBackup.filename}" with ${newestValidBackup.userCount} users...`
      );
      if (options.onStateLoaded) {
        options.onStateLoaded(newestValidBackup.state);
      }
      atomicWriteJsonFile(targetFile, newestValidBackup.state);
      createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
      registerCommittedState(newestValidBackup.state);
      ensureReceiptsCreated(targetFile, options);
      console.warn(`[DATABASE AUTO-RECOVERY SUCCESS] Database restored from ${newestValidBackup.filename}.`);
      return newestValidBackup.state;
    }

    // 3. No valid backup exists -> HALT STARTUP!
    const fatalMsg =
      `[FATAL DATABASE CORRUPTION] File "${targetFile}" is corrupt/empty, and NO valid backups exist in "${backupDir}". ` +
      `Server startup is ABORTED to protect player data from being overwritten with default seed data. Investigation copy: "${corruptedInvestigationPath}".`;
    console.error(fatalMsg);
    throw new DatabasePersistenceError(fatalMsg);
  }

  // 4. File does NOT exist at all:
  // Check if backups exist (accidental deletion or disk move)
  const newestValidBackup = findNewestValidBackup(backupDir);
  if (newestValidBackup && (!testDbFile || targetFile !== testDbFile)) {
    console.warn(
      `[DATABASE AUTO-HEAL] File "${targetFile}" was missing, but found valid backup "${newestValidBackup.filename}". Auto-recovering...`
    );
    if (options.onStateLoaded) {
      options.onStateLoaded(newestValidBackup.state);
    }
    atomicWriteJsonFile(targetFile, newestValidBackup.state);
    createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
    registerCommittedState(newestValidBackup.state);
    ensureReceiptsCreated(targetFile, options);
    return newestValidBackup.state;
  }

  // Check permanent receipts to catch storage loss / unmounted volume:
  const storageReceiptExists = isStorageReceiptPresent(targetFile, options);
  const hostReceiptExists = isHostReceiptPresent(targetFile, options);

  // If storage receipt exists on the volume, but DB and backups are gone:
  if (storageReceiptExists) {
    const missingOnStorageMsg =
      `[FATAL DATABASE MISSING ON INITIALIZED STORAGE] Storage receipt exists at "${getStorageReceiptPath(targetFile, options)}", ` +
      `proving that storage was previously initialized. However, database file "${targetFile}" is missing and no valid backups exist in "${backupDir}". ` +
      `Server startup is ABORTED to protect player data from accidental erasure.`;
    console.error(missingOnStorageMsg);
    throw new DatabasePersistenceError(missingOnStorageMsg);
  }

  // If host receipt exists on this host, but DB, backups, and storage receipt are ALL missing:
  // This is the EXACT signature of an unmounted or detached persistent volume!
  if (hostReceiptExists) {
    const unmountedVolumeMsg =
      `[FATAL STORAGE LOSS / UNMOUNTED VOLUME DETECTED] Server host receipt exists at "${getHostReceiptPath(targetFile, options)}", ` +
      `proving that this server instance already completed first-run initialization previously. ` +
      `However, database file "${targetFile}", backup directory, and storage receipt are ALL missing! ` +
      `The persistent volume appears to be unmounted or detached. ` +
      `Server startup is ABORTED immediately. Creating a fresh empty database is strictly forbidden to protect existing player accounts!`;
    console.error(unmountedVolumeMsg);
    throw new DatabasePersistenceError(unmountedVolumeMsg);
  }

  // Check whether first-run initialization is proven with explicit authorization:
  const hostDir = options.hostReceiptDir || path.resolve('.');
  const markerInDir = path.join(dir, '.authorized_first_run');
  const markerInHost = path.join(hostDir, '.authorized_first_run');
  const hasMarkerFile = fs.existsSync(markerInDir) || fs.existsSync(markerInHost);

  const hasEnvAuth =
    process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT === '1' ||
    process.env.FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT === 'true' ||
    process.env.FATTESHHA_INIT_FIRST_RUN === '1' ||
    process.env.FATTESHHA_INIT_FIRST_RUN === 'true';

  const isExplicitlyAuthorized =
    options.allowFirstRunInit === true ||
    isTest ||
    hasMarkerFile ||
    hasEnvAuth;

  if (!isExplicitlyAuthorized) {
    const unauthorizedMsg =
      `[FATAL FIRST-RUN AUTHORIZATION REQUIRED] Database file "${targetFile}" and backup directory "${backupDir}" are missing. ` +
      `Automatic creation of an empty database was REJECTED because there is no explicit first-run authorization. ` +
      `If this is a genuine first-time installation, create authorization marker file (${markerInDir}) or set environment variable FATTESHHA_ALLOW_INITIAL_DATABASE_BOOT=1. ` +
      `Server startup halted to prevent accidental data erasure from a damaged or unmounted volume.`;
    console.error(unauthorizedMsg);
    throw new DatabasePersistenceError(unauthorizedMsg);
  }

  // Authorized first-run: Execute strict transactional initialization!
  console.log(`[DATABASE INITIALIZATION AUTHORIZED] Authorized first run verified for "${targetFile}". Initializing fresh default state.`);
  const defaultState = createFreshDefaultDatabaseState();
  if (options.onStateLoaded) {
    options.onStateLoaded(defaultState);
  }

  let dbWritten = false;
  let backupWritten = false;
  const storageReceiptPath = getStorageReceiptPath(targetFile, options);
  const hostReceiptPath = getHostReceiptPath(targetFile, options);

  try {
    // 1. Write fresh database atomically
    atomicWriteJsonFile(targetFile, defaultState);
    dbWritten = true;

    // 2. Create initial rolling backup
    createRollingBackupIfExists(targetFile, { backupDir, testDbFile });
    backupWritten = true;

    // 3. Write permanent receipts (volume receipt and host receipt)
    writeInitializationReceipts(targetFile, defaultState, options);

    // 4. Consume authorization (unlink marker files and remove env vars)
    consumeFirstRunAuthorization(targetFile, options);

    registerCommittedState(defaultState);
    return defaultState;
  } catch (err) {
    // Rollback partial initialization (Requirement 5)
    console.error('[DATABASE INITIALIZATION FAILED] Initialization failed during atomic boot. Rolling back...', err);
    if (dbWritten && fs.existsSync(targetFile)) {
      try { fs.unlinkSync(targetFile); } catch {}
    }
    if (fs.existsSync(storageReceiptPath)) {
      try { fs.unlinkSync(storageReceiptPath); } catch {}
    }
    if (fs.existsSync(hostReceiptPath)) {
      try { fs.unlinkSync(hostReceiptPath); } catch {}
    }
    throw new DatabasePersistenceError(`فشل إتمام التهيئة الأولى لقاعدة البيانات: ${(err as Error).message}`, err);
  }
}

/**
 * 6-hour periodic backup scheduler
 */
export function startPeriodicBackupSchedule(
  targetFile: string,
  options: { backupDir?: string; intervalMs?: number; testDbFile?: string } = {}
): NodeJS.Timeout {
  const interval = options.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
  const timer = setInterval(() => {
    try {
      createRollingBackupIfExists(targetFile, options);
    } catch (err) {
      console.error('[PERIODIC BACKUP ERROR] Scheduled backup encountered error:', err);
    }
  }, interval);
  timer.unref();
  return timer;
}

export function stopPeriodicBackupSchedule(timer: NodeJS.Timeout | null): void {
  if (timer) {
    clearInterval(timer);
  }
}
