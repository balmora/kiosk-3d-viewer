#!/usr/bin/env python3
"""
Update from GitHub
Pulls latest changes from the repository.
"""

import sys
import subprocess
import shutil
import os


def check_git():
    if shutil.which('git') is None:
        print("[ERROR] Git is not installed!")
        print("Please install from https://git-scm.com")
        return False
    return True


def run_git(args, capture=True):
    kwargs = {}
    if capture:
        kwargs['capture_output'] = True
        kwargs['text'] = True
    result = subprocess.run(['git'] + args, **kwargs)
    return result


def get_current_commit():
    result = run_git(['rev-parse', '--short', 'HEAD'])
    return result.stdout.strip() if result.returncode == 0 else 'unknown'


def get_remote_commit():
    result = run_git(['rev-parse', '--short', 'origin/main'])
    return result.stdout.strip() if result.returncode == 0 else 'unknown'


def check_local_changes():
    result = run_git(['status', '--porcelain'])
    if result.stdout.strip():
        return True
    return False


def get_changed_files():
    result = run_git(['diff', '--name-only', 'origin/main'])
    if result.returncode == 0:
        files = [f for f in result.stdout.strip().split('\n') if f]
        return files
    return []


def main():
    print("=" * 50)
    print("  Update from GitHub")
    print("=" * 50)
    print()

    if not check_git():
        sys.exit(1)

    # Check if we're in a git repo
    result = run_git(['rev-parse', '--git-dir'])
    if result.returncode != 0:
        print("[ERROR] Not in a git repository!")
        sys.exit(1)

    # Get current state
    print("[INFO] Checking repository status...")
    current = get_current_commit()
    remote = get_remote_commit()
    print(f"  Current commit: {current}")
    print(f"  Remote commit:  {remote}")
    print()

    if current == remote:
        print("[OK] Already up to date!")
        sys.exit(0)

    # Check for local changes
    if check_local_changes():
        print("[WARN] You have local uncommitted changes.")
        print()
        print("Options:")
        print("  1) Stash changes (save for later)")
        print("  2) Discard changes (lose local work)")
        print("  3) Cancel update")
        print()
        choice = input("  Choose (1/2/3): ").strip()
        print()

        if choice == '1':
            print("[..] Stashing local changes...")
            result = run_git(['stash'])
            if result.returncode != 0:
                print("[ERROR] Failed to stash changes!")
                print(result.stderr)
                sys.exit(1)
            stashed = True
            print("[OK] Changes stashed")
        elif choice == '2':
            print("[WARN] Discarding local changes...")
            run_git(['checkout', '.'])
            run_git(['clean', '-fd'])
            stashed = False
        else:
            print("[CANCELLED] Update aborted.")
            sys.exit(0)
    else:
        stashed = False

    # Fetch latest
    print()
    print("[..] Fetching latest from GitHub...")
    result = run_git(['fetch', 'origin'])
    if result.returncode != 0:
        print("[ERROR] Failed to fetch!")
        print(result.stderr)
        if stashed:
            run_git(['stash', 'pop'])
        sys.exit(1)

    # Show changed files
    print()
    print("[INFO] Files to update:")
    changed = get_changed_files()
    if changed:
        for f in changed:
            print(f"  - {f}")
    else:
        print("  (none - just metadata update)")
    print()

    # Pull changes
    print("[..] Pulling changes...")
    result = run_git(['pull', 'origin', 'main'])
    if result.returncode != 0:
        print("[ERROR] Failed to pull!")
        print(result.stderr)
        if stashed:
            print()
            print("[INFO] Your stashed changes are safe. Run 'git stash pop' to restore them.")
        sys.exit(1)

    print()
    print("[OK] Update complete!")
    print(f"  Updated to: {get_current_commit()}")

    if stashed:
        print()
        print("[INFO] Your local changes are stashed.")
        print("  Run 'git stash pop' to restore them after restarting.")

    print()
    print("=" * 50)
    print("  Please restart the kiosk to apply changes.")
    print("=" * 50)
    print()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(1)
