#!/bin/bash

# setup.sh - Automated setup script for CSV to Screenshots Figma Plugin

# Exit on error
set -e

echo "==== CSV to Screenshots Figma Plugin Setup ===="
echo "This script will set up all prerequisites and install the plugin."
echo ""

# Check for and install Homebrew if needed
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for the current session
    if [[ $(uname -m) == "arm64" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        eval "$(/usr/local/bin/brew shellenv)"
    fi
    
    # Add Homebrew to PATH permanently
    echo "Adding Homebrew to your PATH permanently..."
    echo >> ~/.zprofile
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
else
    echo "✓ Homebrew already installed"
fi

# Install Git if needed
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    brew install git
else
    echo "✓ Git already installed"
fi

# Install Node.js if needed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    brew install node
    
    # Fix npm symlink issues if they exist
    echo "Fixing npm symlink..."
    if [ -f '/opt/homebrew/bin/npm' ]; then
        rm '/opt/homebrew/bin/npm' 2>/dev/null || true
    fi
    brew link --overwrite node
else
    echo "✓ Node.js already installed"
    # Still run the symlink fix in case there are issues
    echo "Ensuring npm symlink is correct..."
    if [ -f '/opt/homebrew/bin/npm' ]; then
        rm '/opt/homebrew/bin/npm' 2>/dev/null || true
    fi
    brew link --overwrite node 2>/dev/null || true
fi

# Install Figma if needed
if ! ls /Applications/Figma.app &> /dev/null; then
    echo "Installing Figma..."
    brew install --cask figma
else
    echo "✓ Figma already installed"
fi

# Set up the project
echo "Setting up the project..."

# Create a directory on Desktop if it doesn't exist
DEST_DIR="$HOME/Desktop/self-documenter"
if [ ! -d "$DEST_DIR" ]; then
    echo "Cloning repository to Desktop..."
    cd ~/Desktop
    git clone https://github.com/nd-yahoo/self-documenter.git
    cd self-documenter
else
    echo "Repository directory already exists at $DEST_DIR"
    cd "$DEST_DIR"
    echo "Pulling latest changes..."
    git pull
fi

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Install Playwright browsers
echo "Installing Playwright browsers..."
npx playwright install chromium

# Build the plugin
echo "Building the plugin..."
npm run build

echo ""
echo "==== Setup Complete! ===="
echo ""
echo "To complete installation:"
echo "1. Open Figma desktop app"
echo "2. Go to Plugins > Development > Import plugin from manifest..."
echo "3. Select the manifest.json file from $DEST_DIR"
echo ""