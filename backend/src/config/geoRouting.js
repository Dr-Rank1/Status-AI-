/**
 * Geographic read-replica routing based on CDN / edge headers.
 */

const REGION_MAP = {
  US: 'us-east-1',
  CA: 'us-east-1',
  GB: 'eu-west-1',
  DE: 'eu-west-1',
  FR: 'eu-west-1',
  NL: 'eu-west-1',
  JP: 'ap-northeast-1',
  SG: 'ap-southeast-1',
  AU: 'ap-southeast-1',
};

const DEFAULT_READ_REGION = process.env.DEFAULT_READ_REGION ?? 'us-east-1';

export function getReadRegion(req) {
  const explicit = req?.headers?.['x-status-read-region'];
  if (explicit) return explicit;

  const cfCountry = req?.headers?.['cf-ipcountry'];
  if (cfCountry && REGION_MAP[cfCountry]) {
    return REGION_MAP[cfCountry];
  }

  const cloudFrontCountry = req?.headers?.['cloudfront-viewer-country'];
  if (cloudFrontCountry && REGION_MAP[cloudFrontCountry]) {
    return REGION_MAP[cloudFrontCountry];
  }

  return req?.regionId ?? DEFAULT_READ_REGION;
}

export function readRoutingHeaders(req) {
  return {
    'X-Status-Read-Region': getReadRegion(req),
  };
}
