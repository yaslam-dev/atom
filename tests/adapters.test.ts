import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStoreAdapter } from '../src/adapters/memory-store';
import { MockHttpTransportAdapter } from '../src/adapters/http-transport';
import { createDocument } from '../src/utils';

describe('MemoryStoreAdapter', () => {
  let store: MemoryStoreAdapter;

  beforeEach(() => {
    store = new MemoryStoreAdapter();
  });

  it('should store and retrieve documents', async () => {
    const doc = createDocument({ name: 'test' });
    
    await store.put(doc);
    const retrieved = await store.get(doc.id);
    
    expect(retrieved).toEqual(doc);
  });

  it('should handle batch operations', async () => {
    const docs = [
      createDocument({ name: 'doc1' }),
      createDocument({ name: 'doc2' }),
      createDocument({ name: 'doc3' })
    ];
    
    await store.putBatch(docs);
    const retrieved = await store.getBatch(docs.map(d => d.id));
    
    expect(retrieved).toHaveLength(3);
    expect(retrieved.map(d => d.data.name)).toEqual(['doc1', 'doc2', 'doc3']);
  });

  it('should track changes', async () => {
    const change = {
      id: 'test-id',
      operation: 'create' as const,
      data: { name: 'test' },
      version: { id: 'test-id', timestamp: Date.now() },
      localTimestamp: Date.now()
    };
    
    await store.putChange(change);
    
    const changes = await store.getChangesSince(0);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual(change);
  });

  it('should manage sync timestamps', async () => {
    const timestamp = Date.now();
    
    await store.setLastSyncTimestamp(timestamp);
    const retrieved = await store.getLastSyncTimestamp();
    
    expect(retrieved).toBe(timestamp);
  });

  it('should export and import data', async () => {
    const doc = createDocument({ name: 'test' });
    await store.put(doc);
    
    const change = {
      id: 'test-id',
      operation: 'create' as const,
      data: { name: 'test' },
      version: { id: 'test-id', timestamp: Date.now() },
      localTimestamp: Date.now()
    };
    await store.putChange(change);
    
    const exported = store.exportData();
    
    const newStore = new MemoryStoreAdapter();
    newStore.importData(exported);
    
    const retrievedDoc = await newStore.get(doc.id);
    const retrievedChanges = await newStore.getChangesSince(0);
    
    expect(retrievedDoc).toEqual(doc);
    expect(retrievedChanges).toHaveLength(1);
  });
});

describe('MockHttpTransportAdapter', () => {
  let transport: MockHttpTransportAdapter;

  beforeEach(() => {
    transport = new MockHttpTransportAdapter({
      pushDelay: 0,
      pullDelay: 0,
      failureRate: 0,
      isConnected: true
    });
  });

  it('should push changes successfully', async () => {
    const changes = {
      changes: [{
        id: 'test-id',
        operation: 'create' as const,
        data: { name: 'test' },
        version: { id: 'test-id', timestamp: Date.now() },
        localTimestamp: Date.now()
      }]
    };
    
    const result = await transport.push(changes);
    
    expect(result.success).toBe(true);
    expect(typeof result.timestamp).toBe('number');
  });

  it('should pull changes successfully', async () => {
    // First push some changes to mock database
    const change = {
      id: 'test-id',
      operation: 'create' as const,
      data: { name: 'test' },
      version: { id: 'test-id', timestamp: Date.now() },
      localTimestamp: Date.now()
    };
    
    await transport.push({ changes: [change] });
    
    // Now pull them
    const result = await transport.pull(0);
    
    expect(result.success).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.id).toBe('test-id');
  });

  it('should respect online/offline status', async () => {
    expect(await transport.isOnline()).toBe(true);
    
    transport.setConnected(false);
    expect(await transport.isOnline()).toBe(false);
    
    transport.setConnected(true);
    expect(await transport.isOnline()).toBe(true);
  });

  it('should simulate failures', async () => {
    transport.setFailureRate(1); // 100% failure rate
    
    const changes = {
      changes: [{
        id: 'test-id',
        operation: 'create' as const,
        data: { name: 'test' },
        version: { id: 'test-id', timestamp: Date.now() },
        localTimestamp: Date.now()
      }]
    };
    
    const pushResult = await transport.push(changes);
    expect(pushResult.success).toBe(false);
    
    const pullResult = await transport.pull(0);
    expect(pullResult.success).toBe(false);
  });

  it('should handle offline state', async () => {
    transport.setConnected(false);
    
    const changes = {
      changes: [{
        id: 'test-id',
        operation: 'create' as const,
        data: { name: 'test' },
        version: { id: 'test-id', timestamp: Date.now() },
        localTimestamp: Date.now()
      }]
    };
    
    const result = await transport.push(changes);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });
});