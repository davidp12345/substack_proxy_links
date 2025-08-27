// linkedin_inject.js - Content script for LinkedIn integration
// Handles Substack note sharing to LinkedIn

(function() {
  'use strict';

  // Check if this is LinkedIn
  function isLinkedIn() {
    return window.location.hostname === 'www.linkedin.com' || window.location.hostname === 'linkedin.com';
  }

  // Find LinkedIn compose areas
  function findLinkedInComposeField() {
    const selectors = [
      '.ql-editor[contenteditable="true"]', // Main post composer
      'div[role="textbox"]', // Comment fields
      '.msg-form__contenteditable', // Message composer
      '.share-creation-state__text-editor .ql-editor',
      '.feed-shared-update-v2__commentary .ql-editor',
      'div[data-placeholder*="Share your thoughts"]',
      'div[data-placeholder*="Add a comment"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.offsetParent !== null && 
            !element.disabled && 
            !element.readOnly &&
            element.getAttribute('aria-hidden') !== 'true') {
          return element;
        }
      }
    }
    
    return null;
  }

  // Set content in LinkedIn composer
  function setLinkedInContent(field, content) {
    if (!field || !content) return false;
    
    try {
      // Clear existing content
      field.innerHTML = '';
      
      // Set new content
      field.innerHTML = `<p>${content.replace(/\n/g, '</p><p>')}</p>`;
      
      // Trigger events
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      
      // Focus the field
      field.focus();
      
      // Move cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(field);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      return true;
    } catch (error) {
      console.error('Error setting LinkedIn content:', error);
      return false;
    }
  }

  // Create LinkedIn share button for Substack content
  function createLinkedInShareButton() {
    const button = document.createElement('button');
    button.id = 'linkedin-substack-share';
    button.textContent = '📝 Share Substack Note';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      background: #0077b5;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
      display: none;
    `;
    
    button.addEventListener('mouseover', () => {
      button.style.background = '#005885';
      button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.background = '#0077b5';
      button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', async () => {
      await shareToLinkedIn(button);
    });
    
    return button;
  }

  // Share content to LinkedIn
  async function shareToLinkedIn(button) {
    try {
      // Get pending note content from storage
      const { pendingNoteText } = await chrome.storage.local.get(['pendingNoteText']);
      
      if (!pendingNoteText) {
        showNotification('No note content found. Create a note first.', 'warning');
        return;
      }
      
      const composeField = findLinkedInComposeField();
      if (!composeField) {
        showNotification('LinkedIn composer not found. Navigate to the feed or messages.', 'warning');
        return;
      }
      
      // Format content for LinkedIn
      const linkedInContent = formatForLinkedIn(pendingNoteText);
      
      if (setLinkedInContent(composeField, linkedInContent)) {
        showNotification('Note content added to LinkedIn composer!', 'success');
        
        // Clear the pending note
        await chrome.storage.local.remove(['pendingNoteText']);
      } else {
        showNotification('Failed to add content to LinkedIn composer', 'error');
      }
    } catch (error) {
      console.error('Error sharing to LinkedIn:', error);
      showNotification('Error sharing to LinkedIn', 'error');
    }
  }

  // Format content for LinkedIn
  function formatForLinkedIn(content) {
    // Add LinkedIn-appropriate formatting
    const formattedContent = content
      .replace(/\n\n/g, '\n\n📍 ')
      .trim();
    
    return `💭 ${formattedContent}\n\n#Substack #Notes #Knowledge`;
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#0077b5'};
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

  // Check for pending notes and show share button
  async function checkForPendingNotes() {
    try {
      const { pendingNoteText } = await chrome.storage.local.get(['pendingNoteText']);
      const shareButton = document.getElementById('linkedin-substack-share');
      
      if (pendingNoteText && shareButton) {
        shareButton.style.display = 'block';
      } else if (shareButton) {
        shareButton.style.display = 'none';
      }
    } catch (error) {
      console.error('Error checking for pending notes:', error);
    }
  }

  // Initialize the content script
  function init() {
    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    // Check if this is LinkedIn
    if (!isLinkedIn()) {
      return;
    }
    
    // Remove existing button if any
    const existingButton = document.getElementById('linkedin-substack-share');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Create and add the share button
    const button = createLinkedInShareButton();
    document.body.appendChild(button);
    
    // Check for pending notes
    checkForPendingNotes();
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.pendingNoteText) {
        checkForPendingNotes();
      }
    });
    
    // Listen for URL changes
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
          checkForPendingNotes();
        }, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Start initialization
  init();
})();