import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSpatialPayload } from '../src/middleware/spatialPrivacy.js';
import { evaluateGeofence } from '../src/services/spatialGeofenceService.js';

test('sanitizeSpatialPayload rejects raw point cloud data', () => {
  assert.throws(
    () => sanitizeSpatialPayload({ proxemic_zone: 'personal', point_cloud: [[1, 2, 3]] }),
    (err) => err.message.includes('Raw spatial data rejected')
  );
});

test('sanitizeSpatialPayload allows processed buckets only', () => {
  const result = sanitizeSpatialPayload({
    proxemic_zone: 'social',
    room_type: 'living',
    lighting_level: 'dim',
    furniture_density: 'moderate',
    residency_region: 'eu',
  });

  assert.equal(result.proxemic_zone, 'social');
  assert.equal(result.processed_only, true);
});

test('evaluateGeofence blocks bedroom sensitive zone label', () => {
  const result = evaluateGeofence({ zoneLabel: 'bedroom', residencyRegion: 'local' });
  assert.equal(result.allowed, false);
  assert.equal(result.zoneId, 'bedroom');
});

test('evaluateGeofence allows neutral workspace context', () => {
  const result = evaluateGeofence({ zoneLabel: 'living', residencyRegion: 'us' });
  assert.equal(result.allowed, true);
});
