#!/usr/bin/env node
// generate_proxy.js
// Usage: node proxy_tools/generate_proxy.js "https://substack.com/home/post/p-123"
// With Cline: Create a task to run this script for a given URL, then run `npm run deploy`.

const fs = require('fs');
const path = require('path');

function normalizeFilename(u){
  const host = u.hostname.replace(/\./g,'-');
  const p = u.pathname.replace(/\//g,'-').replace(/^-+|[^a-zA-Z0-9\-]/g,'');
  return `${host}-${p || 'home'}.html`;
}

function buildHtml(target){
  const safe = String(target)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  return `<!doctype html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url='${safe}'\"><link rel=\"canonical\" href=\"${safe}\"><title>Redirecting…</title><meta property=\"og:url\" content=\"${safe}\"><meta name=\"robots\" content=\"noindex\"></head><body><p>Redirecting to <a href=\"${safe}\">${safe}</a></p></body></html>`;
}

function main(){
  const raw = process.argv[2];
  if(!raw){ console.error('Provide a Substack URL'); process.exit(1); }
  let u; try{ u = new URL(raw); }catch{ console.error('Invalid URL'); process.exit(1); }
  if (!(u.hostname.endsWith('substack.com') || u.hostname === 'substack.com')){
    console.error('URL must be a Substack URL'); process.exit(1);
  }
  const outDir = path.resolve(process.cwd(), 'proxies');
  fs.mkdirSync(outDir, { recursive: true });
  const fname = normalizeFilename(u);
  const html = buildHtml(u.toString());
  const outPath = path.join(outDir, fname);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(outPath);
}

main();


