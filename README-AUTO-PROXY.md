# Automated Substack Proxy Generator

This browser extension automatically generates and deploys proxy links for Substack posts in the background, eliminating the need for manual command-line operations.

## 🚀 How It Works

The extension automatically:

1. **Detects Substack Posts**: When you visit any Substack post URL (like `substack.com/home/post/p-XXXXXXX`), the extension detects it
2. **Generates Proxy**: Creates a proxy HTML file that redirects to the original post
3. **Deploys to GitHub Pages**: Automatically runs the deployment to make the proxy publicly accessible
4. **Shows Notification**: Displays a subtle notification with the proxy URL that you can click to copy

## 📁 Architecture

- **Content Script** (`substack_inject.js`): Detects Substack posts and triggers proxy generation
- **Background Script** (`background.js`): Handles the proxy generation logic
- **Native Host** (`native-host/proxy-generator.js`): Node.js script that creates files and deploys to GitHub
- **Browser Extension**: Provides the UI and coordinates everything

## 🔧 Setup Instructions

### 1. Run the Setup Script
```bash
cd ~/Documents/Consolidated_Substack_Notes_Tools
./setup-native-host.sh
```

### 2. Load the Extension in Chrome
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the folder: `/Users/davidpaykin/Documents/Consolidated_Substack_Notes_Tools`

### 3. Configure Extension ID
1. Note your extension ID from `chrome://extensions/`
2. Edit: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.substack.proxy.json`
3. Replace `YOUR_EXTENSION_ID_HERE` with your actual extension ID

### 4. Test It Out!
Visit any Substack post and you should see a notification appear automatically with your proxy link.

## 🎯 Features

### Automatic Detection
- Works on any `*.substack.com` domain
- Detects post URLs with patterns like `/p/`, `/home/post/`, `/posts/`
- Only generates proxies once per hour per URL to avoid spam

### Smart Notifications
- Subtle notification appears in top-right corner
- Click to copy proxy URL to clipboard
- Auto-disappears after 5 seconds
- Non-intrusive design that doesn't interfere with reading

### Background Processing
- No manual commands needed
- Automatic deployment to GitHub Pages
- Handles errors gracefully with fallback storage

## 🔄 How the Automation Works

1. **Page Load**: Content script detects Substack post
2. **Delay**: Waits 2 seconds for page to fully load
3. **Check Cache**: Only generates if not done recently (1 hour cooldown)
4. **Generate**: Sends message to background script
5. **Native Host**: Background script calls Node.js via native messaging
6. **File Creation**: Node.js creates HTML file in `magic-links-proxy/proxies/`
7. **Deploy**: Runs `npm run deploy` to push to GitHub Pages
8. **Notify**: Shows success notification with proxy URL

## 📂 File Structure

```
Consolidated_Substack_Notes_Tools/
├── manifest.json                 # Extension manifest
├── background.js                 # Background service worker
├── substack_inject.js            # Content script for Substack
├── popup.js                      # Extension popup
├── popup.html                    # Extension popup UI
├── popup.css                     # Extension popup styles
├── setup-native-host.sh          # Setup script
├── native-host/
│   ├── proxy-generator.js        # Node.js native messaging host
│   └── com.substack.proxy.json   # Native host manifest
└── magic-links-proxy/
    ├── proxies/                  # Generated proxy files
    ├── proxy_tools/
    │   └── generate_proxy.js     # Original manual script
    └── package.json              # npm configuration
```

## 🛠️ Troubleshooting

### Extension Not Working
1. Check that Developer mode is enabled in Chrome
2. Verify the extension is loaded and enabled
3. Check the Console in Developer Tools for errors

### Native Host Issues
1. Ensure `proxy-generator.js` is executable: `chmod +x native-host/proxy-generator.js`
2. Verify the native host manifest has the correct extension ID
3. Check that the path in the manifest is correct

### No Notifications Appearing
1. Make sure you're on a Substack post URL (not just the main site)
2. Check if you've already generated a proxy for this URL in the last hour
3. Look for error messages in the browser console

### Deployment Failures
1. Ensure you have `npm` and `git` installed
2. Check that the `magic-links-proxy` directory has the correct GitHub remote
3. Verify you have push permissions to the GitHub repository

## 🔒 Privacy & Security

- Only activates on Substack domains
- No data is sent to external servers (except GitHub for deployment)
- Proxy URLs are stored locally in browser storage
- Old proxy data is automatically cleaned up after one week

## 🎉 Usage Tips

- The extension works silently in the background
- You can still use the popup interface for manual operations
- Proxy URLs follow the format: `https://davidp12345.github.io/substack_proxy_links/[filename].html`
- Each proxy redirects immediately to the original Substack post
- Perfect for sharing Substack links that bypass paywalls or restrictions

## 🔄 Manual Fallback

If the automated system fails, you can still use the original manual process:

```bash
cd ~/Documents/Consolidated_Substack_Notes_Tools/magic-links-proxy
node proxy_tools/generate_proxy.js "YOUR_SUBSTACK_URL"
npm run deploy
```

The extension will detect failures and store proxy data for manual deployment if needed.
