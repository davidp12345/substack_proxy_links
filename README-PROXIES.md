# Substack Magic Links Proxy System

This system creates "magic links" for Substack posts that can be shared on social media platforms like X (Twitter) without being blocked or throttled.

## How It Works

1. **Generate Proxy**: Creates an HTML file that redirects to your Substack post
2. **Deploy to GitHub Pages**: Publishes the proxy files to a public URL
3. **Share Magic Link**: Use the GitHub Pages URL instead of the direct Substack link

## Quick Start

### One-Time Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up GitHub repository** (if not already done):
   ```bash
   git add .
   git commit -m "Add proxy system"
   git push origin main
   ```

3. **Enable GitHub Pages**:
   - Go to your GitHub repo → Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: `gh-pages`
   - Folder: `/ (root)`

### Generate and Deploy a Proxy

1. **Generate proxy for a Substack post**:
   ```bash
   node proxy_tools/generate_proxy.js "https://substack.com/home/post/p-171083620"
   ```

2. **Deploy to GitHub Pages**:
   ```bash
   npm run deploy
   ```

3. **Your magic link will be**:
   ```
   https://yourusername.github.io/your-repo-name/substack-com-home-post-p-171083620.html
   ```

## Browser Extension Integration

If you have the browser extension:

1. **Set your base URL** (one time):
   - Right-click extension → Inspect → Console
   - Run: `chrome.storage.sync.set({ proxyHostBase: 'https://yourusername.github.io/your-repo-name' })`

2. **Copy proxy URLs**:
   - Paste Substack URL in extension
   - Click "Copy Proxy URL"
   - Share the copied URL

## File Structure

```
├── proxy_tools/
│   └── generate_proxy.js     # Generates HTML proxy files
├── proxies/                  # Generated proxy files (auto-created)
│   └── *.html               # Individual proxy files
├── package.json             # Dependencies and deploy script
└── README-PROXIES.md        # This file
```

## Features

- **Instant redirect**: Meta refresh + JavaScript fallback
- **Social media optimized**: Open Graph and Twitter Card tags
- **Clean URLs**: Normalized filenames from original URLs
- **Responsive design**: Works on all devices
- **Substack branding**: Uses Substack orange color (#ff6719)

## Troubleshooting

- **404 on proxy URL**: Make sure you ran both `generate_proxy.js` and `npm run deploy`
- **Wrong base URL**: Re-run the `chrome.storage.sync.set()` command with correct URL
- **GitHub Pages not working**: Check repo Settings → Pages is set to `gh-pages` branch

## Examples

```bash
# Generate proxy for different Substack URLs
node proxy_tools/generate_proxy.js "https://newsletter.substack.com/p/my-post"
node proxy_tools/generate_proxy.js "https://author.substack.com/p/another-post"

# Deploy all proxies
npm run deploy
```

The generated filenames will be:
- `newsletter-substack-com-p-my-post.html`
- `author-substack-com-p-another-post.html`
