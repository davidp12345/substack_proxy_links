#!/bin/bash

# Setup script for Substack Proxy Generator Native Host

echo "🚀 Setting up Substack Proxy Generator Native Host..."

# Make the proxy generator executable
chmod +x native-host/proxy-generator.js

# Get the current directory
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Update the path in the native host manifest
sed -i.bak "s|/Users/davidpaykin/Documents/Consolidated_Substack_Notes_Tools|${CURRENT_DIR}|g" native-host/com.substack.proxy.json

echo "📁 Updated native host manifest path to: ${CURRENT_DIR}"

# Create the native messaging host directory for Chrome
CHROME_NATIVE_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$CHROME_NATIVE_DIR"

# Copy the manifest to Chrome's native messaging directory
cp native-host/com.substack.proxy.json "$CHROME_NATIVE_DIR/"

echo "✅ Native messaging host manifest installed for Chrome"

# Instructions for the user
echo ""
echo "🔧 SETUP COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Load the browser extension in Chrome:"
echo "   - Go to chrome://extensions/"
echo "   - Enable 'Developer mode'"
echo "   - Click 'Load unpacked' and select: ${CURRENT_DIR}"
echo ""
echo "2. Note your extension ID from chrome://extensions/"
echo ""
echo "3. Update the native host manifest with your extension ID:"
echo "   - Edit: ${CHROME_NATIVE_DIR}/com.substack.proxy.json"
echo "   - Replace 'YOUR_EXTENSION_ID_HERE' with your actual extension ID"
echo ""
echo "4. Test the extension by visiting a Substack post!"
echo ""
echo "📝 The extension will automatically:"
echo "   - Detect when you visit a Substack post"
echo "   - Generate a proxy HTML file"
echo "   - Deploy it to GitHub Pages"
echo "   - Show you a notification with the proxy URL"
echo ""
