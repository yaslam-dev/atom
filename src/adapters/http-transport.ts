/**
 * HTTP transport adapter for RESTful sync APIs
 */

import type { TransportAdapter, PushResult, PullResult } from '../interfaces';
import type { ChangeBatch, ChangeRecord, Timestamp } from '../types';

export interface HttpTransportConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;

  // Endpoint customization
  endpoints?: {
    push?: string; // Default: '/sync/push'
    pull?: string; // Default: '/sync/pull'
    health?: string; // Default: '/health'
  };
}

/**
 * HTTP transport adapter that communicates with a RESTful sync API
 */
export class HttpTransportAdapter<T = any> implements TransportAdapter<T> {
  private readonly config: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    endpoints: {
      push: string;
      pull: string;
      health: string;
    };
    apiKey?: string;
    headers?: Record<string, string>;
  };

  constructor(config: HttpTransportConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      endpoints: {
        push: config.endpoints?.push ?? '/sync/push',
        pull: config.endpoints?.pull ?? '/sync/pull',
        health: config.endpoints?.health ?? '/health',
      },
    };

    if (config.apiKey) {
      this.config.apiKey = config.apiKey;
    }

    if (config.headers) {
      this.config.headers = config.headers;
    }
  }

  async push(changes: ChangeBatch<T>): Promise<PushResult> {
    try {
      const response = await this.makeRequest('POST', this.config.endpoints.push, changes);

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        conflicts: result.conflicts ?? [],
        timestamp: result.timestamp ?? Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async pull(sinceTimestamp: Timestamp): Promise<PullResult<T>> {
    try {
      const url = `${this.config.endpoints.pull}?since=${sinceTimestamp}`;
      const response = await this.makeRequest('GET', url);

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        changes: result.changes ?? [],
        timestamp: result.timestamp ?? Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        changes: [],
        timestamp: Date.now(),
        error: (error as Error).message,
      };
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', this.config.endpoints.health, undefined, 5000);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Optional: implement for real-time sync
  onRemoteChange?(callback: (changes: ChangeRecord<T>[]) => void): () => void {
    // This could be implemented using WebSockets, Server-Sent Events, or polling
    // For now, return a no-op unsubscribe function
    console.warn('Real-time sync not implemented for HttpTransportAdapter');
    return () => {};
  }

  private async makeRequest(
    method: string,
    path: string,
    body?: unknown,
    timeoutOverride?: number
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const timeout = timeoutOverride ?? this.config.timeout;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body) {
        requestInit.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestInit);

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

/**
 * Mock HTTP transport for testing and development
 */
export class MockHttpTransportAdapter<T = any> implements TransportAdapter<T> {
  private readonly mockDatabase = new Map<string, ChangeRecord<T>>();
  private readonly pushDelay: number;
  private readonly pullDelay: number;
  private failureRate: number;
  private isConnected: boolean;

  constructor(
    options: {
      pushDelay?: number;
      pullDelay?: number;
      failureRate?: number; // 0-1, probability of failure
      isConnected?: boolean;
    } = {}
  ) {
    this.pushDelay = options.pushDelay ?? 100;
    this.pullDelay = options.pullDelay ?? 100;
    this.failureRate = options.failureRate ?? 0;
    this.isConnected = options.isConnected ?? true;
  }

  async push(changes: ChangeBatch<T>): Promise<PushResult> {
    await this.simulateDelay(this.pushDelay);

    if (!this.isConnected || Math.random() < this.failureRate) {
      return {
        success: false,
        error: 'Network error or server unavailable',
      };
    }

    // Store changes in mock database
    for (const change of changes.changes) {
      this.mockDatabase.set(change.id, change);
    }

    return {
      success: true,
      timestamp: Date.now(),
    };
  }

  async pull(sinceTimestamp: Timestamp): Promise<PullResult<T>> {
    await this.simulateDelay(this.pullDelay);

    if (!this.isConnected || Math.random() < this.failureRate) {
      return {
        success: false,
        changes: [],
        timestamp: Date.now(),
        error: 'Network error or server unavailable',
      };
    }

    // Return changes newer than sinceTimestamp
    const changes = Array.from(this.mockDatabase.values()).filter(
      change => change.version.timestamp > sinceTimestamp
    );

    return {
      success: true,
      changes,
      timestamp: Date.now(),
    };
  }

  async isOnline(): Promise<boolean> {
    await this.simulateDelay(10);
    return this.isConnected;
  }

  // Test utilities
  setConnected(connected: boolean): void {
    this.isConnected = connected;
  }

  setFailureRate(rate: number): void {
    this.failureRate = Math.max(0, Math.min(1, rate));
  }

  getMockDatabase(): Map<string, ChangeRecord<T>> {
    return this.mockDatabase;
  }

  clearMockDatabase(): void {
    this.mockDatabase.clear();
  }

  private async simulateDelay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
}
