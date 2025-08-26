import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';

export function getApp() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error('Missing GitHub App credentials');
  }

  return new App({
    appId,
    privateKey,
  });
}

export async function getInstallationOctokit(installationId) {
  const app = getApp();
  return await app.getInstallationOctokit(installationId);
}

export async function ensureGhPagesBranch(octokit, owner, repo) {
  try {
    await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
      owner,
      repo,
      branch: 'gh-pages'
    });
  } catch (error) {
    if (error.status === 404) {
      await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner,
        repo,
        ref: 'refs/heads/gh-pages',
        sha: await getEmptyTreeSha(octokit, owner, repo)
      });
    }
  }
}

async function getEmptyTreeSha(octokit, owner, repo) {
  const { data } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
    owner,
    repo,
    tree: []
  });
  return data.sha;
}

export function computeProxyUrl(owner, repo, slug) {
  return `https://${owner}.github.io/${repo}/proxies/${slug}.html`;
}
