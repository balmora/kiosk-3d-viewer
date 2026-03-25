#!/usr/bin/env python3
"""
Push to GitHub
Cross-platform alternative to push.bat
"""

import sys
import subprocess
import shutil

def check_git():
    """Check if git is available"""
    if shutil.which('git') is None:
        print("[ERROR] Git is not installed!")
        print("Please install from https://git-scm.com")
        return False
    return True

def main():
    print("=" * 40)
    print("  Push to GitHub")
    print("=" * 40)
    print()

    if not check_git():
        sys.exit(1)

    # Get commit message
    print("Enter a commit message:")
    print("(describe what you changed)")
    print()
    commit_msg = input("  > ").strip()
    if not commit_msg:
        commit_msg = "Update"

    print()

    # Add files
    print("[..] Adding files...")
    result = subprocess.run(['git', 'add', '.'])
    if result.returncode != 0:
        print("[ERROR] git add failed")
        sys.exit(1)

    # Commit
    print("[..] Committing...")
    result = subprocess.run(['git', 'commit', '-m', commit_msg])
    if result.returncode != 0:
        print("[ERROR] git commit failed")
        sys.exit(1)

    # Push
    print("[..] Pushing to GitHub...")
    result = subprocess.run(['git', 'push', 'origin', 'main'])
    print()
    if result.returncode == 0:
        print("[OK] Successfully pushed to GitHub!")
    else:
        print("[ERROR] Push failed!")
        print("Check your internet connection and GitHub credentials")
        sys.exit(1)

    print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(1)
