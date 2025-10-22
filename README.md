# Sync Engine

A minimal, framework-agnostic sync engine for offline-first applications with conflict resolution.

## Features

- **Framework Agnostic**: Works with any JavaScript/TypeScript project
- **Storage Agnostic**: Pluggable storage adapters (memory, localStorage, IndexedDB, SQLite, etc.)
- **Transport Agnostic**: Pluggable transport adapters (HTTP, WebSocket, custom)
- **Offline-First**: Queues changes when offline, syncs when online
- **Conflict Resolution**: Last-Write-Wins (LWW) with pluggable conflict resolvers
- **Event-Driven**: Comprehensive event system for monitoring sync operations
- **TypeScript**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install sync-engine
# or
pnpm add sync-engine
# or
yarn add sync-engine
```

## Quick Start

```typescript
import { 
  SyncEngine, 
  MemoryStoreAdapter, 
  HttpTransportAdapter 
} from 'sync-engine';

// Create adapters
const store = new MemoryStoreAdapter();
const transport = new HttpTransportAdapter({
  baseUrl: 'https://api.example.com',
  apiKey: 'your-api-key',
  endpoints: {
    push: '/api/sync/push',    // Custom endpoint
    pull: '/api/sync/pull',    // Custom endpoint
    health: '/api/health'      // Custom endpoint
  }
});

// Create sync engine
const syncEngine = new SyncEngine({
  store,
  transport,
  syncInterval: 30000, // Sync every 30 seconds
  conflictResolver: new LastWriteWinsResolver() // Default
});

// Listen for events
syncEngine.on('sync:completed', ({ type, changeCount }) => {
  console.log(`${type} sync completed with ${changeCount} changes`);
});

syncEngine.on('conflict:resolved', ({ resolution }) => {
  console.log('Conflict resolved:', resolution);
});

// Start the engine
await syncEngine.start();

// Create documents
const doc = await syncEngine.create({ 
  name: 'My Document', 
  content: 'Hello, World!' 
});

// Update documents
await syncEngine.update(doc.id, { 
  name: 'Updated Document',
  content: 'Hello, Sync Engine!'
});

// The changes will be automatically synced in the background
```

## Core Concepts

### Storage Adapters

Implement the `StoreAdapter` interface to support any storage backend:

```typescript
class CustomStoreAdapter implements StoreAdapter {
  async get(id: string) { /* ... */ }
  async put(document: Document) { /* ... */ }
  async delete(id: string) { /* ... */ }
  // ... other required methods
}
```

Built-in adapters:
- `MemoryStoreAdapter` - In-memory storage (great for testing)

### Transport Adapters

Implement the `TransportAdapter` interface for different sync protocols:

```typescript
class CustomTransportAdapter implements TransportAdapter {
  async push(changes: ChangeBatch) { /* ... */ }
  async pull(sinceTimestamp: number) { /* ... */ }
  async isOnline() { /* ... */ }
}
```

Built-in adapters:
- `HttpTransportAdapter` - RESTful HTTP sync with customizable endpoints
- `MockHttpTransportAdapter` - Mock adapter for testing

#### HTTP Transport Configuration

```typescript
const transport = new HttpTransportAdapter({
  baseUrl: 'https://api.example.com',
  apiKey: 'your-api-key',
  timeout: 30000,
  headers: { 'Custom-Header': 'value' },
  endpoints: {
    push: '/custom/push',     // Default: '/sync/push'
    pull: '/custom/pull',     // Default: '/sync/pull'
    health: '/custom/health'  // Default: '/health'
  }
});
```

### Conflict Resolution

The sync engine uses Last-Write-Wins (LWW) conflict resolution by default, but you can implement custom strategies:

```typescript
class CustomConflictResolver implements ConflictResolver {
  async resolve(conflict: ConflictInfo) {
    // Your custom logic here
    return {
      resolvedData: mergedData,
      resolvedVersion: newVersion
    };
  }
}

