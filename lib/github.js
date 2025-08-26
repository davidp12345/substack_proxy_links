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
  // For https://substack.com/home/post/p-170243747 → substack-com-home-post-p-170243747.html
  const host = u.hostname.replace(/\./g, '-');
  const sanitized = u.pathname.replace(/\//g,'-').replace(/^-+|[^a-zA-Z0-9\-]/g,'');
  return `${host}-${sanitized || 'home'}.html`;
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

