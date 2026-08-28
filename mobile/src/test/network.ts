/**
 * The HTTP the app makes, answered from memory.
 *
 * Matched on what the URL is *for* rather than on an exact string: the app is
 * allowed to change which node it asks and how it pages, and a test that broke
 * on that would be testing the URL rather than the behaviour.
 */

export type NetworkOptions = {
  balanceUstx?: bigint;
  lockedUstx?: bigint;
  /** 404 the data files, as an offline first launch would. */
  offlineData?: boolean;
  history?: unknown;
};

export function installFetch(options: NetworkOptions = {}): jest.Mock {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/extended/v1/address/') && url.includes('/balances')) {
      return json({
        stx: {
          balance: String(options.balanceUstx ?? 500_000_000n),
          locked: String(options.lockedUstx ?? 0n),
        },
      });
    }

    if (url.includes('/extended/v2/addresses/')) {
      return json({ results: [] });
    }

    if (url.includes('stx-only-history.json')) {
      return options.history === undefined
        ? notFound()
        : json(options.history);
    }

    if (
      url.includes('signers.json') ||
      url.includes('totals.json') ||
      url.includes('stx-only-calculations.json')
    ) {
      // The bundled copy stands when the branch does not answer, which is what
      // the app is meant to do — so the default is that it does not answer.
      return options.offlineData === false ? json({}) : notFound();
    }

    return notFound();
  });

  (globalThis as { fetch: unknown }).fetch = fetchMock;
  return fetchMock as unknown as jest.Mock;
}

function json(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function notFound() {
  return {
    ok: false,
    status: 404,
    json: async () => ({}),
  } as unknown as Response;
}
