/**
 * Utility functions for the sync engine
 */

import type { Document, DocumentVersion, Timestamp } from './types';

/**
 * Generate a new timestamp
 */
export function now(): Timestamp {
  return Date.now();
}

/**
 * Generate a unique document ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a new document version
 */
export function createVersion(id: string, timestamp?: Timestamp): DocumentVersion {
  return {
    id,
    timestamp: timestamp ?? now()
  };
}

/**
 * Create a new document with metadata
 */
export function createDocument<T>(
  data: T, 
  id?: string, 
  version?: DocumentVersion
): Document<T> {
  const docId = id ?? generateId();
  return {
    id: docId,
    data,
    version: version ?? createVersion(docId)
  };
}

/**
 * Clone a document with a new version
 */
export function cloneDocument<T>(
  document: Document<T>, 
  newData?: T, 
  newTimestamp?: Timestamp
): Document<T> {
  const timestamp = newTimestamp ?? now();
  // Ensure the new timestamp is always greater than the original
  const finalTimestamp = timestamp <= document.version.timestamp 
    ? document.version.timestamp + 1 
    : timestamp;
    
  return {
    ...document,
    data: newData ?? document.data,
    version: {
      ...document.version,
      timestamp: finalTimestamp
    }
  };
}

/**
 * Check if a document is deleted (soft delete)
 */
export function isDeleted<T>(document: Document<T>): boolean {
  return document.deleted === true;
}

/**
 * Mark a document as deleted
 */
export function markDeleted<T>(document: Document<T>): Document<T> {
  const timestamp = now();
  // Ensure the new timestamp is always greater than the original
  const finalTimestamp = timestamp <= document.version.timestamp 
    ? document.version.timestamp + 1 
    : timestamp;
    
  return {
    ...document,
    deleted: true,
    version: {
      ...document.version,
      timestamp: finalTimestamp
    }
  };
}

/**
 * Compare two versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: DocumentVersion, b: DocumentVersion): number {
  if (a.timestamp < b.timestamp) return -1;
  if (a.timestamp > b.timestamp) return 1;
  
  // If timestamps are equal, use ID as tiebreaker for deterministic ordering
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  
  return 0;
}

/**
 * Simple checksum function for data integrity
 */
export function simpleChecksum(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Debounce function for batching operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}