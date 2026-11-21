// Minimal in-memory fixed-window rate limiter (single container, no deps).
// Client IP: Cloudflare's CF-Connecting-IP (traffic arrives via Cloudflare Tunnel -> NPM),
// falling back to X-Forwarded-For / socket address.
function clientIp(req) {
  return (
    req.get('cf-connecting-ip') ||
    (req.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

export function rateLimit({ windowMs, max, name }) {
  const hits = new Map(); // key -> { count, resetAt }
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${name}:${clientIp(req)}`;
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(key, e);
    }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts — please wait a few minutes and try again.' });
    }
    next();
  };
}

const MIN = 60 * 1000;
export const loginLimiter = rateLimit({ name: 'login', windowMs: 15 * MIN, max: 20 });
export const registerLimiter = rateLimit({ name: 'register', windowMs: 60 * MIN, max: 10 });
export const writeLimiter = rateLimit({ name: 'write', windowMs: 1 * MIN, max: 30 });
