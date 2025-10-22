/**
 * Last-Write-Wins conflict resolution strategy
 */

import type { ConflictResolver } from './interfaces';
import type { 
  ConflictInfo, 
  ConflictResolution,
  DocumentVersion 
} from './types';

/**
 * Simple Last-Write-Wins conflict resolver
 * The document with the latest timestamp wins
 */
export class LastWriteWinsResolver<T = any> implements ConflictResolver<T> {
  async resolve(conflict: ConflictInfo<T>): Promise<ConflictResolution<T>> {
    const { localVersion, remoteVersion, localData, remoteData } = conflict;
    
    // Compare timestamps - later timestamp wins
    const useRemote = remoteVersion.timestamp > localVersion.timestamp;
    
    // If timestamps are equal, we can use a tiebreaker (document ID comparison)
    const useRemoteOnTie = remoteVersion.timestamp === localVersion.timestamp && 
                          remoteVersion.id > localVersion.id;
    
    if (useRemote || useRemoteOnTie) {
      return {
        resolvedData: remoteData,
        resolvedVersion: remoteVersion
      };
    } else {
      return {
        resolvedData: localData,
        resolvedVersion: localVersion
      };
    }
  }
}

/**
 * Custom conflict resolver that allows user-defined resolution logic
 */
export class CustomConflictResolver<T = any> implements ConflictResolver<T> {
  constructor(
    private resolutionFn: (conflict: ConflictInfo<T>) => ConflictResolution<T> | Promise<ConflictResolution<T>>
  ) {}

  async resolve(conflict: ConflictInfo<T>): Promise<ConflictResolution<T>> {
    return await this.resolutionFn(conflict);
  }
}

/**
 * Merge-based conflict resolver that attempts to merge both versions
 * Falls back to LWW if merge fails
 */
export class MergeConflictResolver<T = any> implements ConflictResolver<T> {
  constructor(
    private mergeFn: (local: T, remote: T) => T | null,
    private fallbackResolver: ConflictResolver<T> = new LastWriteWinsResolver<T>()
  ) {}

  async resolve(conflict: ConflictInfo<T>): Promise<ConflictResolution<T>> {
    try {
      const merged = this.mergeFn(conflict.localData, conflict.remoteData);
      
      if (merged !== null && merged !== undefined) {
        // Create new version with latest timestamp
        const resolvedVersion: DocumentVersion = {
          id: conflict.documentId,
          timestamp: Math.max(conflict.localVersion.timestamp, conflict.remoteVersion.timestamp)
          // checksum could be computed here if needed
        };
        
        return {
          resolvedData: merged,
          resolvedVersion
        };
      }
    } catch (error) {
      console.warn('Merge failed, falling back to LWW:', error);
    }
    
    // Fall back to LWW if merge fails
    return this.fallbackResolver.resolve(conflict);
  }
}