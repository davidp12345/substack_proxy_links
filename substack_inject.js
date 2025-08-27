// substack_inject.js - Content script for Substack posts
// Handles URL detection, proxy generation, and UI injection

(function() {
  'use strict';

  // Check if this is a Substack post
  function isSubstackPost() {
    const url = window.location.href;
    const urlObj = new URL(url);
    
    // Remove @ prefix if it exists
    const cleanUrl = url.replace(/^@/, '');
    const cleanUrlObj = new URL(cleanUrl);
    
    // Check hostname
    const isSubstackDomain = cleanUrlObj.hostname.endsWith('.substack.com') || cleanUrlObj.hostname === 'substack.com';
    
    // Check path patterns
    const path = cleanUrlObj.pathname;
    const isPostPath = /(^|\/)p\//.test(path) || 
                      path.includes('/home/post/') || 
                      path.includes('/posts/') ||
                      path.includes('/p-');
    
    // Check for post content
    const hasPostContent = document.querySelector('h1[class*="post-title"]') || 
                          document.querySelector('h1[class*="title"]') ||
                          document.querySelector('.post-header h1') ||
                          document.querySelector('article h1') ||
                          document.querySelector('.markup p') ||
                          document.querySelector('.post-content p') ||
                          document.querySelector('.pencraft p');
    
    return isSubstackDomain && (isPostPath || hasPostContent);
  }

  // Create proxy button UI
  function createProxyButton() {
    const button = document.createElement('button');
    button.id = 'substack-proxy-btn';
    button.textContent = 'Copy Proxy URL';
    button.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      background: #ff6719;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
    `;
    
    button.addEventListener('mouseover', () => {
      button.style.background = '#e55a1a';
      button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.background = '#ff6719';
      button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', async () => {
      await generateAndCopyProxy(button);
    });
    
    return button;
  }

  // Generate and copy proxy URL
  async function generateAndCopyProxy(button) {
    const originalText = button.textContent;
    button.textContent = 'Generating...';
    button.disabled = true;
    
    try {
      // Clean the URL by removing @ prefix
      let currentUrl = window.location.href;
      if (currentUrl.startsWith('@')) {
        currentUrl = currentUrl.substring(1);
      }
      
      // Validate URL
      const urlObj = new URL(currentUrl);
      if (!(urlObj.hostname.endsWith('.substack.com') || urlObj.hostname === 'substack.com')) {
        throw new Error('Not a Substack URL');
      }
      
      // Send message to background script
      const response = await chrome.runtime.sendMessage({
        type: 'proxy:generate',
        url: currentUrl
      });
      
      if (response && response.ok) {
        // Try to copy the best available URL
        const urlToCopy = response.pages_url || response.fallback_url || currentUrl;
        await navigator.clipboard.writeText(urlToCopy);
        
        button.textContent = 'Copied! ✓';
        button.style.background = '#28a745';
        
        // Show notification
        showNotification('Proxy URL copied to clipboard!', 'success');
        
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '#ff6719';
          button.disabled = false;
        }, 2000);
      } else {
        throw new Error(response?.error || 'Proxy generation failed');
      }
    } catch (error) {
      console.error('Error generating proxy:', error);
      
      // Fallback: copy original URL
      try {
        await navigator.clipboard.writeText(currentUrl);
        button.textContent = 'Original URL copied';
        showNotification('Failed to generate proxy. Original URL copied.', 'warning');
      } catch (clipboardError) {
        button.textContent = 'Failed';
        showNotification('Proxy generation failed', 'error');
      }
      
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 3000);
    }
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      z-index: 10001;
      background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#007bff'};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      max-width: 300px;
      word-wrap: break-word;
      animation: slideIn 0.3s ease;
    `;
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 300);
    }, 3000);
  }

  // Initialize the content script
  function init() {
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    // Check if this is a Substack post
    if (!isSubstackPost()) {
      return;
    }
    
    // Remove existing button if any
    const existingButton = document.getElementById('substack-proxy-btn');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Create and add the proxy button
    const button = createProxyButton();
    document.body.appendChild(button);
    
    // Listen for URL changes (for SPAs)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        // Re-initialize after URL change
        setTimeout(init, 100);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Start initialization
  init();
})();