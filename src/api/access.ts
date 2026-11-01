// The hosted API lets a request in only with a token that Cloudflare Access
// signed for this app. Access already stands in front of the hosted domain, so
// this keeps the API closed even if Access were ever turned off or got around,
// which matters because the API accepts prompts that Home types into Claude.

import {createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey} from 'jose';
import type {ApiHandler} from './api.js';

export type AccessApp = {
	// The team's address, such as https://example.cloudflareaccess.com.
	team: string;
	// The Access app's Application Audience (AUD) tag.
	audience: string;
};

// Access signs with keys it publishes at the team's address. `keys` is only
// given by tests, which sign their own tokens.
export function requireAccess(
	handler: ApiHandler,
	{team, audience}: AccessApp,
	keys: JWTVerifyGetKey = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', team)),
): ApiHandler {
	return async request => {
		const token = request.headers.get('Cf-Access-Jwt-Assertion');
		try {
			if (!token) throw new Error('no token');
			await jwtVerify(token, keys, {issuer: team, audience, algorithms: ['RS256']});
		} catch {
			return Response.json({error: 'Sign in through Cloudflare Access first'}, {status: 403});
		}
		return handler(request);
	};
}
