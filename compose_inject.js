// compose_inject.js - Content script for Substack compose/notes page
// Handles auto-filling content from extension storage

(function() {
  'use strict';

  // Check if this is a Substack compose page
  function isComposePage() {
    const url = window.location.href;
    const urlObj = new URL(url);
    
    const isSubstackDomain = urlObj.hostname.endsWith('.substack.com') || urlObj.hostname === 'substack.com';
    const isComposePath = urlObj.pathname.includes('/home') || 
                         urlObj.pathname.includes('/compose') ||
                         urlObj.pathname.includes('/notes') ||
                         urlObj.searchParams.has('action');
    
    return isSubstackDomain && isComposePath;
  }

  // Find the compose textarea/editor
  function findComposeField() {
    // Try multiple selectors for different Substack compose interfaces
    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="compose"]', 
      'textarea[placeholder*="note"]',
      'textarea[name="message"]',
      'textarea[data-testid="compose-textarea"]',
      '.composer textarea',
      '.note-composer textarea',
      'div[contenteditable="true"]',
      '.ProseMirror',
      '.editor',
      'textarea'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) { // Check if visible
        return element;
      }
    }
    
    return null;
  }

  // Set the content in the field
  function setComposeContent(field, content) {
    if (!field || !content) return false;
    
    try {
      if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
        // For textarea/input elements
        field.value = content;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (field.contentEditable === 'true') {
        // For contenteditable elements
        field.textContent = content;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        return false;
      }
      
      // Focus the field
      field.focus();
      
      // Move cursor to end
      if (field.setSelectionRange) {
        field.setSelectionRange(content.length, content.length);
      } else if (field.contentEditable === 'true') {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(field);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      return true;
    } catch (error) {
      console.error('Error setting compose content:', error);
      return false;
    }
  }

  // Handle URL parameters
  function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const messageParam = urlParams.get('message');
    
    if (messageParam) {
      const field = findComposeField();
      if (field) {
        setComposeContent(field, decodeURIComponent(messageParam));
      } else {
        // Retry finding the field
        setTimeout(() => {
          const retryField = findComposeField();
          if (retryField) {
            setComposeContent(retryField, decodeURIComponent(messageParam));
          }
        }, 1000);
      }
    }
  }

  // Handle pending note from extension storage
  async function handlePendingNote() {
    try {
      const { pendingNoteText, pendingNoteTs, pendingNoteToken } = await chrome.storage.local.get([
        'pendingNoteText',
        'pendingNoteTs', 
        'pendingNoteToken'
      ]);
      
      if (pendingNoteText && pendingNoteTs && pendingNoteToken) {
        // Check if the note is recent (within 5 minutes)
        const now = Date.now();
        const noteAge = now - pendingNoteTs;
        if (noteAge < 5 * 60 * 1000) { // 5 minutes
          const field = findComposeField();
          if (field) {
            setComposeContent(field, pendingNoteText);
            
            // Clear the pending note
            await chrome.storage.local.remove([
              'pendingNoteText',
              'pendingNoteTs',
              'pendingNoteToken'
            ]);
            
            // Show confirmation
            showNotification('Note content loaded from extension!', 'success');
          } else {
            // Retry finding the field
            setTimeout(async () => {
              const retryField = findComposeField();
              if (retryField) {
                setComposeContent(retryField, pendingNoteText);
                await chrome.storage.local.remove([
                  'pendingNoteText',
                  'pendingNoteTs',
                  'pendingNoteToken'
                ]);
                showNotification('Note content loaded from extension!', 'success');
              }
            }, 1000);
          }
        } else {
          // Note is too old, clear it
          await chrome.storage.local.remove([
            'pendingNoteText',
            'pendingNoteTs',
            'pendingNoteToken'
          ]);
        }
      }
    } catch (error) {
      console.error('Error handling pending note:', error);
    }
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
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
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  // Initialize the content script
  function init() {
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    // Check if this is a compose page
    if (!isComposePage()) {
      return;
    }
    
    // Handle URL parameters first
    handleUrlParameters();
    
    // Handle pending note from extension
    handlePendingNote();
    
    // Listen for dynamic content changes
    const observer = new MutationObserver(() => {
      // Re-check for pending content when DOM changes
      handleUrlParameters();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Start initialization
  init();
})();