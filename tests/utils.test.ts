import { describe, it, expect } from 'vitest';
import { 
  now, 
  generateId, 
  createVersion, 
  createDocument, 
  cloneDocument,
  isDeleted,
  markDeleted,
  compareVersions,
  simpleChecksum,
  retry
} from '../src/utils';

describe('Utils', () => {
  describe('now', () => {
    it('should return current timestamp', () => {
      const timestamp = now();
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(10);
    });
  });

  describe('createVersion', () => {
    it('should create version with provided timestamp', () => {
      const version = createVersion('test-id', 12345);
      expect(version.id).toBe('test-id');
      expect(version.timestamp).toBe(12345);
    });

    it('should create version with current timestamp if not provided', () => {
      const before = Date.now();
      const version = createVersion('test-id');
      const after = Date.now();
      
      expect(version.id).toBe('test-id');
      expect(version.timestamp).toBeGreaterThanOrEqual(before);
      expect(version.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createDocument', () => {
    it('should create document with provided ID', () => {
      const doc = createDocument({ name: 'test' }, 'custom-id');
      
      expect(doc.id).toBe('custom-id');
      expect(doc.data).toEqual({ name: 'test' });
      expect(doc.version.id).toBe('custom-id');
      expect(typeof doc.version.timestamp).toBe('number');
    });

    it('should create document with generated ID', () => {
      const doc = createDocument({ name: 'test' });
      
      expect(typeof doc.id).toBe('string');
      expect(doc.id.length).toBeGreaterThan(10);
      expect(doc.data).toEqual({ name: 'test' });
    });
  });

  describe('cloneDocument', () => {
    it('should clone document with new data', () => {
      const original = createDocument({ name: 'original' }, 'test-id');
      const cloned = cloneDocument(original, { name: 'updated' });
      
      expect(cloned.id).toBe(original.id);
      expect(cloned.data).toEqual({ name: 'updated' });
      expect(cloned.version.id).toBe(original.version.id);
      expect(cloned.version.timestamp).toBeGreaterThan(original.version.timestamp);
    });

    it('should clone document with same data but new timestamp', () => {
      const original = createDocument({ name: 'test' }, 'test-id');
      const cloned = cloneDocument(original);
      
      expect(cloned.data).toEqual(original.data);
      expect(cloned.version.timestamp).toBeGreaterThan(original.version.timestamp);
    });
  });

  describe('isDeleted and markDeleted', () => {
    it('should check if document is deleted', () => {
      const doc = createDocument({ name: 'test' });
      expect(isDeleted(doc)).toBe(false);
      
      const deletedDoc = { ...doc, deleted: true };
      expect(isDeleted(deletedDoc)).toBe(true);
    });

    it('should mark document as deleted', () => {
      const doc = createDocument({ name: 'test' });
      const deleted = markDeleted(doc);
      
      expect(deleted.deleted).toBe(true);
      expect(deleted.version.timestamp).toBeGreaterThan(doc.version.timestamp);
    });
  });

  describe('compareVersions', () => {
    it('should compare versions by timestamp', () => {
      const v1 = createVersion('id1', 100);
      const v2 = createVersion('id2', 200);
      const v3 = createVersion('id3', 100);
      
      expect(compareVersions(v1, v2)).toBe(-1); // v1 < v2
      expect(compareVersions(v2, v1)).toBe(1);  // v2 > v1
      expect(compareVersions(v1, v3)).toBeLessThanOrEqual(0); // Equal timestamps, compare by ID
    });

    it('should use ID as tiebreaker for equal timestamps', () => {
      const v1 = createVersion('aaa', 100);
      const v2 = createVersion('bbb', 100);
      
      expect(compareVersions(v1, v2)).toBe(-1); // 'aaa' < 'bbb'
      expect(compareVersions(v2, v1)).toBe(1);  // 'bbb' > 'aaa'
      expect(compareVersions(v1, v1)).toBe(0);  // Equal
    });
  });

  describe('simpleChecksum', () => {
    it('should generate consistent checksums', () => {
      const data = { name: 'test', value: 123 };
      const checksum1 = simpleChecksum(data);
      const checksum2 = simpleChecksum(data);
      
      expect(checksum1).toBe(checksum2);
      expect(typeof checksum1).toBe('string');
    });

    it('should generate different checksums for different data', () => {
      const data1 = { name: 'test1' };
      const data2 = { name: 'test2' };
      
      expect(simpleChecksum(data1)).not.toBe(simpleChecksum(data2));
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        return 'success';
      };
      
      const result = await retry(operation, 3);
      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not ready');
        }
        return 'success';
      };
      
      const result = await retry(operation, 3);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should fail after max attempts', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('Always fails');
      };
      
      await expect(retry(operation, 2)).rejects.toThrow('Always fails');
      expect(attempts).toBe(2);
    });
  });
});