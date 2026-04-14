import "server-only";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type BarrierState = {
  parties: number;
  arrivals: number;
  deferred: Deferred;
};

declare global {
  // eslint-disable-next-line no-var
  var __ROOMSHARE_TEST_BARRIERS__: Map<string, BarrierState> | undefined;
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function getBarrierStore(): Map<string, BarrierState> {
  if (!globalThis.__ROOMSHARE_TEST_BARRIERS__) {
    globalThis.__ROOMSHARE_TEST_BARRIERS__ = new Map();
  }

  return globalThis.__ROOMSHARE_TEST_BARRIERS__;
}

export function areTestBarriersEnabled(): boolean {
  return (
    process.env.VERCEL_ENV !== "production" &&
    process.env.E2E_TEST_HELPERS === "true"
  );
}

export function enableTestBarrier(name: string, parties: number): void {
  if (!areTestBarriersEnabled()) {
    return;
  }

  getBarrierStore().set(name, {
    parties: Math.max(1, Math.trunc(parties)),
    arrivals: 0,
    deferred: createDeferred(),
  });
}

export function disableTestBarrier(name: string): void {
  const barrier = getBarrierStore().get(name);
  if (!barrier) {
    return;
  }

  barrier.deferred.resolve();
  getBarrierStore().delete(name);
}

export function resetTestBarriers(): void {
  const store = getBarrierStore();
  for (const barrier of store.values()) {
    barrier.deferred.resolve();
  }
  store.clear();
}

export async function waitForTestBarrier(
  name: string,
  timeoutMs = 10_000
): Promise<void> {
  if (!areTestBarriersEnabled()) {
    return;
  }

  const barrier = getBarrierStore().get(name);
  if (!barrier) {
    return;
  }

  barrier.arrivals += 1;

  if (barrier.arrivals >= barrier.parties) {
    barrier.deferred.resolve();
    getBarrierStore().delete(name);
    return;
  }

  await Promise.race([
    barrier.deferred.promise,
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        getBarrierStore().delete(name);
        reject(new Error(`TEST_BARRIER_TIMEOUT:${name}`));
      }, timeoutMs);

      barrier.deferred.promise.finally(() => {
        clearTimeout(timer);
        resolve();
      });
    }),
  ]);
}
