import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncEventEmitter } from '../src/event-emitter';
import { SYNC_EVENT, SYNC_OPERATION } from '../src/enums';

describe('SyncEventEmitter', () => {
    let emitter: SyncEventEmitter;

    beforeEach(() => {
        emitter = new SyncEventEmitter();
    });

    it('should emit and listen to events', () => {
        let received: any = null;

        emitter.on(SYNC_EVENT.DOCUMENT_CREATED, (data) => {
            received = data;
        });

        const testData = {
            document: {
                id: 'test-1',
                data: { name: 'test' },
                version: { id: 'test-1', timestamp: Date.now() }
            }
        };

        emitter.emit(SYNC_EVENT.DOCUMENT_CREATED, testData);

        expect(received).toEqual(testData);
    });

    it('should return unsubscribe function', () => {
        let callCount = 0;

        const unsubscribe = emitter.on(SYNC_EVENT.SYNC_STARTED, () => {
            callCount++;
        });

        emitter.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PUSH });
        expect(callCount).toBe(1);

        unsubscribe();
        emitter.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PULL });
        expect(callCount).toBe(1); // Should not increment
    });

  it('should handle multiple listeners', () => {
    const results: string[] = [];
    
    emitter.on(SYNC_EVENT.SYNC_COMPLETED, () => results.push('listener1'));
    emitter.on(SYNC_EVENT.SYNC_COMPLETED, () => results.push('listener2'));
    
    emitter.emit(SYNC_EVENT.SYNC_COMPLETED, { type: SYNC_OPERATION.PUSH, changeCount: 5 });
    
    expect(results).toEqual(['listener1', 'listener2']);
  });    it('should remove specific listeners', () => {
        let count1 = 0;
        let count2 = 0;

        const listener1 = () => count1++;
        const listener2 = () => count2++;

        emitter.on(SYNC_EVENT.SYNC_STARTED, listener1);
        emitter.on(SYNC_EVENT.SYNC_STARTED, listener2);

        emitter.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PUSH });
        expect(count1).toBe(1);
        expect(count2).toBe(1);

        emitter.off(SYNC_EVENT.SYNC_STARTED, listener1);
        emitter.emit(SYNC_EVENT.SYNC_STARTED, { type: SYNC_OPERATION.PULL });
        expect(count1).toBe(1); // Should not increment
        expect(count2).toBe(2);
    });

    it('should remove all listeners', () => {
        let callCount = 0;

        emitter.on(SYNC_EVENT.DOCUMENT_UPDATED, () => callCount++);
        emitter.on(SYNC_EVENT.DOCUMENT_DELETED, () => callCount++);

        emitter.removeAllListeners();

        emitter.emit(SYNC_EVENT.DOCUMENT_UPDATED, {
            document: { id: '1', data: {}, version: { id: '1', timestamp: 1 } },
            previousVersion: { id: '1', timestamp: 0 }
        });
        emitter.emit(SYNC_EVENT.DOCUMENT_DELETED, { id: '1', version: { id: '1', timestamp: 1 } });

        expect(callCount).toBe(0);
    });

    it('should handle errors in listeners gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        let successCount = 0;

        emitter.on(SYNC_EVENT.DOCUMENT_CREATED, () => {
            throw new Error('Test error');
        });

        emitter.on(SYNC_EVENT.DOCUMENT_CREATED, () => {
            successCount++;
        });

        emitter.emit(SYNC_EVENT.DOCUMENT_CREATED, {
            document: { id: '1', data: {}, version: { id: '1', timestamp: 1 } }
        });

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Error in event listener'),
            expect.any(Error)
        );
        expect(successCount).toBe(1); // Second listener should still execute

        consoleSpy.mockRestore();
    });

    it('should return correct listener count', () => {
        expect(emitter.listenerCount(SYNC_EVENT.SYNC_STARTED)).toBe(0);

        const unsubscribe1 = emitter.on(SYNC_EVENT.SYNC_STARTED, () => { });
        expect(emitter.listenerCount(SYNC_EVENT.SYNC_STARTED)).toBe(1);

        const unsubscribe2 = emitter.on(SYNC_EVENT.SYNC_STARTED, () => { });
        expect(emitter.listenerCount(SYNC_EVENT.SYNC_STARTED)).toBe(2);

        unsubscribe1();
        expect(emitter.listenerCount(SYNC_EVENT.SYNC_STARTED)).toBe(1);

        unsubscribe2();
        expect(emitter.listenerCount(SYNC_EVENT.SYNC_STARTED)).toBe(0);
    });
});