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
    // Create a simple hash of the long parts to shorten while maintaining uniqueness
    const longParts = queryPart + hashPart;
    const shortHash = btoa(longParts).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    return `${host}-${baseName}-${shortHash}.html`;
  }
  
  return `${fullName}.html`;
}

function generateProxyHtml(originalUrl) {
  // Escape the URL for safe HTML inclusion
  const safeUrl = String(originalUrl)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting to Substack...</title>
    
    <!-- Primary redirect methods -->
    <meta http-equiv="refresh" content="0; url=${safeUrl}">
    <link rel="canonical" href="${safeUrl}">
    
    <!-- SEO and social media tags -->
    <meta name="robots" content="noindex, nofollow">
    <meta property="og:url" content="${safeUrl}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="Substack Post">
    <meta property="og:description" content="Click to read this Substack post">
    <meta property="og:site_name" content="Substack">
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:url" content="${safeUrl}">
    <meta name="twitter:title" content="Substack Post">
    <meta name="twitter:description" content="Click to read this Substack post">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            color: #333;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            text-align: center;
            padding: 2.5rem;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            max-width: 450px;
            width: 100%;
        }
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #ff6719;
            border-radius: 50%;
            width: 48px;
            height: 48px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1.5rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h2 {
            margin: 0 0 1rem 0;
            color: #ff6719;
            font-size: 1.5rem;
            font-weight: 600;
        }
        p {
            margin: 1rem 0;
            line-height: 1.6;
            color: #666;
        }
        a {
            color: #ff6719;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        a:hover {
            text-decoration: underline;
            color: #e55a15;
        }
        @media (max-width: 480px) {
            .container {
                padding: 1.5rem;
                margin: 10px;
            }
            h2 {
                font-size: 1.3rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h2>Redirecting to Substack...</h2>
        <p>You're being redirected to your Substack post.</p>
        <p>If you're not redirected automatically, <a href="${safeUrl}" id="manual-link">click here</a>.</p>
    </div>
    
    <script>
        // Multiple fallback redirect methods for maximum compatibility
        
        // Immediate redirect attempt
        try {
            window.location.replace('${originalUrl}');
        } catch (e) {
            console.warn('location.replace failed:', e);
        }
        
        // Backup redirect after short delay
        setTimeout(function() {
            try {
                window.location.href = '${originalUrl}';
            } catch (e) {
                console.warn('location.href failed:', e);
                // Final fallback - focus the manual link
                var link = document.getElementById('manual-link');
                if (link) link.focus();
            }
        }, 100);
        
        // Handle cases where JavaScript is disabled but then enabled
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (window.location.href.indexOf('${originalUrl}') === -1) {
                    window.location.href = '${originalUrl}';
                }
            }, 1000);
        });
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
