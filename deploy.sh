#!/bin/bash

# MoroccoGrid — Push to GitHub
# Run this script from your Mac terminal

set -e

# Navigate to your project folder
cd "$(dirname "$0")/morocco-grid"

echo "📍 Working directory: $(pwd)"
echo ""

# Initialize git
echo "🔧 Initializing git repository..."
git init -b main
git config user.email "reda.tahiri1@gmail.com"
git config user.name "Reda Tahiri"

# Add all files
echo "📦 Adding files..."
git add -A

# Create initial commit
echo "💾 Creating commit..."
git commit -m "Initial release: MoroccoGrid infrastructure intelligence map

Single-file interactive map of Morocco's electricity grid and digital
infrastructure pipeline. 5 layers: generation (6 sites), transmission
(400kV backbone + HVDC planned), data centers (4 sites, ~1.4 GW),
submarine cables (2Africa + ACE), and renewable energy zones.

GitHub Actions CI/CD for auto-deploy to Pages on push to main."

# Add remote
echo "🔗 Adding GitHub remote..."
git remote add origin https://github.com/redatahiri37/morocco-grid.git

# Push to GitHub
echo "🚀 Pushing to GitHub..."
echo "    (You will be prompted for your GitHub credentials)"
echo "    Use token: GITHUB_PAT_REDACTED"
echo ""
git push -u origin main

echo ""
echo "✅ Success! Your app is being deployed."
echo ""
echo "Next steps:"
echo "1. Wait ~60 seconds for GitHub Actions to build"
echo "2. Go to: https://github.com/redatahiri37/morocco-grid/actions"
echo "3. Watch the deploy workflow run"
echo "4. Your live app: https://redatahiri.github.io/morocco-grid/"
echo ""
echo "To update in the future, just:"
echo "  cd \"Energy x Digital Nexus in Emerging countries (e.g., Morocco)/morocco-grid\""
echo "  git add ."
echo "  git commit -m 'Your message'"
echo "  git push"
