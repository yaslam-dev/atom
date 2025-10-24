/**
 * Core interfaces for the sync engine adapters
 */

import type {
  Document,
  DocumentId,
  ChangeRecord,
  ChangeBatch,
  DocumentVersion,
  ConflictInfo,
  ConflictResolution,
  SyncState,
  Timestamp,
} from './types';
import { SYNC_EVENT, SYNC_OPERATION } from './enums';

/**
 * Storage adapter interface - implement this for any storage backend
 * (localStorage, IndexedDB, SQLite, etc.)
 */
export interface StoreAdapter<T = unknown> {
  // Document operations
  get(id: DocumentId): Promise<Document<T> | null>;
  put(document: Document<T>): Promise<void>;
  delete(id: DocumentId): Promise<void>;

  // Batch operations for better performance
  getBatch(ids: DocumentId[]): Promise<Document<T>[]>;
  putBatch(documents: Document<T>[]): Promise<void>;

  // Query operations
  getAll(): Promise<Document<T>[]>;
  getAllIds(): Promise<DocumentId[]>;

  // Change tracking
  getChangesSince(timestamp: Timestamp): Promise<ChangeRecord<T>[]>;
  putChange(change: ChangeRecord<T>): Promise<void>;
  clearChangesBefore(timestamp: Timestamp): Promise<void>;

  // Metadata
  getLastSyncTimestamp(): Promise<Timestamp>;
  setLastSyncTimestamp(timestamp: Timestamp): Promise<void>;

  // Cleanup
  close?(): Promise<void>;
}

/**
 * Network transport adapter interface - implement this for different protocols
 * (HTTP, WebSocket, custom, etc.)
 */
export interface TransportAdapter<T = unknown> {
  // Push local changes to remote
  push(changes: ChangeBatch<T>): Promise<PushResult>;

  // Pull remote changes since timestamp
  pull(sinceTimestamp: Timestamp): Promise<PullResult<T>>;

  // Check if remote is reachable
  isOnline(): Promise<boolean>;

  // Optional: real-time sync support
  onRemoteChange?(callback: (changes: ChangeRecord<T>[]) => void): () => void;
}

/**
 * Push operation result
 */
export interface PushResult {
  success: boolean;
  conflicts?: ConflictInfo[];
  error?: string;
  timestamp?: Timestamp; // Server timestamp of the operation
}

/**
 * Pull operation result
 */
export interface PullResult<T = unknown> {
  success: boolean;
  changes: ChangeRecord<T>[];
  timestamp: Timestamp; // Latest timestamp from server
  error?: string;
}

/**
 * Conflict resolution strategy interface
 */
export interface ConflictResolver<T = unknown> {
  resolve(conflict: ConflictInfo<T>): Promise<ConflictResolution<T>>;
}

/**
 * Event types for the sync engine
 */
export interface SyncEvents<T = unknown> {
  // Document events
  [SYNC_EVENT.DOCUMENT_CREATED]: { document: Document<T> };
  [SYNC_EVENT.DOCUMENT_UPDATED]: { document: Document<T>; previousVersion: DocumentVersion };
  [SYNC_EVENT.DOCUMENT_DELETED]: { id: DocumentId; version: DocumentVersion };

  // Sync events
  [SYNC_EVENT.SYNC_STARTED]: { type: SYNC_OPERATION };
  [SYNC_EVENT.SYNC_COMPLETED]: { type: SYNC_OPERATION; changeCount: number };
  [SYNC_EVENT.SYNC_FAILED]: { type: SYNC_OPERATION; error: string };

  // Conflict events
  [SYNC_EVENT.CONFLICT_DETECTED]: { conflict: ConflictInfo<T> };
  [SYNC_EVENT.CONFLICT_RESOLVED]: { resolution: ConflictResolution<T> };

  // Connection events
  [SYNC_EVENT.CONNECTION_ONLINE]: object;
  [SYNC_EVENT.CONNECTION_OFFLINE]: object;

  // State events
  [SYNC_EVENT.STATE_CHANGED]: { state: SyncState };
}

/**
 * Event emitter interface
 */
export interface EventEmitter<T = unknown> {
  on<K extends keyof SyncEvents<T>>(
    event: K,
    listener: (data: SyncEvents<T>[K]) => void
  ): () => void;
  emit<K extends keyof SyncEvents<T>>(event: K, data: SyncEvents<T>[K]): void;
  off<K extends keyof SyncEvents<T>>(event: K, listener: (data: SyncEvents<T>[K]) => void): void;
  removeAllListeners<K extends keyof SyncEvents<T>>(event?: K): void;
}
