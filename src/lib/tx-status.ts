/**
 * Whether a transaction made it.
 *
 * The API answers with a dozen `tx_status` values, and somebody watching a
 * stake go through needs three of them: still going, done, did not happen.
 * Anything that is not `pending` and not `success` is a transaction that will
 * never confirm — rejected, aborted, or dropped from the mempool — so they all
 * come back the same way rather than as a list of words nobody knows.
 */
export type TxStatus = 'pending' | 'success' | 'failed';

export function classifyTxStatus(status: string): TxStatus {
  if (status === 'success') return 'success';
  if (status === 'pending') return 'pending';
  return 'failed';
}

/**
 * The status inside a `tx_update` notification, or null for anything else.
 *
 * The socket carries the subscription's own acknowledgement and whatever else
 * the API decides to send; only the update names a status.
 */
export function txStatusFromMessage(data: unknown): TxStatus | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as {
      method?: string;
      params?: { tx_status?: string };
    };
    if (message.method !== 'tx_update') return null;
    const status = message.params?.tx_status;
    return status ? classifyTxStatus(status) : null;
  } catch {
    return null;
  }
}

/**
 * The status of one transaction, or null for "no answer yet".
 *
 * A node that has not heard of a transaction 404s, which is what a broadcast
 * looks like for its first second or two. That is not a failure and must not
 * be shown as one.
 */
export async function fetchTxStatus(
  txid: string,
  apiUrl: string,
): Promise<TxStatus | null> {
  try {
    const response = await fetch(`${apiUrl}/extended/v1/tx/${txid}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { tx_status?: string };
    return body.tx_status ? classifyTxStatus(body.tx_status) : null;
  } catch {
    return null;
  }
}

/**
 * Watches one transaction over the API's socket, and says when it lands.
 *
 * The API pushes a `tx_update` when the transaction's status changes, so
 * nothing here asks twice: the page learns of a confirmation when it happens
 * rather than up to an interval later, and a dialog left open costs the node
 * one idle connection instead of a request every few seconds.
 *
 * Returns the function that stops watching. It is called for a status that
 * cannot change again, and by the caller when the reader has moved on.
 */
export function watchTxStatus(opts: {
  txid: string;
  apiUrl: string;
  onStatus: (status: TxStatus) => void;
}): () => void {
  let socket: WebSocket | undefined;
  let stopped = false;

  const stop = () => {
    stopped = true;
    socket?.close();
    socket = undefined;
  };

  const report = (status: TxStatus) => {
    if (stopped) return;
    opts.onStatus(status);
    // Success and failure are both final; there is no second update coming.
    if (status !== 'pending') stop();
  };

  try {
    socket = new WebSocket(
      `${opts.apiUrl.replace(/^http/, 'ws')}/extended/v1/ws`,
    );
  } catch {
    // No socket, no watching. The transaction is linked either way, so the
    // reader can still follow it — they simply do not get told here.
    return () => {};
  }

  socket.addEventListener('open', () => {
    socket?.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: opts.txid,
        method: 'subscribe',
        params: { event: 'tx_update', tx_id: opts.txid },
      }),
    );

    // One read, for the transaction that confirmed before the socket was
    // listening: there is no update left for it to send, and without this the
    // dialog would wait for a change that has already happened.
    void fetchTxStatus(opts.txid, opts.apiUrl).then((status) => {
      if (status) report(status);
    });
  });

  socket.addEventListener('message', (event: MessageEvent) => {
    const status = txStatusFromMessage(event.data);
    if (status) report(status);
  });

  return stop;
}
