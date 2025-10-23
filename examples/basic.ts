/**
 * Basic example showing how to use the sync engine
 */

import {
  SyncEngine,
  MemoryStoreAdapter,
  MockHttpTransportAdapter,
  LastWriteWinsResolver,
  SYNC_EVENT,
} from '../src/index';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function basicExample() {
  console.log('🚀 Starting Basic Sync Engine Example\n');

  // Create adapters
  const store = new MemoryStoreAdapter();
  const transport = new MockHttpTransportAdapter({
    pushDelay: 100,
    pullDelay: 100,
    isConnected: true
  });

  // Create sync engine
  const syncEngine = new SyncEngine({
    store,
    transport,
    syncInterval: 5000, // Sync every 5 seconds
    conflictResolver: new LastWriteWinsResolver()
  });

  // Set up event listeners
  syncEngine.on(SYNC_EVENT.DOCUMENT_CREATED, ({ document }) => {
    console.log('📄 Document created:', document.id, document.data);
  });

  syncEngine.on(SYNC_EVENT.DOCUMENT_UPDATED, ({ document }) => {
    console.log('✏️  Document updated:', document.id, document.data);
  });

  syncEngine.on(SYNC_EVENT.DOCUMENT_DELETED, ({ id }) => {
    console.log('🗑️  Document deleted:', id);
  });

  syncEngine.on(SYNC_EVENT.SYNC_STARTED, ({ type }) => {
    console.log(`🔄 ${type} sync started`);
  });

  syncEngine.on(SYNC_EVENT.SYNC_COMPLETED, ({ type, changeCount }) => {
    console.log(`✅ ${type} sync completed with ${changeCount} changes`);
  });

  syncEngine.on(SYNC_EVENT.SYNC_FAILED, ({ type, error }) => {
    console.log(`❌ ${type} sync failed:`, error);
  });

  syncEngine.on(SYNC_EVENT.CONNECTION_ONLINE, () => {
    console.log('🌐 Connection: ONLINE');
  });

  syncEngine.on(SYNC_EVENT.CONNECTION_OFFLINE, () => {
    console.log('📴 Connection: OFFLINE');
  });

  // Start the sync engine
  console.log('Starting sync engine...');
  await syncEngine.start();

  // Create some documents
  console.log('\n📝 Creating documents...');
  const doc1 = await syncEngine.create({
    title: 'My First Document',
    content: 'Hello, World!'
  });

  const doc2 = await syncEngine.create({
    title: 'Shopping List',
    items: ['Milk', 'Bread', 'Eggs']
  });

  // Update a document
  console.log('\n✏️  Updating document...');
  await syncEngine.update(doc1.id, {
    title: 'My Updated Document',
    content: 'Hello, Sync Engine!',
    lastModified: new Date().toISOString()
  });

  // Show sync state
  console.log('\n📊 Current sync state:');
  console.log(syncEngine.getSyncState());

  // Manually trigger sync
  console.log('\n🔄 Manually triggering sync...');
  await syncEngine.sync();

  // Wait a bit and show final state
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📊 Final sync state:');
  console.log(syncEngine.getSyncState());

  // Delete a document
  console.log('\n🗑️  Deleting document...');
  await syncEngine.delete(doc2.id);

  // Stop the sync engine
  console.log('\n🛑 Stopping sync engine...');
  await syncEngine.stop();

  console.log('\n✨ Example completed!');
}

// Run the example
basicExample().catch(console.error);