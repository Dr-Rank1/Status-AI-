import { regionHeaders, REGION_ID, REGION_NAME } from '../config/region.js';
import { getAllCircuitBreakers } from '../services/circuitBreaker.js';
import { getEventStreamStatus } from '../services/eventStreamService.js';

export function regionMiddleware(_req, res, next) {
  for (const [key, value] of Object.entries(regionHeaders())) {
    res.setHeader(key, value);
  }
  next();
}

export async function regionStatus(_req, res) {
  const { checkPeerRegions } = await import('../config/region.js');
  const peers = await checkPeerRegions();

  res.json({
    region: {
      id: REGION_ID,
      name: REGION_NAME,
    },
    peers,
    circuitBreakers: getAllCircuitBreakers(),
    eventStream: getEventStreamStatus(),
  });
}
