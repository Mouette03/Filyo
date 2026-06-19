declare module 'openid-client' {
  export interface Configuration {}

  export type ClientAuth = (...args: unknown[]) => void

  export function discovery(
    server: URL,
    clientId: string,
    metadata?: Record<string, unknown> | string,
    clientAuthentication?: ClientAuth,
    options?: { algorithm?: 'oidc' | 'oauth2'; execute?: Array<(config: Configuration) => void>; timeout?: number },
  ): Promise<Configuration>

  export function randomState(): string

  export function randomPKCECodeVerifier(): string

  export function calculatePKCECodeChallenge(codeVerifier: string): Promise<string>

  export function buildAuthorizationUrl(
    config: Configuration,
    parameters: Record<string, string>,
  ): URL

  export interface IdTokenClaims {
    sub: string
    email?: string
    name?: string
    email_verified?: boolean
    [key: string]: unknown
  }

  export interface TokenEndpointResponse {
    access_token: string
    token_type?: string
    expires_in?: number
    scope?: string
    id_token?: string
  }

  export interface TokenEndpointResponseHelpers {
    claims(): IdTokenClaims
  }

  export function authorizationCodeGrant(
    config: Configuration,
    callbackParameters: Record<string, string>,
    options?: { expectedState?: string; codeVerifier?: string },
  ): Promise<TokenEndpointResponse & TokenEndpointResponseHelpers>
}
