import { describe, expect, it } from 'vitest';
import { classifyTxStatus, txStatusFromMessage } from './tx-status';

describe('classifyTxStatus', () => {
  it('keeps waiting only while the chain is still deciding', () => {
    expect(classifyTxStatus('pending')).toBe('pending');
    expect(classifyTxStatus('success')).toBe('success');
  });

  it('calls every ending that is not success a failure', () => {
    // A post condition that aborts is the one this page is most likely to
    // meet, and it is as final as the rest of them.
    for (const status of [
      'abort_by_response',
      'abort_by_post_condition',
      'dropped_replace_by_fee',
      'dropped_too_expensive',
      'dropped_stale_garbage_collect',
      'dropped_problematic',
    ]) {
      expect(classifyTxStatus(status)).toBe('failed');
    }
  });
});

describe('txStatusFromMessage', () => {
  const update = (txStatus: string) =>
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'tx_update',
      params: { tx_id: '0xabc', tx_status: txStatus },
    });

  it('reads the status out of an update', () => {
    expect(txStatusFromMessage(update('success'))).toBe('success');
    expect(txStatusFromMessage(update('abort_by_post_condition'))).toBe(
      'failed',
    );
  });

  it('ignores everything else the socket carries', () => {
    // The subscription's own acknowledgement, which names no status.
    expect(
      txStatusFromMessage(JSON.stringify({ jsonrpc: '2.0', id: '0xabc' })),
    ).toBeNull();
    expect(
      txStatusFromMessage(
        JSON.stringify({ method: 'block', params: { height: 1 } }),
      ),
    ).toBeNull();
    expect(txStatusFromMessage('not json')).toBeNull();
    expect(txStatusFromMessage(new Blob())).toBeNull();
  });
});
