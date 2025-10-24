/**
 * Main SyncEngine class that orchestrates sync operations
 */

import type {
  StoreAdapter,
  TransportAdapter,
  ConflictResolver,
  EventEmitter,
  SyncEvents,
} from './interfaces';
import type {
  Document,
  DocumentId,
  ChangeRecord,
  ChangeBatch,
  SyncState,
  ConflictInfo,
  Timestamp,
} from './types';
import { SYNC_EVENT, SYNC_OPERATION } from './enums';
import { SyncEventEmitter } from './event-emitter';
import { ChangeTracker } from './change-tracker';
import { LastWriteWinsResolver } from './conflict-resolvers';
import { createDocument, cloneDocument, debounce, retry } from './utils';

export interface SyncEngineConfig<T = Record<string, unknown>> {
  store: StoreAdapter<T>;
  transport: TransportAdapter<T>;
  conflictResolver?: ConflictResolver<T>;

  // Configuration options
  syncInterval?: number; // Auto-sync interval in ms (0 to disable)
  batchSize?: number; // Max changes per sync batch
  retryAttempts?: number; // Max retry attempts for failed syncs
  retryDelay?: number; // Base delay for retry backoff
  debounceDelay?: number; // Debounce delay for batching changes
}

/**
 * Main sync engine that coordinates all sync operations
 */
export class SyncEngine<T = Record<string, unknown>> implements EventEmitter<T> {
  private readonly store: StoreAdapter<T>;
  private readonly transport: TransportAdapter<T>;
  private readonly conflictResolver: ConflictResolver<T>;
  private readonly changeTracker: ChangeTracker<T>;
  private readonly eventEmitter: SyncEventEmitter<T>;

  // Configuration
  private readonly config: {
    store: StoreAdapter<T>;
    transport: TransportAdapter<T>;
    conflictResolver: ConflictResolver<T>;
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    debounceDelay: number;
  };

  // State
  private isStarted = false;
  private isSyncing = false;
  private isOnline = false;
  private lastPullTimestamp: Timestamp = 0;
  private lastPushTimestamp: Timestamp = 0;

  // Timers and intervals
  private syncInterval: NodeJS.Timeout | undefined;
  private onlineCheckInterval: NodeJS.Timeout | undefined;
  private readonly debouncePush: () => void;

  constructor(config: SyncEngineConfig<T>) {
    this.store = config.store;
    this.transport = config.transport;
    this.conflictResolver = config.conflictResolver ?? new LastWriteWinsResolver<T>();
    this.changeTracker = new ChangeTracker<T>();
    this.eventEmitter = new SyncEventEmitter<T>();

    // Set defaults
    this.config = {
      store: config.store,
      transport: config.transport,
      conflictResolver: config.conflictResolver ?? new LastWriteWinsResolver<T>(),
      syncInterval: config.syncInterval ?? 30000, // 30 seconds
      batchSize: config.batchSize ?? 100,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      debounceDelay: config.debounceDelay ?? 1000,
    };

    // Create debounced push function
    this.debouncePush = debounce(() => {
      this.push().catch(error => {
        this.emit(SYNC_EVENT.SYNC_FAILED, { type: SYNC_OPERATION.PUSH, error: error.message });
      });
    }, this.config.debounceDelay);
  }

