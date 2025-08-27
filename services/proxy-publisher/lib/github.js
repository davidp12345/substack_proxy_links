import { App } from '@octokit/app';
import { Octokit } from 'octokit';

export function getApp() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !privateKey) throw new Error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY');
  return new App({ appId, privateKey });
}

export async function getInstallationOctokit(installationId) {
  const app = getApp();
  // Use the @octokit/app helper that returns an authenticated Octokit for the installation
  const octokit = await app.getInstallationOctokit(Number(installationId));
  return octokit;
}

export function normalizeFilename(urlStr) {
  const u = new URL(urlStr);
  
  // Get hostname and replace dots with dashes  
  const host = u.hostname.replace(/\./g, '-');
  
  // Process pathname: replace slashes with dashes, remove leading dashes and unsafe chars
  const pathPart = u.pathname
    .replace(/\/+/g, '/')        // Normalize multiple slashes
    .replace(/\//g, '-')         // Replace slashes with dashes
    .replace(/^-+/, '')          // Remove leading dashes
    .replace(/[^a-zA-Z0-9\-]/g, ''); // Remove unsafe characters
  
  // Process query parameters if they exist
  let queryPart = '';
  if (u.search && u.searchParams.size > 0) {
    // Create a sorted list of key-value pairs for consistency
    const params = Array.from(u.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b)) // Sort by key for deterministic output
      .map(([key, value]) => `${key}-${value}`)
      .join('-');
    
    if (params) {
      queryPart = `-${params.replace(/[^a-zA-Z0-9\-]/g, '')}`; // Sanitize
    }
  }
  
  // Process hash fragment if it exists
  let hashPart = '';
  if (u.hash && u.hash.length > 1) { // u.hash includes the '#'
    hashPart = `-${u.hash.slice(1).replace(/[^a-zA-Z0-9\-]/g, '')}`;
  }
  
  // Combine all parts
  const baseName = pathPart || 'home';
  const fullName = `${host}-${baseName}${queryPart}${hashPart}`;
  
  // Ensure filename isn't too long (filesystem limits)
  if (fullName.length > 200) {
    // Create a hash of the query and hash parts to shorten while maintaining uniqueness
    const crypto = await import('crypto');
    const longParts = queryPart + hashPart;
    const shortHash = crypto.createHash('md5').update(longParts).digest('hex').substring(0, 8);
    return `${host}-${baseName}-${shortHash}.html`;
  }
  
  return `${fullName}.html`;
}

export function buildHtml(target) {
  const safe = String(target)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url='${safe}'"><script>location.replace('${safe}')</script><link rel="canonical" href="${safe}"><title>Redirecting…</title><meta property="og:url" content="${safe}"><meta name="robots" content="noindex"></head><body></body></html>`;
}

export async function ensureGhPagesBranch(octokit, owner, repo) {
  try {
    await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', { owner, repo, branch: 'gh-pages' });
    return;
  } catch (e) {
    // create branch from default branch
    const { data: repoData } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo });
    const defaultBranch = repoData.default_branch;
    const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', { owner, repo, ref: `heads/${defaultBranch}` });
    const sha = ref.object.sha;
    await octokit.request('POST /repos/{owner}/{repo}/git/refs', { owner, repo, ref: 'refs/heads/gh-pages', sha });
  }
}

export function computeProxyUrl(owner, repo, filename) {
  return `https://${owner}.github.io/${repo}/proxies/${filename}`;
}

export function logWriteMeta({ owner, repo, branch='gh-pages', path, contentSample, error }){
  const meta = { owner, repo, branch, path };
  if (contentSample) meta.contentSample = contentSample;
  if (error) meta.error = error;
  // eslint-disable-next-line no-console
  console.error('[proxy-publisher] writeFile', JSON.stringify(meta));
}

