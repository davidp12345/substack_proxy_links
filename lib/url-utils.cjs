/**
 * Shared URL utility functions for the Substack proxy system
 * 
 * This module provides consistent URL handling across all components
 * of the proxy generation system, ensuring proper handling of query
 * parameters, hash fragments, and collision prevention.
 */

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
    // Create a hash of the query and hash parts to shorten while maintaining uniqueness
    const longParts = queryPart + hashPart;
    const shortHash = crypto.createHash('md5').update(longParts).digest('hex').substring(0, 8);
    return `${host}-${baseName}-${shortHash}`;
  }
  
  return fullName;
}

/**
 * Legacy normalization function for backwards compatibility
 * This is the old function that ignores query parameters - kept for comparison
 * @param {string} urlStr - The URL to normalize
 * @returns {string} - Safe filename without extension (legacy behavior)
 * @deprecated Use normalizeUrlToFilename instead
 */
function normalizeUrlToFilenameLegacy(urlStr) {
  const u = new URL(urlStr);
  const host = u.hostname.replace(/\./g, '-');
  const sanitized = u.pathname.replace(/\//g,'-').replace(/^-+|[^a-zA-Z0-9\-]/g,'');
  return `${host}-${sanitized || 'home'}`;
}

/**
 * Validates if a URL is a valid Substack URL
 * @param {string} urlStr - URL to validate
 * @returns {boolean} - True if valid Substack URL
 */
function isValidSubstackUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return (u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com') && u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Enhanced Substack URL validation with regex pattern matching
 * @param {string} urlStr - URL to validate
 * @returns {boolean} - True if valid Substack URL
 */
function isValidSubstackUrlRegex(urlStr) {
  try {
    // Only allow HTTPS for security
    return /^https:\/\/([\w.-]+\.)?substack\.com\//i.test(urlStr);
  } catch {
    return false;
  }
}

/**
 * Comprehensive Substack URL validation combining multiple methods
 * @param {string} urlStr - URL to validate
 * @returns {object} - Validation result with details
 */
function validateSubstackUrl(urlStr) {
  const result = {
    isValid: false,
    url: null,
    hostname: null,
    pathname: null,
    search: null,
    hash: null,
    errors: []
  };

  // Check if URL is provided
  if (!urlStr || typeof urlStr !== 'string') {
    result.errors.push('URL is required and must be a string');
    return result;
  }

  // Try to parse URL
  try {
    result.url = new URL(urlStr);
    result.hostname = result.url.hostname;
    result.pathname = result.url.pathname;
    result.search = result.url.search;
    result.hash = result.url.hash;
  } catch (error) {
    result.errors.push(`Invalid URL format: ${error.message}`);
    return result;
  }

  // Check if it's a Substack domain
  const isSubstackDomain = result.hostname.endsWith('.substack.com') || result.hostname === 'substack.com';
  if (!isSubstackDomain) {
    result.errors.push(`Not a Substack domain: ${result.hostname}`);
    return result;
  }

  // Check if it's HTTPS (required for security)
  if (result.url.protocol !== 'https:') {
    result.errors.push(`Must use HTTPS protocol, not ${result.url.protocol}`);
    return result;
  }

  // Check URL pattern with regex
  if (!isValidSubstackUrlRegex(urlStr)) {
    result.errors.push('URL does not match expected Substack pattern');
    return result;
  }

  // Additional validation for common post patterns
  const hasPostPath = result.pathname.includes('/p/') || 
                     result.pathname.includes('/home/post/') ||
                     result.pathname.includes('/posts/');

  if (!hasPostPath && result.pathname !== '/' && !result.pathname.includes('/subscribe')) {
    result.errors.push(`Unusual Substack URL path: ${result.pathname}`);
    // Don't return here - this is just a warning
  }

  result.isValid = result.errors.length === 0;
  return result;
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

/**
 * Creates a hash-based identifier for collision detection
 * @param {string} content - Content to hash
 * @returns {string} - Short hash string
 */
function createContentHash(content) {
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
}

/**
 * Analyzes URL components for debugging
 * @param {string} urlStr - URL to analyze
 * @returns {object} - URL analysis object
 */
function analyzeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return {
      original: urlStr,
      hostname: u.hostname,
      pathname: u.pathname,
      search: u.search,
      searchParams: Object.fromEntries(u.searchParams),
      hash: u.hash,
      filename: normalizeUrlToFilename(urlStr) + '.html',
      legacyFilename: normalizeUrlToFilenameLegacy(urlStr) + '.html'
    };
  } catch (error) {
    return {
      original: urlStr,
      error: error.message
    };
  }
}

// Export functions based on environment
if (typeof module !== 'undefined' && module.exports) {
  // CommonJS exports
  module.exports = {
    normalizeUrlToFilename,
    normalizeUrlToFilenameLegacy,
    isValidSubstackUrl,
    isValidSubstackUrlRegex,
    validateSubstackUrl,
    generateProxyHtml,
    createContentHash,
    analyzeUrl
  };
} else if (typeof window !== 'undefined') {
  // Browser globals
  window.SubstackUrlUtils = {
    normalizeUrlToFilename,
    normalizeUrlToFilenameLegacy,
    isValidSubstackUrl,
    isValidSubstackUrlRegex,
    validateSubstackUrl,
    generateProxyHtml,
    createContentHash,
    analyzeUrl
  };
}