  /**
   * Start the sync engine
   */
  async start(): Promise<void> {
    if (this.isStarted) return;

    this.isStarted = true;

    // Initialize state from store
    await this.initializeState();

    // Check initial online status
    await this.updateOnlineStatus();

    // Set up periodic sync if enabled
    if (this.config.syncInterval > 0) {
      this.syncInterval = setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          void this.sync();
        }
      }, this.config.syncInterval);
    }

    // Set up periodic online status check
    this.onlineCheckInterval = setInterval(() => {
      void this.updateOnlineStatus();
    }, 10000); // Check every 10 seconds

    // Set up real-time sync if supported
    if (this.transport.onRemoteChange) {
      this.transport.onRemoteChange(changes => {
        void this.handleRemoteChanges(changes);
      });
    }

    // Initial sync
    if (this.isOnline) {
      await this.sync();
    }
  }

  /**
   * Stop the sync engine
   */
  async stop(): Promise<void> {
    if (!this.isStarted) return;

    this.isStarted = false;

    // Clear intervals
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    if (this.onlineCheckInterval) {
      clearInterval(this.onlineCheckInterval);
      this.onlineCheckInterval = undefined;
    }

    // Close store if it supports it
    if (this.store.close) {
      await this.store.close();
    }
  }

  /**
   * Document operations
   */
  async get(id: DocumentId): Promise<Document<T> | null> {
    return this.store.get(id);
  }

  async put(document: Document<T>): Promise<void> {
    await this.store.put(document);
    this.changeTracker.recordUpdate(document);

    this.emit(SYNC_EVENT.DOCUMENT_UPDATED, {
      document,
      previousVersion: document.version, // This could be improved to track actual previous version
    });

    // Trigger debounced push
    this.debouncePush();
  }

  async create(data: T, id?: DocumentId): Promise<Document<T>> {
    const document = createDocument(data, id);
    await this.store.put(document);
    this.changeTracker.recordCreate(document);

    this.emit(SYNC_EVENT.DOCUMENT_CREATED, { document });

    // Trigger debounced push
    this.debouncePush();

    return document;
  }

  async update(id: DocumentId, data: T): Promise<Document<T> | null> {
    const existing = await this.store.get(id);
    if (!existing) return null;

    const updated = cloneDocument(existing, data);
    await this.store.put(updated);
    this.changeTracker.recordUpdate(updated);

    this.emit(SYNC_EVENT.DOCUMENT_UPDATED, {
      document: updated,
      previousVersion: existing.version,
    });

    // Trigger debounced push
    this.debouncePush();

    return updated;
  }

  async delete(id: DocumentId): Promise<boolean> {
    const existing = await this.store.get(id);
    if (!existing) return false;

    await this.store.delete(id);
    this.changeTracker.recordDelete(id, existing.version);

    this.emit(SYNC_EVENT.DOCUMENT_DELETED, { id, version: existing.version });

    // Trigger debounced push
    this.debouncePush();

    return true;
  }

  /**
   * Sync operations
   */
  async sync(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    try {
      // Pull first, then push
      await this.pull();
      await this.push();
    } catch {
      // Individual pull/push operations will emit their own error events
      // Don't re-throw to prevent breaking startup or periodic sync
    }
  }

  async pull(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;

    this.isSyncing = true;
    this.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PULL });

    try {
      const result = await retry(
        () => this.transport.pull(this.lastPullTimestamp),
        this.config.retryAttempts,
        this.config.retryDelay
      );

      if (result.success) {
        await this.applyRemoteChanges(result.changes);
        this.lastPullTimestamp = result.timestamp;
        await this.store.setLastSyncTimestamp(this.lastPullTimestamp);

        this.emit(SYNC_EVENT.SYNC_COMPLETED, {
          type: SYNC_OPERATION.PULL,
          changeCount: result.changes.length,
        });
      } else {
        throw new Error(result.error ?? 'Pull failed');
      }
    } catch (error) {
      this.emit(SYNC_EVENT.SYNC_FAILED, {
        type: SYNC_OPERATION.PULL,
        error: (error as Error).message,
      });
    } finally {
      this.isSyncing = false;
      this.emitStateChange();
    }
  }

  async push(): Promise<void> {
    if (this.isSyncing || !this.isOnline) return;
    if (!this.changeTracker.hasPendingChanges()) return;

    this.isSyncing = true;
    this.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PUSH });

    try {
      const changes = this.changeTracker.getPendingChanges().slice(0, this.config.batchSize);
      const batch: ChangeBatch<T> = {
        changes,
        lastSyncTimestamp: this.lastPushTimestamp,
      };

      const result = await retry(
        () => this.transport.push(batch),
        this.config.retryAttempts,
        this.config.retryDelay
      );

      if (result.success) {
        // Handle any conflicts
        if (result.conflicts && result.conflicts.length > 0) {
          await this.resolveConflicts(result.conflicts as ConflictInfo<T>[]);
        }

        // Clear pushed changes
        const maxTimestamp = Math.max(...changes.map(c => c.localTimestamp));
        this.changeTracker.clearChangesBefore(maxTimestamp + 1);

        if (result.timestamp) {
          this.lastPushTimestamp = result.timestamp;
          await this.store.setLastSyncTimestamp(this.lastPushTimestamp);
        }

        this.emit(SYNC_EVENT.SYNC_COMPLETED, {
          type: SYNC_OPERATION.PUSH,
          changeCount: changes.length,
        });
      } else {
        throw new Error(result.error ?? 'Push failed');
      }
    } catch (error) {
      this.emit(SYNC_EVENT.SYNC_FAILED, {
        type: SYNC_OPERATION.PUSH,
        error: (error as Error).message,
      });
    } finally {
      this.isSyncing = false;
      this.emitStateChange();
    }
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return {
      lastPullTimestamp: this.lastPullTimestamp,
      lastPushTimestamp: this.lastPushTimestamp,
      pendingChanges: this.changeTracker.getPendingChangeCount(),
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Event emitter interface
   */
  on<K extends keyof SyncEvents<T>>(
    event: K,
    listener: (data: SyncEvents<T>[K]) => void
  ): () => void {
    return this.eventEmitter.on(event, listener);
  }

  emit<K extends keyof SyncEvents<T>>(event: K, data: SyncEvents<T>[K]): void {
    this.eventEmitter.emit(event, data);
  }

  off<K extends keyof SyncEvents<T>>(event: K, listener: (data: SyncEvents<T>[K]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  removeAllListeners<K extends keyof SyncEvents<T>>(event?: K): void {
    this.eventEmitter.removeAllListeners(event);
  }

  /**
   * Private helper methods
   */
  private async initializeState(): Promise<void> {
    try {
      this.lastPullTimestamp = await this.store.getLastSyncTimestamp();
      this.lastPushTimestamp = this.lastPullTimestamp;
    } catch {
      // Failed to initialize sync state, use defaults
      this.lastPullTimestamp = 0;
      this.lastPushTimestamp = 0;
    }
  }

  private async updateOnlineStatus(): Promise<void> {
    try {
      const wasOnline = this.isOnline;
      this.isOnline = await this.transport.isOnline();

      if (wasOnline !== this.isOnline) {
        this.emit(this.isOnline ? SYNC_EVENT.CONNECTION_ONLINE : SYNC_EVENT.CONNECTION_OFFLINE, {});
        this.emitStateChange();

        // Sync when coming back online
        if (this.isOnline && this.isStarted) {
          setTimeout(() => {
            void this.sync();
          }, 1000);
        }
      }
    } catch {
      // Failed to check online status, assume offline
      this.isOnline = false;
    }
  }

  private async applyRemoteChanges(changes: ChangeRecord<T>[]): Promise<void> {
    for (const change of changes) {
      try {
        await this.applySingleRemoteChange(change);
      } catch (error) {
        // Failed to apply remote change, emit error event
        this.emit(SYNC_EVENT.SYNC_FAILED, {
          type: SYNC_OPERATION.PULL,
          error: `Failed to apply remote change for ${change.id}: ${(error as Error).message}`,
        });
      }
    }
  }

  private async applySingleRemoteChange(change: ChangeRecord<T>): Promise<void> {
    switch (change.operation) {
      case 'create':
      case 'update':
        if (change.data !== null) {
          await this.handleCreateOrUpdateChange(change);
        }
        break;

      case 'delete':
        await this.store.delete(change.id);
        break;
    }
  }

  private async handleCreateOrUpdateChange(change: ChangeRecord<T>): Promise<void> {
    if (change.data === null) return;

    const document: Document<T> = {
      id: change.id,
      data: change.data,
      version: change.version,
      deleted: false,
    };

    // Check for local conflicts
    const existing = await this.store.get(change.id);
    if (existing && existing.version.timestamp > change.version.timestamp) {
      // Local version is newer, create conflict
      const conflict: ConflictInfo<T> = {
        documentId: change.id,
        localVersion: existing.version,
        remoteVersion: change.version,
        localData: existing.data,
        remoteData: change.data,
      };

      await this.resolveConflicts([conflict]);
    } else {
      await this.store.put(document);
    }
  }

  private async resolveConflicts(conflicts: ConflictInfo<T>[]): Promise<void> {
    for (const conflict of conflicts) {
      try {
        this.emit(SYNC_EVENT.CONFLICT_DETECTED, { conflict });

        const resolution = await this.conflictResolver.resolve(conflict);

        const resolvedDocument: Document<T> = {
          id: conflict.documentId,
          data: resolution.resolvedData,
          version: resolution.resolvedVersion,
          deleted: false,
        };

        await this.store.put(resolvedDocument);
        this.changeTracker.recordUpdate(resolvedDocument);

        this.emit(SYNC_EVENT.CONFLICT_RESOLVED, { resolution });
      } catch (error) {
        this.emit(SYNC_EVENT.SYNC_FAILED, {
          type: SYNC_OPERATION.PUSH,
          error: `Failed to resolve conflict for ${conflict.documentId}: ${(error as Error).message}`,
        });
      }
    }
  }

  private async handleRemoteChanges(changes: ChangeRecord<T>[]): Promise<void> {
    if (!this.isStarted) return;

    try {
      await this.applyRemoteChanges(changes);
      this.emitStateChange();
    } catch (error) {
      // Failed to handle remote changes, emit error event
      this.emit(SYNC_EVENT.SYNC_FAILED, {
        type: SYNC_OPERATION.PULL,
        error: `Failed to handle remote changes: ${(error as Error).message}`,
      });
    }
  }

  private emitStateChange(): void {
    this.emit(SYNC_EVENT.STATE_CHANGED, { state: this.getSyncState() });
  }
}
