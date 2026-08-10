/**
 * Cloud Run entry — stateless MCP echo/proxy (scale-to-zero).
 */
import http from 'node:http';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const ORIGIN = process.env.STATUS_MCP_ORIGIN ?? '';
const PROTOCOL = process.env.MCP_PROTOCOL_VERSION ?? '2026-07-28';

const server = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    return send(res, 200, {
      ok: true,
      service: 'status-agent-swarm',
      protocolVersion: PROTOCOL,
      stickySessions: false,
      scaleToZero: true,
    });
  }

  if (req.method === 'POST' && (req.url === '/mcp' || req.url?.startsWith('/mcp'))) {
    const body = await readBody(req);
    if (ORIGIN) {
      try {
        const upstream = await fetch(ORIGIN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Mcp-Method': req.headers['mcp-method'] ?? 'ping',
            'Mcp-Name': req.headers['mcp-name'] ?? '',
            'Mcp-Protocol-Version': PROTOCOL,
            'X-MCP-Agent-Token': req.headers['x-mcp-agent-token'] ?? '',
          },
          body,
        });
        const text = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        res.end(text);
        return;
      } catch (err) {
        return send(res, 502, { error: { code: 'UPSTREAM', message: err.message } });
      }
    }

    return send(res, 200, {
      jsonrpc: '2.0',
      result: {
        ok: true,
        echo: true,
        method: req.headers['mcp-method'] ?? 'ping',
        name: req.headers['mcp-name'] ?? null,
        protocolVersion: PROTOCOL,
      },
    });
  }

  send(res, 404, { error: { code: 'NOT_FOUND', message: 'POST /mcp' } });
});

server.listen(PORT, () => {
  console.log(`[agent-swarm] listening on :${PORT} protocol=${PROTOCOL}`);
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8') || '{}'));
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
