import {createLocalJWKSet, exportJWK, generateKeyPair, SignJWT} from 'jose';
import {describe, expect, it} from 'vitest';
import {requireAccess} from '../src/api/access.js';

// Stands in for Access: a key pair whose public half the check trusts, and
// another key it does not.
const app = {team: 'https://example.cloudflareaccess.com', audience: 'todos-aud'};
const access = await generateKeyPair('RS256');
const other = await generateKeyPair('RS256');
const keys = createLocalJWKSet({keys: [{...(await exportJWK(access.publicKey)), kid: 'access', alg: 'RS256'}]});
const handler = requireAccess(async () => new Response('in'), app, keys);

const token = (key: CryptoKey, claims: {iss?: string; aud?: string; exp?: string} = {}) =>
	new SignJWT({})
		.setProtectedHeader({alg: 'RS256', kid: 'access'})
		.setIssuer(claims.iss ?? app.team)
		.setAudience(claims.aud ?? app.audience)
		.setExpirationTime(claims.exp ?? '1h')
		.sign(key);

const send = (token?: string) =>
	handler(new Request('https://todos.example.com/api/threads', token ? {headers: {'Cf-Access-Jwt-Assertion': token}} : {}));

describe('requireAccess', () => {
	it('lets in a request with a token Access signed for this app', async () => {
		const response = await send(await token(access.privateKey));
		expect(await response.text()).toBe('in');
	});

	it.each([
		['no token', async () => undefined],
		['a token that is not a token', async () => 'nonsense'],
		['a token signed by another key', async () => token(other.privateKey)],
		['a token for another Access app', async () => token(access.privateKey, {aud: 'other-aud'})],
		['a token from another team', async () => token(access.privateKey, {iss: 'https://other.cloudflareaccess.com'})],
		['a token that has expired', async () => token(access.privateKey, {exp: '-1m'})],
	])('turns away a request with %s', async (_, make) => {
		const response = await send(await make());
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({error: 'Sign in through Cloudflare Access first'});
	});
});
