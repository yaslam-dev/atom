/**
 * Sync Engine - A minimal, framework-agnostic sync engine
 *
 * @example
 * ```typescript
 * import { SyncEngine, MemoryStoreAdapter, HttpTransportAdapter } from 'sync-engine';
 *
 * const store = new MemoryStoreAdapter();
 * const transport = new HttpTransportAdapter('https://api.example.com');
 * const syncEngine = new SyncEngine({ store, transport });
 *
 * // Listen for sync events
 * syncEngine.on('sync:completed', ({ type, changeCount }) => {
 *   console.log(`${type} sync completed with ${changeCount} changes`);
 * });
 *
 * // Start syncing
 * await syncEngine.start();
 * ```
 */

// Core types and interfaces
export type * from './types';
export type * from './interfaces';

// Utilities
export * from './utils';

// Enums
export * from './enums';

// Event system
export * from './event-emitter';

// Change tracking
export * from './change-tracker';

// Conflict resolution
export * from './conflict-resolvers';

// Main sync engine
export * from './sync-engine';

// Example adapters
export * from './adapters';
