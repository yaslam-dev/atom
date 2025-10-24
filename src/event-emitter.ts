/**
 * Simple event emitter implementation for the sync engine
 */

import type { EventEmitter, SyncEvents } from './interfaces';

export class SyncEventEmitter<T = unknown> implements EventEmitter<T> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  private readonly listeners = new Map<keyof SyncEvents<T>, Set<Function>>();

  on<K extends keyof SyncEvents<T>>(
    event: K,
    listener: (data: SyncEvents<T>[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.off(event, listener);
    };
  }

  emit<K extends keyof SyncEvents<T>>(event: K, data: SyncEvents<T>[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Error in event listener for ${String(event)}:`, error);
        }
      });
    }
  }

  off<K extends keyof SyncEvents<T>>(event: K, listener: (data: SyncEvents<T>[K]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  removeAllListeners<K extends keyof SyncEvents<T>>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  // Utility method to get listener count for testing
  listenerCount<K extends keyof SyncEvents<T>>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
