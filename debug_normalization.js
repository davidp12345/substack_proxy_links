#!/usr/bin/env node

// Test current normalization functions with problematic URLs
console.log('=== TESTING CURRENT NORMALIZATION BEHAVIOR ===\n');

// Test URLs with different query parameters
const testUrls = [
  'https://substack.com/home/post/p-169367889?source=queue',
  'https://substack.com/home/post/p-169367889?source=twitter', 
  'https://substack.com/home/post/p-169367889?utm_campaign=newsletter',
  'https://substack.com/home/post/p-169367889',
  'https://newsletter.substack.com/p/my-post?source=queue',
  'https://substack.com/home/post/p-169367889#section1',
  'https://substack.com/home/post/p-169367889?source=queue#section1',
  'https://author.substack.com/p/post-title?ref=twitter&utm_source=share'
];

// Test background.js normalizeUrlToFilename function
function normalizeUrlToFilename(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/\./g, '-');
  const path = u.pathname.replace(/\//g, '-').replace(/^-+|[^a-zA-Z0-9\-]/g, '');
  return `${host}-${path || 'home'}.html`;
}

// Test services/proxy-publisher/lib/github.js normalizeFilename function  
function normalizeFilename(urlStr) {
  const u = new URL(urlStr);
  const host = u.hostname.replace(/\./g, '-');
  const sanitized = u.pathname.replace(/\//g,'-').replace(/^-+|[^a-zA-Z0-9\-]/g,'');
  return `${host}-${sanitized || 'home'}.html`;
}

// Test lib/github.js normalizeFilename function (enhanced version)
function normalizeFilenameEnhanced(urlStr) {
  const u = new URL(urlStr);
  const hostPart = u.hostname.replace(/\./g, '-');
  const pathPart = u.pathname
    .replace(/\/+/g, '/')
    .replace(/\//g, '-')
    .replace(/^-+/, '')
    .replace(/[^a-zA-Z0-9\-]/g, '');
  const base = pathPart || 'home';
  return `${hostPart}-${base}.html`;
}

console.log('Testing normalizeUrlToFilename (background.js):');
testUrls.forEach(url => {
  console.log(`  ${url}`);
  console.log(`  -> ${normalizeUrlToFilename(url)}`);
  console.log();
});

console.log('\nTesting normalizeFilename (services/proxy-publisher):');
testUrls.forEach(url => {
  console.log(`  ${url}`);
  console.log(`  -> ${normalizeFilename(url)}`);
  console.log();
});

console.log('\nTesting normalizeFilenameEnhanced (lib/github.js):');
testUrls.forEach(url => {
  console.log(`  ${url}`);
  console.log(`  -> ${normalizeFilenameEnhanced(url)}`);
  console.log();
});

// Show collisions
console.log('\n=== COLLISION ANALYSIS ===');
const collisions = new Map();
testUrls.forEach(url => {
  const filename = normalizeUrlToFilename(url);
  if (!collisions.has(filename)) {
    collisions.set(filename, []);
  }
  collisions.get(filename).push(url);
});

console.log('Collisions found:');
let hasCollisions = false;
collisions.forEach((urls, filename) => {
  if (urls.length > 1) {
    hasCollisions = true;
    console.log(`🚨 COLLISION: ${filename}`);
    urls.forEach(url => console.log(`   ${url}`));
    console.log();
  }
});

if (!hasCollisions) {
  console.log('✅ No collisions detected (unexpected!)');
} else {
  console.log(`❌ Found ${Array.from(collisions.values()).filter(urls => urls.length > 1).length} collision groups`);
}

// Test URL component extraction
console.log('\n=== URL COMPONENT ANALYSIS ===');
const testUrl = 'https://substack.com/home/post/p-169367889?source=queue#section1';
const parsed = new URL(testUrl);
console.log(`Test URL: ${testUrl}`);
console.log(`  hostname: "${parsed.hostname}"`);
console.log(`  pathname: "${parsed.pathname}"`);
console.log(`  search: "${parsed.search}"`);
console.log(`  hash: "${parsed.hash}"`);
console.log(`  searchParams:`, Object.fromEntries(parsed.searchParams));