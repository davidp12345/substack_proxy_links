#!/usr/bin/env node

// Native messaging host for proxy generation
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Native messaging protocol
process.stdin.setEncoding('utf-8');

let inputData = '';
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const message = JSON.parse(inputData);
    handleMessage(message);
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
});

function sendResponse(response) {
  const message = JSON.stringify(response);
  const length = Buffer.byteLength(message, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(length, 0);
  
  process.stdout.write(lengthBuffer);
  process.stdout.write(message, 'utf8');
  process.exit(0);
}

async function handleMessage(message) {
  try {
    if (message.action === 'generateProxy') {
      const result = await generateAndDeployProxy(message.url);
      sendResponse(result);
    } else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

function normalizeUrl(url) {
  try {
    // Clean URL by removing @ prefix if it exists
    let cleanUrl = url;
    if (cleanUrl.startsWith('@')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    const urlObj = new URL(cleanUrl);
    let normalized = urlObj.hostname + urlObj.pathname;
    
    // Handle query parameters for unique filenames
    if (urlObj.search) {
      const searchParams = new URLSearchParams(urlObj.search);
      const importantParams = [];
      if (searchParams.get('source')) importantParams.push('source-' + searchParams.get('source'));
      if (searchParams.get('utm_source')) importantParams.push('utm-' + searchParams.get('utm_source'));
      if (importantParams.length > 0) {
        normalized += '?' + importantParams.join('&');
      }
    }
    
    return normalized
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  } catch (error) {
    console.error('Error normalizing URL:', error);
    // Fallback to timestamp-based name
    return 'substack-fallback-' + Date.now();
  }
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

async function generateAndDeployProxy(originalUrl) {
  try {
    // Clean URL by removing @ prefix if it exists
    let cleanUrl = originalUrl;
    if (cleanUrl.startsWith('@')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    // Validate URL
    const urlObj = new URL(cleanUrl);
    if (!(urlObj.hostname.endsWith('.substack.com') || urlObj.hostname === 'substack.com')) {
      throw new Error('Not a Substack URL: ' + urlObj.hostname);
    }
    
    // Find the magic-links-proxy directory
    const magicLinksDir = path.join(__dirname, '..', 'magic-links-proxy');
    const proxiesDir = path.join(magicLinksDir, 'proxies');
    
    // Create proxies directory if it doesn't exist
    if (!fs.existsSync(proxiesDir)) {
      fs.mkdirSync(proxiesDir, { recursive: true });
    }
    
    // Generate filename
    const normalizedName = normalizeUrl(cleanUrl);
    const filename = `${normalizedName}.html`;
    const filepath = path.join(proxiesDir, filename);
    
    // Generate HTML content
    const htmlContent = generateProxyHtml(cleanUrl);
    
    // Write file
    fs.writeFileSync(filepath, htmlContent, 'utf8');
    
    // Deploy to GitHub Pages
    process.chdir(magicLinksDir);
    execSync('npm run deploy', { stdio: 'pipe' });
    
    // Generate the public URL
    const proxyUrl = `https://davidp12345.github.io/substack_proxy_links/proxies/${filename}`;
    
    return {
      success: true,
      proxyUrl: proxyUrl,
      filename: filename,
      originalUrl: cleanUrl,
      message: 'Proxy generated and deployed successfully'
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
