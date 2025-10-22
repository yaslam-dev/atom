/**
 * Express.js backend example for the sync engine
 * 
 * This example shows how to implement the sync endpoints using Express.js and PostgreSQL.
 * Install dependencies:
 * npm install express pg cors body-parser helmet compression
 * npm install --save-dev @types/express @types/pg @types/cors nodemon typescript
 */

import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import type { PullResult, PushResult } from '../../src/interfaces';
import type { ChangeRecord } from '../../src/types';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'sync_engine',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Database schema
const initDB = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        version_id VARCHAR(255) NOT NULL,
        version_timestamp BIGINT NOT NULL,
        deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_documents_version_timestamp 
        ON documents(version_timestamp);
      CREATE INDEX IF NOT EXISTS idx_documents_deleted 
        ON documents(deleted);
      CREATE INDEX IF NOT EXISTS idx_documents_updated_at 
        ON documents(updated_at);
    `);
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      database: 'connected'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: Date.now()
    });
  }
});

// Pull endpoint - GET /sync/pull
app.get('/sync/pull', async (req, res) => {
  try {
    const since = parseInt(req.query.since as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    
    console.log(`Pull request: since=${since}, limit=${limit}, offset=${offset}`);
    
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT id, data, version_id, version_timestamp, deleted
        FROM documents 
        WHERE version_timestamp > $1
        ORDER BY version_timestamp ASC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await client.query(query, [since, limit, offset]);
      
      const changes: ChangeRecord[] = result.rows.map(row => ({
        id: row.id,
        operation: row.deleted ? 'delete' : (since === 0 ? 'create' : 'update'),
        data: row.deleted ? null : row.data,
        version: {
          id: row.version_id,
          timestamp: parseInt(row.version_timestamp)
        },
        localTimestamp: parseInt(row.version_timestamp)
      }));
      
      // Get the latest timestamp for the client
      const latestQuery = 'SELECT MAX(version_timestamp) as latest FROM documents';
      const latestResult = await client.query(latestQuery);
      const latestTimestamp = parseInt(latestResult.rows[0]?.latest) || Date.now();
      
      const response: PullResult = {
        success: true,
        changes,
        timestamp: latestTimestamp
      };
      
      console.log(`Pull response: ${changes.length} changes, latest timestamp: ${latestTimestamp}`);
      res.json(response);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Pull endpoint error:', error);
    res.status(500).json({
      success: false,
      changes: [],
      timestamp: Date.now(),
      error: 'Internal server error'
    } as PullResult);
  }
});

// Push endpoint - POST /sync/push
app.post('/sync/push', async (req, res) => {
  try {
    const { changes, lastSyncTimestamp } = req.body;
    
    if (!Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: changes must be an array'
      } as PushResult);
    }
    
    console.log(`Push request: ${changes.length} changes, lastSync: ${lastSyncTimestamp}`);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const conflicts: any[] = [];
      const serverTimestamp = Date.now();
      
      for (const change of changes) {
        const { id, operation, data, version } = change;
        
        // Check for conflicts
        const existingQuery = 'SELECT version_timestamp, deleted FROM documents WHERE id = $1';
        const existingResult = await client.query(existingQuery, [id]);
        
        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];
          const existingTimestamp = parseInt(existing.version_timestamp);
          
          // If server version is newer, we have a conflict
          if (existingTimestamp > version.timestamp) {
            conflicts.push({
              documentId: id,
              localVersion: version,
              remoteVersion: {
                id: id,
                timestamp: existingTimestamp
              },
              localData: data,
              remoteData: existing.deleted ? null : await getDocumentData(client, id)
            });
            continue; // Skip this change due to conflict
          }
        }
        
        // Apply the change
        if (operation === 'delete') {
          await client.query(`
            INSERT INTO documents (id, data, version_id, version_timestamp, deleted)
            VALUES ($1, '{}', $2, $3, true)
            ON CONFLICT (id) 
            DO UPDATE SET 
              version_id = $2,
              version_timestamp = $3,
              deleted = true,
              updated_at = CURRENT_TIMESTAMP
          `, [id, version.id, serverTimestamp]);
        } else {
          await client.query(`
            INSERT INTO documents (id, data, version_id, version_timestamp, deleted)
            VALUES ($1, $2, $3, $4, false)
            ON CONFLICT (id) 
            DO UPDATE SET 
              data = $2,
              version_id = $3,
              version_timestamp = $4,
              deleted = false,
              updated_at = CURRENT_TIMESTAMP
          `, [id, JSON.stringify(data), version.id, serverTimestamp]);
        }
      }
      
      await client.query('COMMIT');
      
      const response: PushResult = {
        success: true,
        conflicts,
        timestamp: serverTimestamp
      };
      
      console.log(`Push response: ${conflicts.length} conflicts, timestamp: ${serverTimestamp}`);
      res.json(response);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Push endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    } as PushResult);
  }
});

// Helper function to get document data
const getDocumentData = async (client: any, id: string): Promise<any> => {
  const result = await client.query('SELECT data FROM documents WHERE id = $1 AND deleted = false', [id]);
  return result.rows[0]?.data || null;
};

// Get all documents endpoint (for debugging)
app.get('/documents', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, data, version_id, version_timestamp, deleted, created_at, updated_at
        FROM documents 
        ORDER BY version_timestamp DESC
      `);
      
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all documents endpoint (for testing)
app.delete('/documents', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM documents');
      res.json({ message: 'All documents deleted' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Delete all documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: Date.now()
  });
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    await initDB();
    
    app.listen(port, () => {
      console.log(`🚀 Sync server running on port ${port}`);
      console.log(`📊 Health check: http://localhost:${port}/health`);
      console.log(`📥 Pull endpoint: http://localhost:${port}/sync/pull`);
      console.log(`📤 Push endpoint: http://localhost:${port}/sync/push`);
      console.log(`📋 Documents: http://localhost:${port}/documents`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

export { app, pool };