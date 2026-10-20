import { HttpException } from '@nestjs/common';

export const CREATOR_ISSUER = 'https://mcp.abeiai.com';
export const CREATOR_MCP_AUDIENCE = `${CREATOR_ISSUER}/mcp`;
export const CREATOR_API_AUDIENCE = `${CREATOR_ISSUER}/api/creator/v1`;
export const CREATOR_SCOPES = ['creator:read', 'creator:write', 'creator:submit'] as const;
export type CreatorScope = typeof CREATOR_SCOPES[number];
export interface CreatorPrincipal {
  userId: string;
  grantId: string;
  clientId: string;
  scopes: CreatorScope[];
  audience: string;
}
export class CreatorOAuthError extends HttpException {
  constructor(public readonly error: string, description = '授权请求无效', status = 400) {
    super({ error, error_description: description }, status);
  }
}
export function resourceMetadataUrl(audience: string) {
  return `${CREATOR_ISSUER}/.well-known/oauth-protected-resource${audience === CREATOR_API_AUDIENCE ? '/api/creator/v1' : '/mcp'}`;
}
/** Use this header with HTTP 401 on each protected transport. */
export function creatorUnauthorizedChallenge(audience: string) {
  return `Bearer resource_metadata="${resourceMetadataUrl(audience)}"`;
}
export function creatorMainOrigin() {
  const origin = process.env.CREATOR_MAIN_ORIGIN ?? 'https://abeiai.com';
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('创作授权主站地址配置无效');
  }
  return origin;
}
export function oauthMetadata() {
  return {
    issuer: CREATOR_ISSUER,
    authorization_endpoint: `${CREATOR_ISSUER}/oauth/authorize`,
    token_endpoint: `${CREATOR_ISSUER}/oauth/token`,
    registration_endpoint: `${CREATOR_ISSUER}/oauth/register`,
    revocation_endpoint: `${CREATOR_ISSUER}/oauth/revoke`,
    device_authorization_endpoint: `${CREATOR_ISSUER}/oauth/device`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [...CREATOR_SCOPES]
  };
}
export function protectedResourceMetadata(resource: string) {
  if (!['mcp', 'api'].includes(resource)) throw new CreatorOAuthError('invalid_target');
  return { resource: resource === 'api' ? CREATOR_API_AUDIENCE : CREATOR_MCP_AUDIENCE, authorization_servers: [CREATOR_ISSUER], scopes_supported: [...CREATOR_SCOPES], bearer_methods_supported: ['header'] };
}
