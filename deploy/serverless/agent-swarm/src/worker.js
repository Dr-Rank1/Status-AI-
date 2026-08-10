/**
 * Cloudflare Worker entry — thin stateless MCP edge proxy.
 * Forwards Mcp-Method / Mcp-Name to the Status API gateway (scale-to-zero).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    if (url.pathname === '/health' || url.pathname === '/') {
      return json({
        ok: true,
        service: 'status-agent-swarm',
        protocolVersion: env.MCP_PROTOCOL_VERSION ?? '2026-07-28',
        stickySessions: false,
      });
    }

    if (url.pathname !== '/mcp' && !url.pathname.startsWith('/mcp/')) {
      return json({ error: { code: 'NOT_FOUND', message: 'Use POST /mcp' } }, 404);
    }

    const origin = env.STATUS_MCP_ORIGIN;
    if (!origin) {
      // Local echo mode for dry-run deploys
      const method = request.headers.get('Mcp-Method') ?? 'ping';
      return json({
        jsonrpc: '2.0',
        result: {
          ok: true,
          echo: true,
          method,
          name: request.headers.get('Mcp-Name'),
          protocolVersion: env.MCP_PROTOCOL_VERSION ?? '2026-07-28',
          note: 'Set STATUS_MCP_ORIGIN to proxy to Status /api/v2/mcp',
        },
      });
    }

    const headers = new Headers(request.headers);
    headers.set('Mcp-Protocol-Version', env.MCP_PROTOCOL_VERSION ?? '2026-07-28');
    headers.set('Mcp-Transport', 'cloudflare-worker');

    const upstream = await fetch(origin, {
      method: 'POST',
      headers,
      body: request.body,
    });

    const out = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(corsHeaders())) out.headers.set(k, v);
    return out;
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, Mcp-Method, Mcp-Name, Mcp-Protocol-Version, Mcp-Request-Id, Mcp-Cache-Scope, X-MCP-Agent-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
