// Network hardening. Imported for its side effects BEFORE any fetch happens.
//
// Two layers:
//   1. Resilience (always on): a global dispatcher with a generous connect
//      timeout and automatic retries on transient connection failures.
//   2. IPv4 forcing (conditional): some Windows / corporate networks stall on
//      IPv6 (AAAA) and trip the connect timeout. Forcing IPv4 fixes that, but
//      it's wrong on IPv6-only hosts — so it's gated.
//
// Control with NET_FORCE_IPV4 = auto (default: on for Windows only) | true | false.
import dns from 'node:dns';
import { setGlobalDispatcher, Agent, RetryAgent } from 'undici';

const mode = (process.env.NET_FORCE_IPV4 || 'auto').toLowerCase();
const forceIpv4 =
  mode === 'true' || mode === '1' || (mode === 'auto' && process.platform === 'win32');

if (forceIpv4) dns.setDefaultResultOrder('ipv4first');

const base = new Agent({
  connect: {
    timeout: 30_000, // 30s to establish a connection (default was 10s)
    ...(forceIpv4 ? { family: 4 } : {}),
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
