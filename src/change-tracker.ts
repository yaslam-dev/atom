/**
 * Change tracking system for the sync engine
 */

import type { Document, ChangeRecord, ChangeOperation, DocumentId, Timestamp } from './types';
import { now, createVersion } from './utils';

/**
 * Tracks changes to documents for sync purposes
 */
export class ChangeTracker<T = unknown> {
  private changes = new Map<DocumentId, ChangeRecord<T>>();
  private changeQueue: ChangeRecord<T>[] = [];

  /**
   * Record a document creation
   */
  recordCreate(document: Document<T>): ChangeRecord<T> {
    const change: ChangeRecord<T> = {
      id: document.id,
      operation: 'create',
      data: document.data,
      version: document.version,
      localTimestamp: now(),
    };

    this.addChange(change);
    return change;
  }

  /**
   * Record a document update
   */
  recordUpdate(document: Document<T>): ChangeRecord<T> {
    const change: ChangeRecord<T> = {
      id: document.id,
      operation: 'update',
      data: document.data,
      version: document.version,
      localTimestamp: now(),
    };

    this.addChange(change);
    return change;
  }

  /**
   * Record a document deletion
   */
  recordDelete(id: DocumentId, version = createVersion(id)): ChangeRecord<T> {
    const change: ChangeRecord<T> = {
      id,
      operation: 'delete',
      data: null,
      version,
      localTimestamp: now(),
    };

    this.addChange(change);
    return change;
  }

  /**
   * Add a change to the tracking system
   */
  private addChange(change: ChangeRecord<T>): void {
    // Store the latest change for each document
    this.changes.set(change.id, change);

    // Add to queue for batch processing
    this.changeQueue.push(change);
  }

  /**
   * Get all pending changes
   */
  getPendingChanges(): ChangeRecord<T>[] {
    return Array.from(this.changeQueue);
  }

  /**
   * Get changes since a specific timestamp
   */
  getChangesSince(timestamp: Timestamp): ChangeRecord<T>[] {
    return this.changeQueue.filter(change => change.localTimestamp > timestamp);
  }

  /**
   * Get the latest change for a specific document
   */
  getLatestChange(id: DocumentId): ChangeRecord<T> | undefined {
    return this.changes.get(id);
  }

  /**
   * Clear changes before a specific timestamp (after successful sync)
   */
  clearChangesBefore(timestamp: Timestamp): void {
    // Remove from queue
    this.changeQueue = this.changeQueue.filter(change => change.localTimestamp >= timestamp);

    // Remove from changes map if the change is older than timestamp
    for (const [id, change] of this.changes.entries()) {
      if (change.localTimestamp < timestamp) {
        this.changes.delete(id);
      }
    }
  }

  /**
   * Clear all changes
   */
  clearAllChanges(): void {
    this.changes.clear();
    this.changeQueue = [];
  }

  /**
   * Get count of pending changes
   */
  getPendingChangeCount(): number {
    return this.changeQueue.length;
  }

  /**
   * Check if there are pending changes
   */
  hasPendingChanges(): boolean {
    return this.changeQueue.length > 0;
  }

  /**
   * Get changes by operation type
   */
  getChangesByOperation(operation: ChangeOperation): ChangeRecord<T>[] {
    return this.changeQueue.filter(change => change.operation === operation);
  }

  /**
   * Merge changes from another tracker (useful for resolving conflicts)
   */
  mergeChanges(otherChanges: ChangeRecord<T>[]): void {
    for (const change of otherChanges) {
      const existingChange = this.changes.get(change.id);

      // Only add if this change is newer or doesn't exist
      if (!existingChange || change.version.timestamp > existingChange.version.timestamp) {
        this.addChange(change);
      }
    }
  }

  /**
   * Export current state for persistence
   */
  exportState(): {
    changes: Record<DocumentId, ChangeRecord<T>>;
    queue: ChangeRecord<T>[];
  } {
    return {
      changes: Object.fromEntries(this.changes),
      queue: [...this.changeQueue],
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    changes: Record<DocumentId, ChangeRecord<T>>;
    queue: ChangeRecord<T>[];
  }): void {
    this.changes = new Map(Object.entries(state.changes));
    this.changeQueue = [...state.queue];
  }
}
