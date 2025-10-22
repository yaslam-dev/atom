/**
 * Simple Node.js HTTP server example for the sync engine
 * 
 * This example shows a minimal implementation without external dependencies.
 * It uses in-memory storage for simplicity, but shows the expected API patterns.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import type { PullResult, PushResult } from '../../src/interfaces';
import type { ChangeRecord } from '../../src/types';

const port = process.env.PORT || 3000;

// In-memory storage (use a real database in production)
interface StoredDocument {
  id: string;
  data: any;
  versionId: string;
  versionTimestamp: number;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

const documents = new Map<string, StoredDocument>();

// Helper functions
const parseBody = (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
};

const sendJSON = (res: ServerResponse, statusCode: number, data: any): void => {
  res.writeHead(statusCode, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
};

const sendError = (res: ServerResponse, statusCode: number, message: string): void => {
  sendJSON(res, statusCode, {
    success: false,
    error: message,
    timestamp: Date.now()
  });
};

// Health check endpoint
const handleHealth = (req: IncomingMessage, res: ServerResponse): void => {
  sendJSON(res, 200, {
    status: 'healthy',
    timestamp: Date.now(),
    documents: documents.size
  });
};

// Pull endpoint - GET /sync/pull
const handlePull = (req: IncomingMessage, res: ServerResponse): void => {
  try {
    const url = new URL(req.url || '', `http://localhost:${port}`);
    const since = parseInt(url.searchParams.get('since') || '0');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    console.log(`Pull request: since=${since}, limit=${limit}, offset=${offset}`);
    
    // Get documents modified after 'since' timestamp
    const allDocs = Array.from(documents.values())
      .filter(doc => doc.versionTimestamp > since)
      .sort((a, b) => a.versionTimestamp - b.versionTimestamp)
      .slice(offset, offset + limit);
    
    const changes: ChangeRecord[] = allDocs.map(doc => ({
      id: doc.id,
      operation: doc.deleted ? 'delete' : (since === 0 ? 'create' : 'update'),
      data: doc.deleted ? null : doc.data,
      version: {
        id: doc.versionId,
        timestamp: doc.versionTimestamp
      },
      localTimestamp: doc.versionTimestamp
    }));
    
    // Get the latest timestamp
    const latestTimestamp = Math.max(
      ...Array.from(documents.values()).map(d => d.versionTimestamp),
      Date.now()
    );
    
    const response: PullResult = {
      success: true,
      changes,
      timestamp: latestTimestamp
    };
    
    console.log(`Pull response: ${changes.length} changes, latest timestamp: ${latestTimestamp}`);
    sendJSON(res, 200, response);
    
  } catch (error) {
    console.error('Pull endpoint error:', error);
    const response: PullResult = {
      success: false,
      changes: [],
      timestamp: Date.now(),
      error: 'Internal server error'
    };
    sendJSON(res, 500, response);
  }
};

// Push endpoint - POST /sync/push
const handlePush = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const body = await parseBody(req);
    const { changes, lastSyncTimestamp } = body;
    
    if (!Array.isArray(changes)) {
      return sendError(res, 400, 'Invalid request: changes must be an array');
    }
    
    console.log(`Push request: ${changes.length} changes, lastSync: ${lastSyncTimestamp}`);
    
    const conflicts: any[] = [];
    const serverTimestamp = Date.now();
    
    for (const change of changes) {
      const { id, operation, data, version } = change;
      
      // Check for conflicts
      const existing = documents.get(id);
      if (existing && existing.versionTimestamp > version.timestamp) {
        // Server version is newer, we have a conflict
        conflicts.push({
          documentId: id,
          localVersion: version,
          remoteVersion: {
            id: existing.versionId,
            timestamp: existing.versionTimestamp
          },
          localData: data,
          remoteData: existing.deleted ? null : existing.data
        });
        continue; // Skip this change due to conflict
      }
      
      // Apply the change
      if (operation === 'delete') {
        documents.set(id, {
          id,
          data: {},
          versionId: version.id,
          versionTimestamp: serverTimestamp,
          deleted: true,
          createdAt: existing?.createdAt || serverTimestamp,
          updatedAt: serverTimestamp
        });
      } else {
        documents.set(id, {
          id,
          data,
          versionId: version.id,  
          versionTimestamp: serverTimestamp,
          deleted: false,
          createdAt: existing?.createdAt || serverTimestamp,
          updatedAt: serverTimestamp
        });
      }
    }
    
    const response: PushResult = {
      success: true,
      conflicts,
      timestamp: serverTimestamp
    };
    
    console.log(`Push response: ${conflicts.length} conflicts, timestamp: ${serverTimestamp}`);
    sendJSON(res, 200, response);
    
  } catch (error) {
    console.error('Push endpoint error:', error);
    const response: PushResult = {
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    };
    sendJSON(res, 500, response);
  }
};

// Get all documents endpoint (for debugging)
const handleGetDocuments = (req: IncomingMessage, res: ServerResponse): void => {
  const allDocs = Array.from(documents.values())
    .sort((a, b) => b.versionTimestamp - a.versionTimestamp);
  
  sendJSON(res, 200, allDocs);
};

// Delete all documents endpoint (for testing)
const handleDeleteDocuments = (req: IncomingMessage, res: ServerResponse): void => {
  documents.clear();
  sendJSON(res, 200, { message: 'All documents deleted' });
};

// Handle CORS preflight requests
const handleOptions = (req: IncomingMessage, res: ServerResponse): void => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  });
  res.end();
};

// Main request handler
const requestHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const method = req.method?.toUpperCase();
  const url = new URL(req.url || '', `http://localhost:${port}`);
  const path = url.pathname;
  
  console.log(`${method} ${path}`);
  
  try {
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions(req, res);
    }
    
    // Route requests
    if (path === '/health' && method === 'GET') {
      return handleHealth(req, res);
    }
    
    if (path === '/sync/pull' && method === 'GET') {
      return handlePull(req, res);
    }
    
    if (path === '/sync/push' && method === 'POST') {
      return await handlePush(req, res);
    }
    
    if (path === '/documents' && method === 'GET') {
      return handleGetDocuments(req, res);
    }
    
    if (path === '/documents' && method === 'DELETE') {
      return handleDeleteDocuments(req, res);
    }
    
    // 404 Not Found
    sendError(res, 404, 'Endpoint not found');
    
  } catch (error) {
    console.error('Request handler error:', error);
    sendError(res, 500, 'Internal server error');
  }
};

// Create and start server
const server = createServer(requestHandler);

server.listen(port, () => {
  console.log(`🚀 Sync server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`📥 Pull endpoint: http://localhost:${port}/sync/pull`);
  console.log(`📤 Push endpoint: http://localhost:${port}/sync/push`);
  console.log(`📋 Documents: http://localhost:${port}/documents`);
  console.log('');
  console.log('Example client configuration:');
  console.log(`const transport = new HttpTransportAdapter({`);
  console.log(`  baseUrl: 'http://localhost:${port}',`);
  console.log(`  endpoints: {`);
  console.log(`    push: '/sync/push',`);
  console.log(`    pull: '/sync/pull',`);
  console.log(`    health: '/health'`);
  console.log(`  }`);
  console.log(`});`);
});

// Graceful shutdown
const shutdown = (): void => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { server, documents };