// background.js - Service worker for automatic proxy generation
// Fixed version that works without native messaging dependencies

const DEFAULT_PROXY_HOST_BASE = 'https://davidp12345.github.io/substack_proxy_links/proxies';

// Enhanced URL normalization that handles query parameters properly
function normalizeUrlToFilename(url) {
  try {
    const u = new URL(url);
    
    // Get hostname and replace dots with dashes
    const host = u.hostname.replace(/\./g, '-');
    
    // Process pathname: replace slashes with dashes, remove leading dashes and unsafe chars
    let pathPart = u.pathname
      .replace(/\/+/g, '/')        // Normalize multiple slashes
      .replace(/\/$/, '')          // Remove trailing slash
      .replace(/\//g, '-')         // Replace slashes with dashes
      .replace(/^-+/, '')          // Remove leading dashes
      .replace(/[^a-zA-Z0-9\-]/g, ''); // Remove unsafe characters
    
    // Handle special cases where path variations should be treated the same
    if (pathPart === '' || pathPart === 'home') {
      pathPart = 'home';
    }
    
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
  } catch (error) {
    console.error('Error normalizing URL:', error);
    // Fallback to a safe filename
    return `proxy-${Date.now()}.html`;
  }
}

// Enhanced URL validation
function validateSubstackUrl(urlStr) {
  try {
    // Clean the URL first (remove potential @ prefix or other artifacts)
    const cleanUrl = urlStr.trim().replace(/^@+/, '');
    
    const u = new URL(cleanUrl);
    
    // Must be HTTPS and Substack domain
    if (u.protocol !== 'https:') {
      return { isValid: false, error: 'Must use HTTPS protocol', cleanUrl };
    }
    
    if (!(u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com')) {
      return { isValid: false, error: 'Not a Substack domain', cleanUrl };
    }
    
    return { isValid: true, cleanUrl, url: u };
  } catch (error) {
    return { isValid: false, error: `Invalid URL: ${error.message}`, cleanUrl: urlStr };
  }
}

// Generate enhanced proxy HTML with multiple fallback methods
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
        .url-display {
            background: #f8f9fa;
            padding: 0.75rem;
            border-radius: 6px;
            margin: 1rem 0;
            word-break: break-all;
            font-size: 0.9rem;
            color: #666;
            border-left: 3px solid #ff6719;
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
        <div class="url-display">${safeUrl}</div>
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

// Self-contained proxy generation using Vercel API or fallback URL
async function generateProxyViaVercel(url, apiBase) {
  try {
    const response = await fetch(`${apiBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Vercel API error:', error);
    return { ok: false, error: error.message };
  }
}

// Enhanced message handling with proper error handling and response structure
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request);
  
  // Handle legacy format
  if (request && request.action === 'generateProxy') {
    handleProxyGeneration(request.url, sendResponse);
    return true;
  }
  
  // Handle popup format: { type: 'proxy:generate', url }
  if (request && request.type === 'proxy:generate' && request.url) {
    handleProxyGeneration(request.url, sendResponse);
    return true;
  }
  
  return false; // Let other handlers process the message
});

async function handleProxyGeneration(rawUrl, sendResponse) {
  try {
    console.log('🚀 Starting proxy generation for:', rawUrl);
    
    // Enhanced URL validation and cleaning
    const validation = validateSubstackUrl(rawUrl);
    if (!validation.isValid) {
      console.error('❌ URL validation failed:', validation.error);
      sendResponse({ 
        ok: false, 
        error: validation.error,
        stage: 'validation'
      });
      return;
    }
    
    const cleanUrl = validation.cleanUrl;
    const urlObj = validation.url;
    
    console.log('✅ URL validated:', cleanUrl);
    
    // Try Vercel API first if configured
    const { vercelApiBase } = await chrome.storage.sync.get(['vercelApiBase']);
    const apiBase = typeof vercelApiBase === 'string' ? vercelApiBase.trim().replace(/\/$/, '') : '';
    
    if (apiBase) {
      console.log('🔄 Trying Vercel API...');
      const vercelResult = await generateProxyViaVercel(cleanUrl, apiBase);
      
      if (vercelResult && vercelResult.ok) {
        console.log('✅ Vercel API succeeded');
        sendResponse({
          ok: true,
          pages_url: vercelResult.pages_url,
          fallback_url: vercelResult.fallback_url,
          ready: vercelResult.ready || false,
          slug: vercelResult.slug,
          stage: 'vercel'
        });
        return;
      } else {
        console.warn('⚠️ Vercel API failed:', vercelResult?.error);
      }
    }
    
    // Self-contained fallback - generate immediate redirect URL
    console.log('🔄 Using fallback redirect method...');
    
    const filename = normalizeUrlToFilename(cleanUrl);
    const { proxyHostBase } = await chrome.storage.sync.get(['proxyHostBase']);
    const base = (typeof proxyHostBase === 'string' && proxyHostBase.trim().length) 
      ? proxyHostBase.trim() 
      : DEFAULT_PROXY_HOST_BASE;
    
    // Create a simple redirect URL as immediate fallback
    const redirectUrl = `data:text/html;charset=utf-8,${encodeURIComponent(generateProxyHtml(cleanUrl))}`;
    const futureProxyUrl = `${base.replace(/\/$/, '')}/${filename}`;
    
    // Store the proxy data for potential manual deployment
    const proxyData = {
      url: cleanUrl,
      filename: filename,
      htmlContent: generateProxyHtml(cleanUrl),
      timestamp: Date.now(),
      created: new Date().toISOString()
    };
    
    await chrome.storage.local.set({
      [`proxy_${filename.replace('.html', '')}`]: proxyData
    });
    
    console.log('✅ Fallback proxy generated');
    
    // Return immediate usable redirect URL
    sendResponse({
      ok: true,
      pages_url: futureProxyUrl,
      fallback_url: redirectUrl,
      ready: false, // The Pages URL needs manual deployment
      slug: filename.replace(/\.html$/, ''),
      stage: 'fallback',
      message: 'Redirect URL ready immediately. Deploy manually for permanent link.'
    });
    
  } catch (error) {
    console.error('❌ Error in handleProxyGeneration:', error);
    sendResponse({
      ok: false,
      error: `Proxy generation failed: ${error.message}`,
      stage: 'error'
    });
  }
}

// Cleanup old proxy data periodically
chrome.runtime.onStartup.addListener(() => {
  cleanupOldProxyData();
});

async function cleanupOldProxyData() {
  try {
    const data = await chrome.storage.local.get();
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    const toDelete = Object.keys(data).filter(key => {
      if (key.startsWith('proxy_') || key.startsWith('pending_proxy_')) {
        const item = data[key];
        return item && item.timestamp && item.timestamp < cutoff;
      }
      return false;
    });
    
    if (toDelete.length > 0) {
      await chrome.storage.local.remove(toDelete);
      console.log(`🧹 Cleaned up ${toDelete.length} old proxy entries`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Export list of stored proxies for manual deployment
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'list:proxies') {
    listStoredProxies().then(sendResponse);
    return true;
  }
});

async function listStoredProxies() {
  try {
    const data = await chrome.storage.local.get();
    const proxies = Object.keys(data)
      .filter(key => key.startsWith('proxy_'))
      .map(key => ({
        key,
        ...data[key],
        age: Date.now() - (data[key].timestamp || 0)
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
    
    return { ok: true, proxies };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}