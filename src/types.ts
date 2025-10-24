/**
 * Core types for the sync engine
 */

// Unique identifier for documents
export type DocumentId = string;

// Timestamp for Last-Write-Wins conflict resolution
export type Timestamp = number;

// Version information for a document
export interface DocumentVersion {
  id: DocumentId;
  timestamp: Timestamp;
  checksum?: string; // Optional content hash for integrity
}

// Document with metadata
export interface Document<T = unknown> {
  id: DocumentId;
  data: T;
  version: DocumentVersion;
  deleted?: boolean; // For soft deletes
}

// Change operation types
export type ChangeOperation = 'create' | 'update' | 'delete';

// Individual change record
export interface ChangeRecord<T = unknown> {
  id: DocumentId;
  operation: ChangeOperation;
  data: T | null; // null for deletes
  version: DocumentVersion;
  localTimestamp: Timestamp; // When the change was made locally
}

// Batch of changes for sync operations
export interface ChangeBatch<T = unknown> {
  changes: ChangeRecord<T>[];
  lastSyncTimestamp?: Timestamp;
}

// Sync state information
export interface SyncState {
  lastPullTimestamp: Timestamp;
  lastPushTimestamp: Timestamp;
  pendingChanges: number;
  isOnline: boolean;
  isSyncing: boolean;
}

// Conflict information
export interface ConflictInfo<T = unknown> {
  documentId: DocumentId;
  localVersion: DocumentVersion;
  remoteVersion: DocumentVersion;
  localData: T;
  remoteData: T;
}

// Result of conflict resolution
export interface ConflictResolution<T = unknown> {
  resolvedData: T;
  resolvedVersion: DocumentVersion;
}
