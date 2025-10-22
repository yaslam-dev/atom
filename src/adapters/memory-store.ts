/**
 * In-memory store adapter for testing and simple use cases
 */

import type { StoreAdapter } from '../interfaces';
import type { DocumentId, Document, ChangeRecord, Timestamp } from '../types';

/**
 * Simple in-memory implementation of StoreAdapter
 * Useful for testing, demos, and temporary storage
 */
export class MemoryStoreAdapter<T = any> implements StoreAdapter<T> {
  private documents = new Map<DocumentId, Document<T>>();
  private changes = new Map<DocumentId, ChangeRecord<T>>();
  private changeQueue: ChangeRecord<T>[] = [];
  private lastSyncTimestamp: Timestamp = 0;

  // Document operations
  async get(id: DocumentId): Promise<Document<T> | null> {
    return this.documents.get(id) ?? null;
  }

  async put(document: Document<T>): Promise<void> {
    this.documents.set(document.id, { ...document });
  }

  async delete(id: DocumentId): Promise<void> {
    this.documents.delete(id);
  }

  // Batch operations
  async getBatch(ids: DocumentId[]): Promise<Document<T>[]> {
    const results: Document<T>[] = [];
    for (const id of ids) {
      const doc = this.documents.get(id);
      if (doc) {
        results.push(doc);
      }
    }
    return results;
  }

  async putBatch(documents: Document<T>[]): Promise<void> {
    for (const document of documents) {
      await this.put(document);
    }
  }

  // Query operations
  async getAll(): Promise<Document<T>[]> {
    return Array.from(this.documents.values()).map(doc => ({ ...doc }));
  }

  async getAllIds(): Promise<DocumentId[]> {
    return Array.from(this.documents.keys());
  }

  // Change tracking
  async getChangesSince(timestamp: Timestamp): Promise<ChangeRecord<T>[]> {
    return this.changeQueue.filter(change => change.localTimestamp > timestamp);
  }

  async putChange(change: ChangeRecord<T>): Promise<void> {
    this.changes.set(change.id, { ...change });
    this.changeQueue.push({ ...change });
  }

  async clearChangesBefore(timestamp: Timestamp): Promise<void> {
    this.changeQueue = this.changeQueue.filter(change => change.localTimestamp >= timestamp);

    // Remove from changes map if the change is older than timestamp
    for (const [id, change] of this.changes.entries()) {
      if (change.localTimestamp < timestamp) {
        this.changes.delete(id);
      }
    }
  }

  // Metadata
  async getLastSyncTimestamp(): Promise<Timestamp> {
    return this.lastSyncTimestamp;
  }

  async setLastSyncTimestamp(timestamp: Timestamp): Promise<void> {
    this.lastSyncTimestamp = timestamp;
  }

  // Utility methods for testing and debugging
  getDocumentCount(): number {
    return this.documents.size;
  }

  getChangeCount(): number {
    return this.changeQueue.length;
  }

  clear(): void {
    this.documents.clear();
    this.changes.clear();
    this.changeQueue = [];
    this.lastSyncTimestamp = 0;
  }

  // Export/import for persistence in other storage systems
  exportData(): {
    documents: Record<DocumentId, Document<T>>;
    changes: Record<DocumentId, ChangeRecord<T>>;
    changeQueue: ChangeRecord<T>[];
    lastSyncTimestamp: Timestamp;
  } {
    return {
      documents: Object.fromEntries(this.documents),
      changes: Object.fromEntries(this.changes),
      changeQueue: [...this.changeQueue],
      lastSyncTimestamp: this.lastSyncTimestamp,
    };
  }

  importData(data: {
    documents: Record<DocumentId, Document<T>>;
    changes: Record<DocumentId, ChangeRecord<T>>;
    changeQueue: ChangeRecord<T>[];
    lastSyncTimestamp: Timestamp;
  }): void {
    this.documents = new Map(Object.entries(data.documents));
    this.changes = new Map(Object.entries(data.changes));
    this.changeQueue = [...data.changeQueue];
    this.lastSyncTimestamp = data.lastSyncTimestamp;
  }
}
