import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeTracker } from '../src/change-tracker';
import { createDocument } from '../src/utils';

describe('ChangeTracker', () => {
  let tracker: ChangeTracker<any>;

  beforeEach(() => {
    tracker = new ChangeTracker();
  });

  it('should record document creation', () => {
    const doc = createDocument({ name: 'test' }, 'doc-1');
    const change = tracker.recordCreate(doc);

    expect(change.operation).toBe('create');
    expect(change.id).toBe('doc-1');
    expect(change.data).toEqual({ name: 'test' });
    expect(change.version).toEqual(doc.version);
    expect(typeof change.localTimestamp).toBe('number');
  });

  it('should record document updates', () => {
    const doc = createDocument({ name: 'test' }, 'doc-1');
    const change = tracker.recordUpdate(doc);

    expect(change.operation).toBe('update');
    expect(change.id).toBe('doc-1');
    expect(change.data).toEqual({ name: 'test' });
  });

  it('should record document deletions', () => {
    const change = tracker.recordDelete('doc-1');

    expect(change.operation).toBe('delete');
    expect(change.id).toBe('doc-1');
    expect(change.data).toBe(null);
  });

  it('should track pending changes', () => {
    expect(tracker.hasPendingChanges()).toBe(false);
    expect(tracker.getPendingChangeCount()).toBe(0);

    const doc = createDocument({ name: 'test' });
    tracker.recordCreate(doc);

    expect(tracker.hasPendingChanges()).toBe(true);
    expect(tracker.getPendingChangeCount()).toBe(1);

    const changes = tracker.getPendingChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.operation).toBe('create');
  });

  it('should get changes since timestamp', async () => {
    const now = Date.now();
    
    const doc1 = createDocument({ name: 'test1' });
    tracker.recordCreate(doc1);
    
    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const doc2 = createDocument({ name: 'test2' });
    tracker.recordUpdate(doc2);

    const changes = tracker.getChangesSince(now);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.every(c => c.localTimestamp > now)).toBe(true);
  });

  it('should clear changes before timestamp', () => {
    const doc = createDocument({ name: 'test' });
    tracker.recordCreate(doc);

    const timestamp = Date.now() + 1000; // Future timestamp
    tracker.clearChangesBefore(timestamp);

    expect(tracker.getPendingChangeCount()).toBe(0);
    expect(tracker.hasPendingChanges()).toBe(false);
  });

  it('should get latest change for document', () => {
    const doc = createDocument({ name: 'original' }, 'doc-1');
    tracker.recordCreate(doc);

    const updatedDoc = { ...doc, data: { name: 'updated' } };
    tracker.recordUpdate(updatedDoc);

    const latestChange = tracker.getLatestChange('doc-1');
    expect(latestChange?.operation).toBe('update');
    expect(latestChange?.data).toEqual({ name: 'updated' });
  });

  it('should get changes by operation type', () => {
    const doc1 = createDocument({ name: 'test1' });
    const doc2 = createDocument({ name: 'test2' });
    
    tracker.recordCreate(doc1);
    tracker.recordUpdate(doc2);
    tracker.recordDelete('doc-3');

    expect(tracker.getChangesByOperation('create')).toHaveLength(1);
    expect(tracker.getChangesByOperation('update')).toHaveLength(1);
    expect(tracker.getChangesByOperation('delete')).toHaveLength(1);
  });

  it('should merge changes from another tracker', () => {
    const doc1 = createDocument({ name: 'test1' }, 'doc-1');
    tracker.recordCreate(doc1);

    const externalChanges = [
      {
        id: 'doc-2',
        operation: 'create' as const,
        data: { name: 'external' },
        version: { id: 'doc-2', timestamp: Date.now() },
        localTimestamp: Date.now()
      }
    ];

    tracker.mergeChanges(externalChanges);

    expect(tracker.getPendingChangeCount()).toBe(2);
    expect(tracker.getLatestChange('doc-2')).toBeDefined();
  });

  it('should export and import state', () => {
    const doc = createDocument({ name: 'test' });
    tracker.recordCreate(doc);
    tracker.recordUpdate(doc);

    const state = tracker.exportState();
    expect(state.queue).toHaveLength(2);
    expect(Object.keys(state.changes)).toHaveLength(1);

    const newTracker = new ChangeTracker();
    newTracker.importState(state);

    expect(newTracker.getPendingChangeCount()).toBe(2);
    expect(newTracker.getLatestChange(doc.id)).toBeDefined();
  });

  it('should clear all changes', () => {
    const doc = createDocument({ name: 'test' });
    tracker.recordCreate(doc);
    tracker.recordUpdate(doc);

    expect(tracker.getPendingChangeCount()).toBe(2);

    tracker.clearAllChanges();

    expect(tracker.getPendingChangeCount()).toBe(0);
    expect(tracker.hasPendingChanges()).toBe(false);
    expect(tracker.getLatestChange(doc.id)).toBeUndefined();
  });
});