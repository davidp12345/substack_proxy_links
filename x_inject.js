// x_inject.js - Content script for X (Twitter) integration
// Handles Substack note sharing to X/Twitter

(function() {
  'use strict';

  // Check if this is X/Twitter
  function isTwitter() {
    const hostname = window.location.hostname;
    return hostname === 'x.com' || hostname === 'twitter.com' || hostname === 'www.x.com' || hostname === 'www.twitter.com';
  }

  // Find Twitter/X compose areas
  function findTwitterComposeField() {
    const selectors = [
      '[data-testid="tweetTextarea_0"]', // Main tweet composer
      '[data-testid="tweetTextarea_1"]', // Reply composer
      'div[contenteditable="true"][role="textbox"]', // Generic tweet composer
      '.DraftEditor-editorContainer .public-DraftEditor-content',
      '.tweet-compose .tweet-content',
      'div[data-placeholder*="What is happening"]',
      'div[data-placeholder*="Tweet your reply"]',
      'div[data-placeholder*="Post your reply"]',
      'div[aria-label*="Tweet text"]',
      'div[aria-label*="Post text"]'
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

  // Set content in Twitter/X composer
  function setTwitterContent(field, content) {
    if (!field || !content) return false;
    
    try {
      // Clear existing content
      field.innerHTML = '';
      
      // Set new content as plain text
      field.textContent = content;
      
      // Trigger events to notify React/Twitter's JS
      const inputEvent = new Event('input', { bubbles: true });
      const changeEvent = new Event('change', { bubbles: true });
      
      field.dispatchEvent(inputEvent);
      field.dispatchEvent(changeEvent);
      
      // Focus the field
      field.focus();
      
      // Move cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(field);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      // Trigger additional events for React
      setTimeout(() => {
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        field.dispatchEvent(new Event('focus', { bubbles: true }));
      }, 100);
      
      return true;
    } catch (error) {
      console.error('Error setting Twitter content:', error);
      return false;
    }
  }

  // Create Twitter/X share button for Substack content
  function createTwitterShareButton() {
    const button = document.createElement('button');
    button.id = 'twitter-substack-share';
    button.textContent = '🐦 Share Note to X';
    button.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 10000;
      background: #1d9bf0;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
      display: none;
    `;
    
    button.addEventListener('mouseover', () => {
      button.style.background = '#1a8cd8';
      button.style.transform = 'translateY(-1px)';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.background = '#1d9bf0';
      button.style.transform = 'translateY(0)';
    });
    
    button.addEventListener('click', async () => {
      await shareToTwitter(button);
    });
    
    return button;
  }

  // Share content to Twitter/X
  async function shareToTwitter(button) {
    try {
      // Get pending note content from storage
      const { pendingNoteText } = await chrome.storage.local.get(['pendingNoteText']);
      
      if (!pendingNoteText) {
        showNotification('No note content found. Create a note first.', 'warning');
        return;
      }
      
      const composeField = findTwitterComposeField();
      if (!composeField) {
        showNotification('X composer not found. Try opening the compose modal.', 'warning');
        return;
      }
      
      // Format content for Twitter/X (respect character limit)
      const twitterContent = formatForTwitter(pendingNoteText);
      
      if (setTwitterContent(composeField, twitterContent)) {
        showNotification('Note content added to X composer!', 'success');
        
        // Clear the pending note
        await chrome.storage.local.remove(['pendingNoteText']);
      } else {
        showNotification('Failed to add content to X composer', 'error');
      }
    } catch (error) {
      console.error('Error sharing to Twitter:', error);
      showNotification('Error sharing to X', 'error');
    }
  }

  // Format content for Twitter/X (280 character limit)
  function formatForTwitter(content) {
    const maxLength = 250; // Leave room for hashtags
    const hashtags = ' #Substack #Notes';
    const availableLength = maxLength - hashtags.length;
    
    let formattedContent = content.trim();
    
    // Truncate if too long
    if (formattedContent.length > availableLength) {
      formattedContent = formattedContent.substring(0, availableLength - 3) + '...';
    }
    
    return `${formattedContent}${hashtags}`;
  }

  // Show notification
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#1d9bf0'};
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
      const shareButton = document.getElementById('twitter-substack-share');
      
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
    
    // Check if this is Twitter/X
    if (!isTwitter()) {
      return;
    }
    
    // Remove existing button if any
    const existingButton = document.getElementById('twitter-substack-share');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Create and add the share button
    const button = createTwitterShareButton();
    document.body.appendChild(button);
    
    // Check for pending notes
    checkForPendingNotes();
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.pendingNoteText) {
        checkForPendingNotes();
      }
    });
    
    // Listen for URL changes (Twitter is a SPA)
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