#!/usr/bin/env node

/**
 * Substack Proxy Generator
 * 
 * Generates HTML proxy files for Substack posts that can be deployed to GitHub Pages
 * to create shareable links that bypass social media throttling.
 * 
 * Usage: node proxy_tools/generate_proxy.js "https://substack.com/home/post/p-123"
 * 
 * Features:
 * - Handles query parameters and hash fragments properly
 * - Prevents filename collisions
 * - Validates Substack URLs
 * - Creates responsive HTML with fallback redirects
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Robust URL normalization that includes query parameters to prevent collisions
 * @param {string} urlStr - The URL to normalize
 * @returns {string} - Safe filename without extension
 */
function normalizeUrlToFilename(urlStr) {
  const u = new URL(urlStr);
  
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
    // Create a hash of the query and hash parts to shorten while maintaining uniqueness
    const longParts = queryPart + hashPart;
    const shortHash = crypto.createHash('md5').update(longParts).digest('hex').substring(0, 8);
    return `${host}-${baseName}-${shortHash}`;
  }
  
  return fullName;
}

/**
 * Validates if a URL is a valid Substack URL
 * @param {string} urlStr - URL to validate
 * @returns {boolean} - True if valid Substack URL
 */
function isValidSubstackUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com';
  } catch {
    return false;
  }
}

/**
 * Generates HTML proxy content with proper meta tags and fallback redirects
 * @param {string} originalUrl - The original Substack URL to redirect to
 * @returns {string} - Complete HTML content
 */
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
                document.getElementById('manual-link').focus();
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

/**
 * Checks if a proxy file would collide with existing files
 * @param {string} filename - Proposed filename
 * @param {string} proxiesDir - Directory containing proxy files
 * @param {string} currentUrl - URL being processed (to exclude self)
 * @returns {Array} - Array of conflicting URLs, empty if no conflicts
 */
function checkForCollisions(filename, proxiesDir, currentUrl) {
  const filepath = path.join(proxiesDir, filename);
  
  if (!fs.existsSync(filepath)) {
    return []; // No collision
  }
  
  try {
    const existingContent = fs.readFileSync(filepath, 'utf8');
    const urlMatch = existingContent.match(/meta http-equiv="refresh" content="0; url=([^"]+)"/);
    
    if (urlMatch && urlMatch[1] !== currentUrl) {
      return [urlMatch[1]]; // Found conflicting URL
    }
  } catch (e) {
    console.warn(`Warning: Could not read existing file ${filepath}:`, e.message);
  }
  
  return [];
}

/**
 * Main function to generate proxy file
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Error: No URL provided');
    console.error('Usage: node generate_proxy.js <substack-url>');
    console.error('Example: node generate_proxy.js "https://substack.com/home/post/p-171083620"');
    console.error('Example: node generate_proxy.js "https://substack.com/home/post/p-171083620?source=queue"');
    process.exit(1);
  }
  
  const originalUrl = args[0];
  
  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(originalUrl);
  } catch (error) {
    console.error('❌ Error: Invalid URL format provided:', originalUrl);
    console.error('Please provide a complete URL including https://');
    process.exit(1);
  }
  
  // Validate it's a Substack URL
  if (!isValidSubstackUrl(originalUrl)) {
    console.error('❌ Error: URL must be a Substack URL');
    console.error('Expected format: https://substack.com/... or https://[author].substack.com/...');
    console.error('Provided:', originalUrl);
    process.exit(1);
  }
  
  console.log('🔗 Processing URL:', originalUrl);
  
  // Create proxies directory if it doesn't exist
  const proxiesDir = path.join(__dirname, '..', 'proxies');
  if (!fs.existsSync(proxiesDir)) {
    fs.mkdirSync(proxiesDir, { recursive: true });
    console.log('📁 Created proxies directory');
  }
  
  // Generate filename with collision prevention
  const normalizedName = normalizeUrlToFilename(originalUrl);
  const filename = `${normalizedName}.html`;
  const filepath = path.join(proxiesDir, filename);
  
  console.log('📝 Generated filename:', filename);
  
  // Check for potential collisions
  const conflicts = checkForCollisions(filename, proxiesDir, originalUrl);
  if (conflicts.length > 0) {
    console.warn('⚠️  Warning: This filename conflicts with existing proxy for:');
    conflicts.forEach(url => console.warn(`   ${url}`));
    console.warn('   The existing file will be overwritten.');
  }
  
  // Generate HTML content
  const htmlContent = generateProxyHtml(originalUrl);
  
  // Write file
  try {
    fs.writeFileSync(filepath, htmlContent, 'utf8');
    console.log('✅ Proxy created successfully!');
    console.log('📁 Location:', filepath);
    console.log('🔗 Original URL:', originalUrl);
    
    // Show URL breakdown for debugging
    console.log('\n📊 URL Analysis:');
    console.log(`   Hostname: ${parsedUrl.hostname}`);
    console.log(`   Path: ${parsedUrl.pathname}`);
    if (parsedUrl.search) {
      console.log(`   Query: ${parsedUrl.search}`);
    }
    if (parsedUrl.hash) {
      console.log(`   Hash: ${parsedUrl.hash}`);
    }
    
    console.log('\n🚀 Next step: Run "npm run deploy" to publish to GitHub Pages');
    
  } catch (error) {
    console.error('❌ Error writing proxy file:', error.message);
    process.exit(1);
  }
}

// Test function for development
function runTests() {
  console.log('🧪 Running normalization tests...\n');
  
  const testUrls = [
    'https://substack.com/home/post/p-169367889?source=queue',
    'https://substack.com/home/post/p-169367889?source=twitter',
    'https://substack.com/home/post/p-169367889',
    'https://newsletter.substack.com/p/my-post?source=queue',
    'https://substack.com/home/post/p-169367889#section1',
    'https://author.substack.com/p/post-title?ref=twitter&utm_source=share'
  ];
  
  testUrls.forEach(url => {
    const filename = normalizeUrlToFilename(url);
    console.log(`${url} -> ${filename}.html`);
  });
  
  // Check for collisions
  const filenames = testUrls.map(url => normalizeUrlToFilename(url));
  const seen = new Set();
  const duplicates = new Set();
  
  filenames.forEach(filename => {
    if (seen.has(filename)) {
      duplicates.add(filename);
    }
    seen.add(filename);
  });
  
  if (duplicates.size > 0) {
    console.log('\n❌ Collisions detected:');
    duplicates.forEach(dup => console.log(`   ${dup}`));
  } else {
    console.log('\n✅ No collisions detected!');
  }
}

// Export functions for use by other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    normalizeUrlToFilename, 
    generateProxyHtml, 
    isValidSubstackUrl,
    checkForCollisions,
    runTests
  };
}

// Run main function if called directly
if (require.main === module) {
  if (process.argv.includes('--test')) {
    runTests();
  } else {
    main();
  }
}