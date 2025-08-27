import { getInstallationOctokit, normalizeFilename, buildHtml, ensureGhPagesBranch, computeProxyUrl, logWriteMeta } from '../lib/github.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    // CORS + preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    if (req.method !== 'POST') { res.status(405).json({ ok:false, stage:'validation', error: 'Method not allowed' }); return; }
    let { url } = req.body || {};
    
    // Clean URL by removing @ prefix if it exists
    if (url && url.startsWith('@')) {
      url = url.substring(1);
    }
    
    if (!url) { res.status(400).json({ ok:false, stage:'validation', error: 'Missing URL', hint:'Pass a full Substack post URL' }); return; }
    
    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (urlError) {
      res.status(400).json({ ok:false, stage:'validation', error: 'Invalid URL format: ' + url, hint:'Pass a valid URL' }); return;
    }
    
    if (!(urlObj.hostname.endsWith('.substack.com') || urlObj.hostname === 'substack.com')) { 
      res.status(400).json({ ok:false, stage:'validation', error: 'Not a Substack URL: ' + urlObj.hostname, hint:'Pass a Substack post URL' }); return; 
    }
    const target = process.env.TARGET_REPO;
    if (!target) { res.status(500).json({ ok:false, stage:'validation', error: 'Missing TARGET_REPO env', hint:'Set TARGET_REPO=owner/repo in Vercel env' }); return; }
    const [owner, repo] = String(target).split('/');
    if (!owner || !repo) { res.status(400).json({ ok:false, stage:'validation', error: 'TARGET_REPO must be owner/repo' }); return; }
    const installation_id = process.env.GITHUB_APP_INSTALLATION_ID;
    if (!installation_id) { res.status(500).json({ ok:false, stage:'auth', error: 'Missing GITHUB_APP_INSTALLATION_ID', hint:'Set installation id in env' }); return; }

    // Get installation token
    let octokit;
    try {
      octokit = await getInstallationOctokit(installation_id);
    } catch (e) {
      res.status(500).json({ ok:false, stage:'auth', error: String(e.message||e), hint:'Check GITHUB_APP_ID/private key and installation id' }); return;
    }

    // Validate repo access
    try { await octokit.request('GET /repos/{owner}/{repo}', { owner, repo }); }
    catch (e) { res.status(403).json({ ok:false, stage:'auth', error:'App does not have access to repo', hint:'Install the app on this repository' }); return; }

    // Ensure gh-pages
    try { await ensureGhPagesBranch(octokit, owner, repo); }
    catch (e) { res.status(500).json({ ok:false, stage:'ensureBranch', error:String(e.message||e), hint:'Ensure default branch exists and app has write access' }); return; }

    // Build file
    const filename = normalizeFilename(url);
    const html = buildHtml(url);
    const checksum = crypto.createHash('sha256').update(html).digest('hex');
    const content = Buffer.from(html, 'utf8').toString('base64');
    const path = `proxies/${filename}`;

    // Try to read to get sha
    let sha = undefined;
    try { const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', { owner, repo, path, ref: 'gh-pages' }); sha = data.sha; } catch {}

    try {
      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner, repo, path,
        message: sha ? `update proxy ${filename}` : `create proxy ${filename}`,
        content, branch: 'gh-pages', sha
      });
    } catch (e) {
      logWriteMeta({ owner, repo, branch:'gh-pages', path, contentSample: html.slice(0,100), error: e?.response?.data || String(e) });
      res.status(500).json({ ok:false, stage:'writeFile', error:String(e.message||e), hint:'Check branch permissions and path format' }); return;
    }

    const pages_url = computeProxyUrl(owner, repo, filename);
    const apiBase = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const fallback_url = apiBase ? `${apiBase}/api/r?u=${encodeURIComponent(url)}` : undefined;
    res.status(200).json({ ok:true, pages_url, fallback_url, slug: filename.replace(/\.html$/,''), wrote:true, ready:false, checksum });
  } catch (e) {
    res.status(500).json({ ok:false, stage:'unknown', error: String(e.message || e) });
  }
}


