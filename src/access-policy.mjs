/** Original Radar policy. Not JWT verification or a running MCP server.
 * verifyAccessToken must validate signature, algorithm and access-token type.
 * Grants and sessionSubject come from trusted server state, never tool arguments.
 */
const READ_TOOLS = new Set(['repo_summary','search_symbols','symbol_context','impact_preview','source_excerpt']);
const COMMIT = /^[0-9a-f]{40}$/;
export class AccessDenied extends Error {
  constructor() { super('Repository context access denied.'); this.name = 'AccessDenied'; }
}
const deny = () => { throw new AccessDenied(); };
export function isSafeSourcePath(value) {
  if (typeof value !== 'string' || !value.length || value.length > 512) return false;
  if (/[\\%\x00-\x1f\x7f:]/u.test(value) || value.startsWith('/')) return false;
  const parts = value.split('/');
  if (parts.some(p => ['', '.', '..', '.git', '.ssh'].includes(p.toLowerCase()))) return false;
  const leaf = parts.at(-1).toLowerCase();
  if (leaf.startsWith('.env') || /\.(pem|key|p12|pfx|p8)$/u.test(leaf)) return false;
  return !['id_rsa','id_ed25519','credentials.json','.npmrc','.netrc'].includes(leaf);
}
export function createAuthorizer({ issuer, audience, grants, verifyAccessToken, now = () => Math.floor(Date.now()/1000) }) {
  for (const value of [issuer, audience]) {
    let url; try { url = new URL(value); } catch { throw new TypeError('Configure HTTPS identities.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new TypeError('Configure HTTPS identities.');
  }
  if (typeof verifyAccessToken !== 'function' || typeof now !== 'function' || !Array.isArray(grants)) throw new TypeError('Missing trusted verifier or grants.');
  const policy = new Map();
  for (const g of grants) {
    if (!g || typeof g.subject !== 'string' || !g.subject.length || !Number.isSafeInteger(g.repositoryId) || g.repositoryId < 1 || typeof g.commit !== 'string' || !COMMIT.test(g.commit)) throw new TypeError('Invalid grant.');
    const k = JSON.stringify([g.subject,g.repositoryId]);
    if (policy.has(k)) throw new TypeError('Duplicate grant.');
    policy.set(k,g.commit);
  }
  return async function authorize(request, { sessionSubject } = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) deny();
    if (Object.keys(request).some(k => !['accessToken','tool','repositoryId','commit','sourcePath'].includes(k))) deny();
    const {accessToken,tool,repositoryId,commit,sourcePath} = request;
    if (typeof accessToken !== 'string' || !accessToken.length || accessToken.length > 16384) deny();
    if (!READ_TOOLS.has(tool) || !Number.isSafeInteger(repositoryId) || repositoryId < 1 || typeof commit !== 'string' || !COMMIT.test(commit)) deny();
    if (tool === 'source_excerpt' ? !isSafeSourcePath(sourcePath) : sourcePath !== undefined) deny();
    let claims; try { claims = await verifyAccessToken(accessToken); } catch { deny(); }
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) deny();
    const instant = now();
    if (!Number.isSafeInteger(instant) || !Number.isSafeInteger(claims.exp) || claims.exp <= instant) deny();
    if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > instant)) deny();
    if (claims.iss !== issuer || typeof claims.sub !== 'string' || !claims.sub.length) deny();
    const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
    if (!Array.isArray(audiences) || audiences.some(x => typeof x !== 'string') || !audiences.includes(audience)) deny();
    const scopes = typeof claims.scope === 'string' ? new Set(claims.scope.split(/\s+/u)) : new Set();
    if (!scopes.has('code:read')) deny();
    if (sessionSubject !== undefined && sessionSubject !== claims.sub) deny();
    if (policy.get(JSON.stringify([claims.sub,repositoryId])) !== commit) deny();
    return Object.freeze({subject:claims.sub,repositoryId,commit,tool,...(sourcePath ? {sourcePath} : {})});
  };
}
