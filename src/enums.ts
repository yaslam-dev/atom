/**
 * Enumeration for sync operations
 */
export enum SYNC_OPERATION {
  PUSH = 'push',
  PULL = 'pull',
}

/**
 * Enumeration for sync event types
 */
export enum SYNC_EVENT {
  // Document events
  DOCUMENT_CREATED = 'document:created',
  DOCUMENT_UPDATED = 'document:updated',
  DOCUMENT_DELETED = 'document:deleted',
  
  // Sync events
  SYNC_STARTED = 'sync:started',
  SYNC_COMPLETED = 'sync:completed',
  SYNC_FAILED = 'sync:failed',
  
  // Conflict events
  CONFLICT_DETECTED = 'conflict:detected',
  CONFLICT_RESOLVED = 'conflict:resolved',
  
  // Connection events
  CONNECTION_ONLINE = 'connection:online',
  CONNECTION_OFFLINE = 'connection:offline',
  
  // State events
  STATE_CHANGED = 'state:changed',
}

/**
 * Enumeration for sync states
 */
export enum SYNC_STATE {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  PUSHING = 'PUSHING',
  PULLING = 'PULLING',
  CONFLICTED = 'CONFLICTED',
  ERROR = 'ERROR',
  OFFLINE = 'OFFLINE',
}

/**
 * Enumeration for conflict resolution strategies
 */
export enum CONFLICT_RESOLUTION_STRATEGY {
  LAST_WRITE_WINS = 'LAST_WRITE_WINS',
  FIRST_WRITE_WINS = 'FIRST_WRITE_WINS',
  MANUAL = 'MANUAL',
  CUSTOM = 'CUSTOM',
}

/**
 * Enumeration for change types
 */
export enum CHANGE_TYPE {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Enumeration for document status
 */
export enum DOCUMENT_STATUS {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
  CONFLICTED = 'CONFLICTED',
}