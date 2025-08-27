import { App } from '@octokit/app';

export function getApp() {
  const appId = process.env.GITHUB_APP_ID;
  // Support newline-escaped private keys from env
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!appId || !privateKey) {
    throw new Error('Missing GitHub App credentials');
  }

  return new App({ appId, privateKey });
}

export async function getInstallationOctokit(installationId) {
  const app = getApp();
  return await app.getInstallationOctokit(Number(installationId));
}

export function normalizeFilename(urlStr) {
  try {
    // Clean URL by removing @ prefix if it exists
    let cleanUrl = urlStr;
    if (cleanUrl.startsWith('@')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    const u = new URL(cleanUrl);
    const hostPart = u.hostname.replace(/\./g, '-');
    
    // Replace slashes with dashes, drop leading dashes, and remove unsafe chars
    let pathPart = u.pathname
      .replace(/\/+/g, '/')
      .replace(/\//g, '-')
      .replace(/^-+/, '')
      .replace(/[^a-zA-Z0-9\-]/g, '');
    
    // Handle query parameters for unique filenames
    if (u.search) {
      const searchParams = new URLSearchParams(u.search);
      const importantParams = [];
      // Include important parameters that make URLs unique
      if (searchParams.get('source')) importantParams.push('source-' + searchParams.get('source'));
      if (searchParams.get('utm_source')) importantParams.push('utm-' + searchParams.get('utm_source'));
      if (searchParams.get('p')) importantParams.push('p-' + searchParams.get('p'));
      if (importantParams.length > 0) {
        pathPart += '-' + importantParams.join('-');
      }
    }
    
    const base = pathPart || 'home';
    return `${hostPart}-${base}.html`;
  } catch (error) {
    console.error('Error normalizing filename:', error);
    // Fallback to a safe filename
    const timestamp = Date.now();
    return `substack-com-fallback-${timestamp}.html`;
  }
}

export function buildHtml(targetUrl) {
  // Clean URL by removing @ prefix if it exists
  let cleanUrl = targetUrl;
  if (cleanUrl.startsWith('@')) {
    cleanUrl = cleanUrl.substring(1);
  }
  
  const safe = String(cleanUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Redirecting…</title><meta http-equiv="refresh" content="0; url=${safe}"><link rel="canonical" href="${safe}"><meta property="og:url" content="${safe}"><meta name="robots" content="noindex"><script>window.location.replace('${safe}')</script></head><body></body></html>`;
}

export async function ensureGhPagesBranch(octokit, owner, repo) {
  try {
    await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', { owner, repo, branch: 'gh-pages' });
    return;
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  // Create branch from default branch head commit
  const { data: repoData } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo });
  const defaultBranch = repoData.default_branch;
  const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', { owner, repo, ref: `heads/${defaultBranch}` });
  const sha = ref.object.sha;
  await octokit.request('POST /repos/{owner}/{repo}/git/refs', { owner, repo, ref: 'refs/heads/gh-pages', sha });
}

export function computeProxyUrl(owner, repo, filename) {
  return `https://${owner}.github.io/${repo}/proxies/${filename}`;
}

export function logWriteMeta({ owner, repo, branch = 'gh-pages', path, contentSample, error }) {
  const meta = { owner, repo, branch, path };
  if (contentSample) meta.contentSample = contentSample;
  if (error) meta.error = error;
  // eslint-disable-next-line no-console
  console.error('[proxy-publisher] writeFile', JSON.stringify(meta));
}
