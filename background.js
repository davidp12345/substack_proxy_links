// background.js - Service worker for automatic proxy generation

const DEFAULT_PROXY_HOST_BASE = 'https://davidp12345.github.io/substack_proxy_links/proxies';

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'generateProxy') {
    handleProxyGeneration(request.url, sendResponse);
    return true; // Keep the message channel open for async response
  }
  // Accept popup-style message: { type: 'proxy:generate', url }
  if (request && request.type === 'proxy:generate' && request.url) {
    handleProxyGeneration(request.url, (resp) => {
      if (resp && resp.success) {
        sendResponse({ ok: true, pages_url: resp.proxyUrl, fallback_url: resp.proxyUrl, ready: false, slug: resp.filename });
      } else {
        sendResponse({ ok: false, error: resp?.error || 'Proxy generation failed' });
      }
    });
    return true;
  }
});

async function handleProxyGeneration(url, sendResponse) {
  try {
    console.log('🚀 Starting automatic proxy generation for:', url);
    
    // Validate URL
    const urlObj = new URL(url);
    if (!(urlObj.hostname.endsWith('substack.com') || urlObj.hostname === 'substack.com')) {
      throw new Error('Not a Substack URL');
    }
    
    // If Vercel API is configured, prefer it; otherwise fall back to native host
    const { vercelApiBase } = await chrome.storage.sync.get(['vercelApiBase']);
    const apiBase = typeof vercelApiBase === 'string' ? vercelApiBase.trim().replace(/\/$/, '') : '';

    if (apiBase) {
      const viaVercel = await generateViaVercel(url, apiBase);
      if (viaVercel && viaVercel.ok) {
        sendResponse({ ok:true, pages_url: viaVercel.pages_url, fallback_url: viaVercel.fallback_url, ready: viaVercel.ready, slug: viaVercel.slug });
        return;
      }
      console.warn('Vercel generation failed, falling back to native host', viaVercel?.error || viaVercel);
    }

    // Native-host fallback
    const filename = normalizeUrlToFilename(url);
    const htmlContent = generateProxyHtml(url);
    const success = await generateAndDeployProxy(url, filename, htmlContent);
    if (success) {
      const { proxyHostBase } = await chrome.storage.sync.get(['proxyHostBase']);
      const base = (typeof proxyHostBase === 'string' && proxyHostBase.trim().length) ? proxyHostBase.trim() : DEFAULT_PROXY_HOST_BASE;
      const proxyUrl = `${base.replace(/\/$/, '')}/${filename}`;
      console.log('✅ Proxy generated and deployed (native):', proxyUrl);
      sendResponse({ ok:true, pages_url: proxyUrl, fallback_url: proxyUrl, ready:false, slug: filename.replace(/\.html$/, '') });
      return;
    }
    throw new Error('Failed to generate proxy via Vercel or native host');
    
  } catch (error) {
    console.error('❌ Error generating proxy:', error);
    sendResponse({ ok:false, error: error.message });
  }
}

async function generateViaVercel(url, apiBase){
  try{
    const res = await fetch(`${apiBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(()=>({}));
    if (!data || data.ok !== true) {
      return { ok:false, stage: data?.stage, error: data?.error || 'generate failed' };
    }
    // Poll readiness
    let ready = false;
    const maxAttempts = 15;
    for (let i=0;i<maxAttempts;i++){
      try{
        const s = await fetch(`${apiBase}/api/status?pages_url=${encodeURIComponent(data.pages_url)}`);
        const j = await s.json().catch(()=>({}));
        if (j && j.ready) { ready = true; break; }
      }catch{}
      await new Promise(r=>setTimeout(r,2000));
    }
    return { ok:true, pages_url: data.pages_url, fallback_url: data.fallback_url, ready, slug: data.slug };
  }catch(err){
    return { ok:false, stage:'network', error: err.message };
  }
}

function normalizeUrlToFilename(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/\./g, '-');
  const path = u.pathname.replace(/\//g, '-').replace(/^-+|[^a-zA-Z0-9\-]/g, '');
  return `${host}-${path || 'home'}.html`;
}

function generateProxyHtml(originalUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting to Substack...</title>
    <meta http-equiv="refresh" content="0; url=${originalUrl}">
    <link rel="canonical" href="${originalUrl}">
    
    <!-- Open Graph tags for better social sharing -->
    <meta property="og:url" content="${originalUrl}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="Substack Post">
    <meta property="og:description" content="Click to read this Substack post">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:url" content="${originalUrl}">
    <meta name="twitter:title" content="Substack Post">
    <meta name="twitter:description" content="Click to read this Substack post">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f8f9fa;
            color: #333;
        }
        .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 400px;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #ff6719;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        a {
            color: #ff6719;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h2>Redirecting to Substack...</h2>
        <p>If you're not redirected automatically, <a href="${originalUrl}">click here</a>.</p>
    </div>
    
    <script>
        // Fallback redirect in case meta refresh doesn't work
        setTimeout(function() {
            window.location.href = '${originalUrl}';
        }, 100);
    </script>
</body>
</html>`;
}

async function generateAndDeployProxy(url, filename, htmlContent) {
  try {
    // Use native messaging to communicate with the Node.js script
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage('com.substack.proxy', {
        action: 'generateProxy',
        url: url
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (response && response.success) {
      console.log('✅ Native host response:', response);
      return true;
    } else {
      throw new Error(response?.error || 'Native host failed');
    }
  } catch (error) {
    console.error('Error in generateAndDeployProxy:', error);
    
    // Fallback: store the proxy data for manual deployment
    await chrome.storage.local.set({
      [`pending_proxy_${Date.now()}`]: {
        url: url,
        filename: filename,
        htmlContent: htmlContent,
        timestamp: Date.now(),
        error: error.message
      }
    });
    
    // Return false to indicate we need manual deployment
    return false;
  }
}

// Clean up old proxy data periodically
chrome.runtime.onStartup.addListener(() => {
  cleanupOldProxyData();
});

async function cleanupOldProxyData() {
  try {
    const data = await chrome.storage.local.get();
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const keysToRemove = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('pending_proxy_') && value.timestamp < oneWeekAgo) {
        keysToRemove.push(key);
      }
      if (key.startsWith('proxy_') && value.generated < oneWeekAgo) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`🧹 Cleaned up ${keysToRemove.length} old proxy entries`);
    }
  } catch (error) {
    console.error('Error cleaning up proxy data:', error);
  }
}
