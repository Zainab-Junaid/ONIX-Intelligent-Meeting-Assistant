#!/usr/bin/env python3
"""
Setup script for Onix Meeting Assistant
"""

import os
import sys
import subprocess
import platform

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"\n{description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✓ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ {description} failed: {e}")
        print(f"Error output: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("✗ Python 3.8 or higher is required")
        return False
    print(f"✓ Python {version.major}.{version.minor}.{version.micro} is compatible")
    return True

def install_node_dependencies():
    """Install Node.js dependencies"""
    if not os.path.exists("package.json"):
        print("✗ package.json not found")
        return False
    
    return run_command("npm install", "Installing Node.js dependencies")

def install_python_dependencies():
    """Install Python dependencies"""
    if not os.path.exists("requirements.txt"):
        print("✗ requirements.txt not found")
        return False
    
    return run_command("pip install -r requirements.txt", "Installing Python dependencies")

def install_whisper():
    """Install OpenAI Whisper"""
    return run_command("pip install openai-whisper", "Installing OpenAI Whisper")

def install_ffmpeg():
    """Install FFmpeg (required for Whisper)"""
    system = platform.system().lower()
    
    if system == "windows":
        print("Please install FFmpeg manually on Windows:")
        print("1. Download from https://ffmpeg.org/download.html")
        print("2. Add to PATH environment variable")
        return True
    elif system == "darwin":  # macOS
        return run_command("brew install ffmpeg", "Installing FFmpeg via Homebrew")
    elif system == "linux":
        return run_command("sudo apt-get update && sudo apt-get install -y ffmpeg", "Installing FFmpeg via apt")
    else:
        print(f"Unknown system: {system}")
        return False

def create_directories():
    """Create necessary directories"""
    directories = ["uploads", "logs", "models"]
    
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print(f"✓ Created directory: {directory}")
        else:
            print(f"✓ Directory already exists: {directory}")

def setup_huggingface_token():
    """Setup Hugging Face token for pyannote"""
    print("\n" + "="*60)
    print("HUGGING FACE TOKEN SETUP")
    print("="*60)
    print("To use advanced speaker diarization, you need a Hugging Face token:")
    print("1. Go to https://huggingface.co/settings/tokens")
    print("2. Create a new token")
    print("3. Accept the terms for pyannote/speaker-diarization")
    print("4. Set the token in speaker_diarization.py")
    print("="*60)

def main():
    """Main setup function"""
    print("🚀 Setting up Onix Meeting Assistant...")
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Create directories
    create_directories()
    
    # Install dependencies
    success = True
    
    # Node.js dependencies
    if not install_node_dependencies():
        success = False
    
    # Python dependencies
    if not install_python_dependencies():
        success = False
    
    # FFmpeg
    if not install_ffmpeg():
        success = False
    
    # Whisper
    if not install_whisper():
        success = False
    
    # Setup instructions
    setup_huggingface_token()
    
    if success:
        print("\n🎉 Setup completed successfully!")
        print("\nNext steps:")
        print("1. Start the backend server: npm start")
        print("2. Load the extension in Chrome")
        print("3. Open a meeting (Google Meet or Zoom)")
        print("4. Click 'Start Capture' in the extension")
    else:
        print("\n❌ Setup completed with errors. Please check the output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
