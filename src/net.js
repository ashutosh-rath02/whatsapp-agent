// Network hardening. Imported for its side effects BEFORE any fetch happens.
//
// On many Windows / corporate networks the default Node fetch (undici) stalls
// on IPv6 (AAAA) connection attempts and trips its 10s connect timeout, which
// surfaces as intermittent "fetch failed / UND_ERR_CONNECT_TIMEOUT". We:
//   1. Prefer IPv4 DNS results.
//   2. Install a global dispatcher with a generous connect timeout, IPv4
//      family, and built-in retries.
import dns from 'node:dns';
import { setGlobalDispatcher, Agent, RetryAgent } from 'undici';

dns.setDefaultResultOrder('ipv4first');

const base = new Agent({
  connect: {
    timeout: 30_000, // 30s to establish a connection (default was 10s)
    family: 4, // force IPv4 to dodge IPv6 black-holes
  },
  headersTimeout: 60_000,
  bodyTimeout: 120_000,
});

// Retry transient connection/socket failures a few times with backoff.
const dispatcher = new RetryAgent(base, {
  maxRetries: 3,
  minTimeout: 500,
  maxTimeout: 4_000,
  timeoutFactor: 2,
  errorCodes: [
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETDOWN',
    'ENETUNREACH',
    'EHOSTDOWN',
    'EHOSTUNREACH',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ],
});

setGlobalDispatcher(dispatcher);
