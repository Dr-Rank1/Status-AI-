/**
 * Circuit Breaker — prevents cascading failures on external LLM APIs.
 *
 * States: CLOSED → OPEN (on failures/latency) → HALF_OPEN (probe) → CLOSED
 */

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.latencyThresholdMs = options.latencyThresholdMs ?? 10_000;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.openedAt = null;
    this.lastLatencyMs = 0;
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(latencyMs) {
    this.lastLatencyMs = latencyMs;
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
  }

  recordFailure(latencyMs, reason = 'error') {
    this.lastLatencyMs = latencyMs;
    this.failureCount += 1;

    const latencyTrip = latencyMs >= this.latencyThresholdMs;
    if (this.failureCount >= this.failureThreshold || latencyTrip) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      this.tripReason = latencyTrip ? 'latency' : reason;
    }
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastLatencyMs: this.lastLatencyMs,
      tripReason: this.tripReason ?? null,
    };
  }
}

const breakers = new Map();

export function getCircuitBreaker(name, options) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, options));
  }
  return breakers.get(name);
}

export function getAllCircuitBreakers() {
  return [...breakers.values()].map((b) => b.snapshot());
}

/**
 * Execute fn through the circuit breaker. onFallback runs when circuit is OPEN.
 */
export async function withCircuitBreaker(name, fn, onFallback, options = {}) {
  const breaker = getCircuitBreaker(name, options);

  if (!breaker.canExecute()) {
    return onFallback({ reason: 'circuit_open', breaker: breaker.snapshot() });
  }

  const started = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - started;
    breaker.recordSuccess(latencyMs);

    if (latencyMs >= breaker.latencyThresholdMs) {
      breaker.recordFailure(latencyMs, 'latency');
      return onFallback({ reason: 'latency_spike', breaker: breaker.snapshot() });
    }

    return result;
  } catch (err) {
    breaker.recordFailure(Date.now() - started, err.message);
    return onFallback({ reason: 'error', error: err, breaker: breaker.snapshot() });
  }
}
