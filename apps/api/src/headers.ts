// Security headers for every response the Worker returns.

/** connect-src names this origin's WebSocket scheme too: older browsers do not let 'self' cover ws:/wss:. */
export function securityHeaders(url: URL): Record<string, string> {
  const socket = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  return {
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' blob: data:", "media-src 'self' blob:", `connect-src 'self' ${socket}`,
      "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    ].join('; '),
    'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security': 'max-age=31536000',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

export function withHeaders(res: Response, url: URL): Response {
  // A WebSocket upgrade (101) is passed through as is: it cannot be rebuilt as a plain Response.
  if (res.status === 101 || res.webSocket) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(securityHeaders(url))) out.headers.set(k, v);
  return out;
}