const syncEngine = new SyncEngine({
  store,
  transport,
  conflictResolver: new CustomConflictResolver()
});
```

## API Reference

### SyncEngine

Main class that orchestrates sync operations.

#### Constructor Options

```typescript
interface SyncEngineConfig {
  store: StoreAdapter;           // Storage backend
  transport: TransportAdapter;   // Network transport
  conflictResolver?: ConflictResolver; // Conflict resolution strategy
  syncInterval?: number;         // Auto-sync interval (ms, 0 to disable)
  batchSize?: number;           // Max changes per sync batch
  retryAttempts?: number;       // Max retry attempts
  retryDelay?: number;          // Base delay for retry backoff
  debounceDelay?: number;       // Debounce delay for batching
}
```

#### Methods

- `start()` - Start the sync engine
- `stop()` - Stop the sync engine
- `create(data, id?)` - Create a new document
- `get(id)` - Retrieve a document
- `update(id, data)` - Update a document
- `delete(id)` - Delete a document
- `sync()` - Manually trigger sync
- `push()` - Push local changes
- `pull()` - Pull remote changes
- `getSyncState()` - Get current sync state

#### Events

```typescript
syncEngine.on('document:created', ({ document }) => {});
syncEngine.on('document:updated', ({ document, previousVersion }) => {});
syncEngine.on('document:deleted', ({ id, version }) => {});

syncEngine.on('sync:started', ({ type }) => {}); // type: 'push' | 'pull'
syncEngine.on('sync:completed', ({ type, changeCount }) => {});
syncEngine.on('sync:failed', ({ type, error }) => {});

syncEngine.on('conflict:detected', ({ conflict }) => {});
syncEngine.on('conflict:resolved', ({ resolution }) => {});

syncEngine.on('connection:online', () => {});
syncEngine.on('connection:offline', () => {});

syncEngine.on('state:changed', ({ state }) => {});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sync Engine Core                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │   Data Layer    │  │  Conflict Resolver │  │  Network Layer  │ │
│  │                 │  │                  │  │                 │ │
│  │ - Store Adapter │  │ - Strategy API   │  │ - Transport API │ │
│  │ - Change Log    │  │ - LWW Resolution │  │ - Push/Pull API │ │
│  │ - Versioning    │  │ - Custom Merge   │  │ - Retry Logic   │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
│           │                       │                       │      │
│           └───────────────────────┼───────────────────────┘      │
│                                   │                              │
│  ┌─────────────────────────────────┼─────────────────────────────┐ │
│  │                    Event System                              │ │
│  │  - Change Events  - Sync Events  - Conflict Events          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build the library
pnpm build

# Type check
pnpm type-check
```

## Limitations & Considerations

### Current Implementation Limitations

1. **Conflict Resolution**: Currently only supports Last-Write-Wins (LWW). More sophisticated strategies like Operational Transforms or CRDTs are not implemented.

2. **Network Transport**: Only HTTP transport adapter is provided. WebSocket or other real-time transports need custom implementation.

3. **Schema Evolution**: No built-in support for schema migrations or backward compatibility when document structure changes.

4. **Large Data Sets**: No built-in pagination or partial sync support for very large datasets.

5. **Transaction Support**: No atomic operations across multiple documents.

6. **Authentication**: Basic API key support only. OAuth, JWT, or other advanced auth methods require custom headers.

7. **Compression**: No built-in data compression for network transfers.

### Server Requirements

Your sync server must implement these endpoints:

#### Push Endpoint (POST /sync/push)
```typescript
// Request body
{
  changes: ChangeRecord[],
  lastSyncTimestamp?: number
}

// Response
{
  success: boolean,
  conflicts?: ConflictInfo[],
  timestamp?: number,
  error?: string
}
```

#### Pull Endpoint (GET /sync/pull?since={timestamp})
```typescript
// Response
{
  success: boolean,
  changes: ChangeRecord[],
  timestamp: number,
  error?: string
}
```

#### Health Endpoint (GET /health)
```typescript
// Response: Any 200 OK response indicates server is online
```

### Best Practices

1. **Storage Adapter**: Implement persistence for production use (IndexedDB, SQLite, etc.)
2. **Error Handling**: Implement retry logic and graceful degradation
3. **Data Validation**: Validate data before storing/syncing
4. **Performance**: Consider implementing data compression and pagination for large datasets
5. **Security**: Use HTTPS and proper authentication
6. **Monitoring**: Use the comprehensive event system for logging and monitoring

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.