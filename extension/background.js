const API_BASE = "<YOUR_VERCEL_URL>";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'generate-proxy', title: 'Generate Substack Proxy', contexts: ['page'], documentUrlPatterns: ["*://*.substack.com/*", "https://substack.com/*"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'generate-proxy') return;
  if (!tab?.url) return;
  const url = tab.url;
  if (!/substack\.com\//i.test(url)) { notify('Not a Substack URL'); return; }
  generateAndCopy(url);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'proxy:generate' && msg?.url) {
      try {
        const res = await generate(msg.url);
        if (res?.pages_url) await copyToClipboard(res.pages_url);
        notify(res?.pages_url ? 'Proxy URL copied' : 'Proxy generated (fallback)');
        sendResponse({ ok: true, ...res });
      } catch (e) {
        notify(`Error: ${e.message}`);
        sendResponse({ ok: false, error: String(e.message || e) });
      }
      return;
    }
  })();
  return true; // async
});

async function generateAndCopy(url){
  try{
    const res = await generate(url);
    if (!res?.pages_url) { notify('Generated. Waiting for Pages...'); return; }
    // Poll readiness up to ~30s
    notify('Generating proxy…');
    const ready = await waitUntilReady(res.pages_url, 30_000, 1500);
    const toCopy = ready ? res.pages_url : (res.fallback_url || res.pages_url);
    await copyToClipboard(toCopy);
    notify(ready ? 'Proxy URL copied' : 'Proxy not live yet — fallback copied');
  }catch(e){ notify(`Error: ${e.message}`); }
}

async function generate(url){
  try{
    const { vercelApiBase } = await chrome.storage.sync.get(['vercelApiBase']);
    const base = (typeof vercelApiBase === 'string' && vercelApiBase.trim()) ? vercelApiBase.trim().replace(/\/$/, '') : API_BASE.replace(/\/$/, '');
    if (!base || base.includes('<YOUR_VERCEL_URL>')) throw new Error('Missing Vercel API base. Set chrome.storage.sync.vercelApiBase');

    const response = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const data = await response.json();
    if (!data.ok) {
      return { ok:false, stage: data.stage, error: data.error, hint: data.hint };
    }
    // poll readiness
    let ready = false;
    const maxAttempts = 15;
    for (let i=0;i<maxAttempts;i++){
      await new Promise(r=>setTimeout(r,2000));
      try{
        const s = await fetch(`${base}/api/status?pages_url=${encodeURIComponent(data.pages_url)}`);
        const j = await s.json();
        if (j?.ready){ ready = true; break; }
      }catch{}
    }
    return { ok:true, pages_url: data.pages_url, fallback_url: data.fallback_url, ready, slug: data.slug };
  }catch(err){
    return { ok:false, stage:'network', error: err.message, hint:'Check API_BASE and server availability' };
  }
}

async function waitUntilReady(pagesUrl, timeoutMs=30000, intervalMs=1500){
  const end = Date.now()+timeoutMs;
  while(Date.now() < end){
    try{
      const r = await fetch(`${API_BASE}/api/status?pages_url=${encodeURIComponent(pagesUrl)}`);
      const j = await r.json();
      if (j?.ready) return true;
    }catch{}
    await new Promise(r=>setTimeout(r, intervalMs));
  }
  return false;
}

async function copyToClipboard(text){
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = new Blob([text], {type:'text/plain'});
  }
}

function notify(message){
  chrome.notifications?.create?.({ type: 'basic', iconUrl: 'icon128.png', title: 'Proxy Publisher', message });
}


