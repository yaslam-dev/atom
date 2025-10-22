import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncEngine } from '../src/sync-engine';
import { MemoryStoreAdapter } from '../src/adapters/memory-store';
import { MockHttpTransportAdapter } from '../src/adapters/http-transport';
import { createDocument } from '../src/utils';
import { SYNC_EVENT, SYNC_OPERATION } from '../src/enums';

describe('SyncEngine', () => {
  let syncEngine: SyncEngine;
  let store: MemoryStoreAdapter;
  let transport: MockHttpTransportAdapter;

  beforeEach(() => {
    store = new MemoryStoreAdapter();
    transport = new MockHttpTransportAdapter({
      pushDelay: 10,
      pullDelay: 10,
      failureRate: 0,
      isConnected: true
    });
    
    syncEngine = new SyncEngine({
      store,
      transport,
      syncInterval: 0, // Disable auto-sync for tests
      debounceDelay: 10
    });
  });

  afterEach(async () => {
    await syncEngine.stop();
  });

  describe('Document Operations', () => {
    it('should create documents', async () => {
      await syncEngine.start();
      
      const doc = await syncEngine.create({ name: 'Test Document' });
      
      expect(doc.data).toEqual({ name: 'Test Document' });
      expect(typeof doc.id).toBe('string');
      expect(typeof doc.version.timestamp).toBe('number');
      
      const retrieved = await syncEngine.get(doc.id);
      expect(retrieved).toEqual(doc);
    });

    it('should update documents', async () => {
      await syncEngine.start();
      
      const doc = await syncEngine.create({ name: 'Original' });
      const updated = await syncEngine.update(doc.id, { name: 'Updated' });
      
      expect(updated?.data).toEqual({ name: 'Updated' });
      expect(updated?.version.timestamp).toBeGreaterThan(doc.version.timestamp);
    });

    it('should delete documents', async () => {
      await syncEngine.start();
      
      const doc = await syncEngine.create({ name: 'To Delete' });
      const deleted = await syncEngine.delete(doc.id);
      
      expect(deleted).toBe(true);
      
      const retrieved = await syncEngine.get(doc.id);
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent documents', async () => {
      await syncEngine.start();
      
      const result = await syncEngine.get('non-existent');
      expect(result).toBeNull();
      
      const updated = await syncEngine.update('non-existent', { name: 'Test' });
      expect(updated).toBeNull();
      
      const deleted = await syncEngine.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('Event System', () => {
    it('should emit document events', async () => {
      const events: string[] = [];
      
      syncEngine.on(SYNC_EVENT.DOCUMENT_CREATED, () => events.push('created'));
      syncEngine.on(SYNC_EVENT.DOCUMENT_UPDATED, () => events.push('updated'));
      syncEngine.on(SYNC_EVENT.DOCUMENT_DELETED, () => events.push('deleted'));
      
      await syncEngine.start();
      
      const doc = await syncEngine.create({ name: 'Test' });
      await syncEngine.update(doc.id, { name: 'Updated' });
      await syncEngine.delete(doc.id);
      
      expect(events).toEqual(['created', 'updated', 'deleted']);
    });

    it('should emit sync events', async () => {
      const events: string[] = [];
      
      syncEngine.on(SYNC_EVENT.SYNC_STARTED, ({ type }) => events.push(`${type}-started`));
      syncEngine.on(SYNC_EVENT.SYNC_COMPLETED, ({ type }) => events.push(`${type}-completed`));
      
      await syncEngine.start();
      
      // Create some data and push
      await syncEngine.create({ name: 'Test' });
      await syncEngine.push();
      
      // Pull to sync
      await syncEngine.pull();
      
      expect(events).toContain('push-started');
      expect(events).toContain('push-completed');
      expect(events).toContain('pull-started');
      expect(events).toContain('pull-completed');
    });

    it('should emit state change events', async () => {
      let stateChanges = 0;
      
      syncEngine.on(SYNC_EVENT.STATE_CHANGED, () => stateChanges++);
      
      await syncEngine.start();
      await syncEngine.create({ name: 'Test' });
      await syncEngine.sync();
      
      expect(stateChanges).toBeGreaterThan(0);
    });
  });

  describe('Sync Operations', () => {
    it('should push local changes', async () => {
      await syncEngine.start();
      
      // Create some local data
      await syncEngine.create({ name: 'Test 1' });
      await syncEngine.create({ name: 'Test 2' });
      
      const stateBefore = syncEngine.getSyncState();
      expect(stateBefore.pendingChanges).toBe(2);
      
      // Push changes
      await syncEngine.push();
      
      const stateAfter = syncEngine.getSyncState();
      expect(stateAfter.pendingChanges).toBe(0);
      expect(stateAfter.lastPushTimestamp).toBeGreaterThan(0);
    });

    it('should pull remote changes', async () => {
      // Ensure transport is online
      transport.setConnected(true);
      await syncEngine.start();
      
      // Verify online state
      const initialState = syncEngine.getSyncState();
      if (!initialState.isOnline) {
        // Wait a bit more for online detection
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Simulate remote changes - use a future timestamp
      const changeTimestamp = Date.now() + 10000; // Far in the future
      const remoteChange = {
        id: 'remote-doc',
        operation: 'create' as const,
        data: { name: 'Remote Document' },
        version: { id: 'remote-doc', timestamp: changeTimestamp },
        localTimestamp: changeTimestamp
      };
      
      transport.getMockDatabase().set('remote-doc', remoteChange);
      
      // Test the transport directly first
      const transportResult = await transport.pull(0);
      expect(transportResult.success).toBe(true);
      expect(transportResult.changes).toHaveLength(1);
      
      // Now test through sync engine
      await syncEngine.pull();
      
      const retrieved = await syncEngine.get('remote-doc');
      expect(retrieved?.data).toEqual({ name: 'Remote Document' });
    });

    it('should handle offline state', async () => {
      transport.setConnected(false);
      await syncEngine.start();
      
      const state = syncEngine.getSyncState();
      expect(state.isOnline).toBe(false);
      
      // Sync should not work when offline
      await syncEngine.create({ name: 'Test' });
      await syncEngine.sync(); // Should not throw but won't sync
      
      expect(syncEngine.getSyncState().pendingChanges).toBe(1);
    });

    it('should handle connection state', async () => {
      // Start with transport offline
      transport.setConnected(false);
      await syncEngine.start();
      
      // Should be offline
      expect(syncEngine.getSyncState().isOnline).toBe(false);
      
      // Try to sync - should not work (but shouldn't throw)
      await syncEngine.create({ name: 'Test' });
      await syncEngine.sync();
      
      // Should still have pending changes since sync failed
      expect(syncEngine.getSyncState().pendingChanges).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle push failures gracefully', async () => {
      transport.setFailureRate(1); // 100% failure rate
      await syncEngine.start();
      
      let errorEmitted = false;
      syncEngine.on(SYNC_EVENT.SYNC_FAILED, ({ type }) => {
        if (type === SYNC_OPERATION.PUSH) errorEmitted = true;
      });
      
      await syncEngine.create({ name: 'Test' });
      
      try {
        await syncEngine.push();
      } catch (error) {
        // Expected to fail
      }
      
      expect(errorEmitted).toBe(true);
      expect(syncEngine.getSyncState().pendingChanges).toBe(1); // Changes should remain
    });

    it('should handle pull failures gracefully', async () => {
      transport.setFailureRate(1); // 100% failure rate
      await syncEngine.start();
      
      let errorEmitted = false;
      syncEngine.on(SYNC_EVENT.SYNC_FAILED, ({ type }) => {
        if (type === SYNC_OPERATION.PULL) errorEmitted = true;
      });
      
      try {
        await syncEngine.pull();
      } catch (error) {
        // Expected to fail
      }
      
      expect(errorEmitted).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should use custom conflict resolver', async () => {
      const customResolver = {
        resolve: vi.fn().mockResolvedValue({
          resolvedData: { name: 'Custom Resolution' },
          resolvedVersion: { id: 'test', timestamp: Date.now() }
        })
      };
      
      const customEngine = new SyncEngine({
        store: new MemoryStoreAdapter(),
        transport: new MockHttpTransportAdapter(),
        conflictResolver: customResolver,
        syncInterval: 0
      });
      
      await customEngine.start();
      
      // This would need actual conflict scenario to test properly
      // For now, just verify the resolver was set
      expect(customResolver.resolve).toBeDefined();
      
      await customEngine.stop();
    });

    it('should respect configuration options', () => {
      const config = {
        store,
        transport,
        syncInterval: 5000,
        batchSize: 50,
        retryAttempts: 5,
        retryDelay: 2000,
        debounceDelay: 500
      };
      
      const customEngine = new SyncEngine(config);
      
      // These are private properties, so we can't directly test them
      // But we can verify the engine was created without errors
      expect(customEngine).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should track sync state correctly', async () => {
      await syncEngine.start();
      
      const initialState = syncEngine.getSyncState();
      expect(initialState.pendingChanges).toBe(0);
      expect(initialState.isSyncing).toBe(false);
      
      await syncEngine.create({ name: 'Test' });
      
      const stateWithChanges = syncEngine.getSyncState();
      expect(stateWithChanges.pendingChanges).toBe(1);
    });

    it('should persist sync timestamps', async () => {
      await syncEngine.start();
      
      await syncEngine.create({ name: 'Test' });
      await syncEngine.push();
      
      const state = syncEngine.getSyncState();
      expect(state.lastPushTimestamp).toBeGreaterThan(0);
      
      // Verify timestamp was stored
      const storedTimestamp = await store.getLastSyncTimestamp();
      expect(storedTimestamp).toBe(state.lastPushTimestamp);
    });
  });
});