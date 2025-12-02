# Orbital Beta Testing Guide

Welcome to the Orbital beta! Thank you for helping us test this early version of our private family social network.

This guide will walk you through installing Orbital, getting started, and providing valuable feedback to help us improve.

## What is Orbital?

Orbital is a private, end-to-end encrypted messaging app designed for families. It combines Signal's world-class security with threaded conversations and family groups (called "Orbits") to make staying connected with loved ones simple and secure.

---

## System Requirements

Before you begin, make sure your Mac meets these requirements:

- **macOS:** Version 10.15 (Catalina) or newer
- **Disk Space:** At least 500 MB available
- **Internet:** Active internet connection
- **Phone Number:** A valid phone number for verification (SMS-capable)

---

## Installation Steps

### Step 1: Download Orbital

1. Visit the [Orbital Releases page](https://github.com/alexg-g/Orbital-Desktop/releases)
2. Find the latest beta release
3. Download the file ending in `.zip` (e.g., `Orbital-1.0.0-beta.zip`)
4. The file will download to your Downloads folder

### Step 2: Extract the ZIP File

1. Open your **Downloads** folder
2. Double-click the `Orbital-[version].zip` file
3. macOS will automatically extract it, creating `Orbital.app`

### Step 3: Move to Applications Folder

1. Drag the **Orbital.app** icon to your **Applications** folder
2. This isn't required, but it's the standard location for apps

### Step 4: Handle Security Warning (IMPORTANT)

Because Orbital is an **unsigned beta build**, macOS will show a security warning the first time you try to open it. This is normal for beta software. Here are three ways to open Orbital:

#### Method 1: Right-Click to Open (Easiest)

1. In your Applications folder, **right-click** (or Control-click) on **Orbital.app**
2. Select **Open** from the menu
3. Click **Open** in the warning dialog
4. Orbital will launch

#### Method 2: System Settings

1. Try to open Orbital normally (double-click)
2. You'll see a warning that "Orbital cannot be opened"
3. Click **OK**
4. Open **System Settings** (or System Preferences)
5. Go to **Privacy & Security**
6. Scroll down to find the message about Orbital being blocked
7. Click **Open Anyway**
8. Enter your password if prompted
9. Click **Open** in the confirmation dialog

#### Method 3: Terminal Command (Advanced)

If you're comfortable with Terminal:

1. Open **Terminal** (in Applications > Utilities)
2. Type or paste this command:
   ```bash
   xattr -cr /Applications/Orbital.app
   ```
3. Press Enter
4. Now you can open Orbital normally

You only need to do this **once**. After the first time, Orbital will open normally.

---

## First Launch

### Phone Number Verification

When you first launch Orbital, you'll need to verify your phone number:

1. **Enter your phone number** (include country code)
2. **Receive a verification code** via SMS
3. **Enter the code** in Orbital
4. Wait for verification to complete

This process uses Signal's secure verification system to ensure your account is protected.

### Set Up Your Profile

After verification, you'll set up your profile:

1. **Choose a display name** (how others will see you)
2. **Add a profile photo** (optional)
3. **Review privacy settings**

Your profile is encrypted and only visible to people in your Orbits.

---

## What to Test

### Features to Explore

During this beta, please test these core features:

#### 1. Messaging
- Send and receive text messages
- Share photos and videos
- React to messages with emoji
- Reply to specific messages

#### 2. Orbits (Family Groups)
- Create a new Orbit
- Join an existing Orbit using an invite code
- Invite family members to your Orbit
- View all members in an Orbit

#### 3. Threads
- Start a new thread in an Orbit
- Reply to existing threads
- View threaded conversations
- Navigate between threads

#### 4. Media Sharing
- Upload photos (up to 50MB each)
- Upload videos (up to 300MB each)
- View media in threads
- Download media to your device

### What's NOT Ready Yet

These features are **not included** in this beta:

- Windows and Linux versions (macOS only for now)
- Automatic updates (you'll manually download new versions)
- Voice/video calls
- Desktop notifications (limited functionality)

---

## How to Provide Feedback

Your feedback is crucial to making Orbital better! Here's how to help:

### Reporting Bugs

If you encounter a problem, please report it on GitHub:

1. Visit our [Issues page](https://github.com/alexg-g/Orbital-Desktop/issues)
2. Click **New Issue**
3. Choose **Bug Report**
4. Fill in the template with:
   - **Title:** A short description of the problem
   - **Steps to Reproduce:** What you did before the bug happened
   - **Expected Behavior:** What you thought should happen
   - **Actual Behavior:** What actually happened
   - **Screenshots:** If applicable (press Cmd+Shift+4 to take a screenshot)
   - **System Info:** Your macOS version (Apple menu > About This Mac)

### Suggesting Improvements

Have an idea to make Orbital better?

1. Visit our [Issues page](https://github.com/alexg-g/Orbital-Desktop/issues)
2. Click **New Issue**
3. Choose **Feature Request**
4. Describe your idea and why it would be helpful

### General Feedback

For general thoughts and experiences:

- Comment on the beta announcement issue
- Share what you love and what's confusing
- Tell us about your use case (how you want to use Orbital with your family)

---

## Known Limitations

### This is Beta Software

Please be aware:

- **Security Warnings:** You'll need to manually approve opening the app (see Installation Steps)
- **Stability:** You may encounter crashes or unexpected behavior
- **Data Resets:** Between beta versions, you may need to reset your data and start fresh
- **Performance:** Some features may be slower than expected
- **Incomplete Features:** Not all planned features are implemented yet

### Backup Important Data

Because this is beta software:

- **Don't rely on it** for critical communications
- **Back up important media** that you share
- **Expect possible data loss** during updates

We're working hard to make Orbital stable, but beta testing means there will be rough edges!

---

## Privacy & Security

### Your Data is Safe

Orbital is built on Signal's proven security foundation:

- **End-to-End Encryption:** All messages, media, and threads are encrypted using the Signal Protocol
- **No Data Collection:** Orbital does not collect, analyze, or sell your data
- **Local Storage:** Your conversations are stored securely on your device
- **Zero Knowledge:** Our servers cannot read your messages

### What We Can See

Our servers only see:

- Encrypted message metadata (sender, recipient, timestamp)
- File sizes (not contents)
- Your phone number (for account creation)

We **cannot** see:

- Message contents
- Media contents
- Your conversation history
- Who you're talking to (beyond basic routing)

---

## Troubleshooting

### App Won't Open

**Problem:** Orbital shows a security warning and won't open

**Solution:** Follow the security warning steps in the Installation section above

---

### Verification Code Not Arriving

**Problem:** Not receiving the SMS verification code

**Solutions:**
1. Check that you entered your phone number correctly (with country code)
2. Wait 2-3 minutes (sometimes SMS is delayed)
3. Request a new code
4. Check that your phone can receive SMS messages
5. Try restarting Orbital and verifying again

---

### App Crashes on Launch

**Problem:** Orbital opens then immediately crashes

**Solutions:**
1. Try restarting your Mac
2. Check that you meet the system requirements (macOS 10.15+)
3. Try removing and reinstalling Orbital
4. Check the Console app (Applications > Utilities > Console) for error logs
5. Report the issue on GitHub with crash logs

---

### Can't Join an Orbit

**Problem:** Invite code isn't working

**Solutions:**
1. Verify the code is correct (check for typos)
2. Ask the person who sent it to generate a new code
3. Make sure you have an internet connection
4. Try restarting Orbital
5. Report the issue if it persists

---

### Messages Not Sending

**Problem:** Messages show as "Sending..." but never deliver

**Solutions:**
1. Check your internet connection
2. Verify the recipient is also online
3. Try restarting Orbital
4. Check that you're still connected to the server (look for connection status)
5. Report the issue if it persists

---

### Media Upload Fails

**Problem:** Photos or videos won't upload

**Solutions:**
1. Check file size (photos: max 50MB, videos: max 300MB)
2. Verify you have enough disk space
3. Check your internet connection (uploads may take time on slow connections)
4. Try a smaller file first to test
5. Report the issue with file details (size, format)

---

### Resetting the App

If you need to start fresh:

**⚠️ Warning:** This will delete all your local data, including messages and media.

1. Quit Orbital completely
2. Open Finder
3. Press **Cmd+Shift+G** (Go to Folder)
4. Paste this path: `~/Library/Application Support/Orbital`
5. Delete the **Orbital** folder
6. Empty your Trash
7. Restart Orbital (you'll need to verify your phone number again)

---

### Viewing Logs

If we ask you to share logs for debugging:

1. Quit Orbital
2. Open **Console** app (Applications > Utilities > Console)
3. In the search bar, type "Orbital"
4. Launch Orbital again
5. Reproduce the problem
6. In Console, select the relevant log entries
7. Right-click and choose **Copy**
8. Paste into your GitHub issue report

Alternatively, you can find log files at:
```
~/Library/Logs/Orbital/
```

---

## Getting Help

### Before Asking for Help

1. Check this guide for troubleshooting steps
2. Search [existing issues](https://github.com/alexg-g/Orbital-Desktop/issues) to see if someone else reported the same problem
3. Try restarting Orbital
4. Try restarting your Mac

### How to Get Support

1. **GitHub Issues:** [Report bugs and issues](https://github.com/alexg-g/Orbital-Desktop/issues)
2. **Documentation:** Check the [Orbital documentation](https://github.com/alexg-g/Orbital-Desktop/tree/main/docs)
3. **Community:** Connect with other beta testers in issues discussions

---

## Thank You!

Thank you for being part of the Orbital beta! Your testing and feedback are invaluable in helping us build a better, more secure way for families to stay connected.

Every bug you report, every feature you suggest, and every experience you share helps us improve Orbital for everyone.

**Happy Testing!**

— The Orbital Team

---

## Quick Reference

### Important Links
- [Download Releases](https://github.com/alexg-g/Orbital-Desktop/releases)
- [Report Issues](https://github.com/alexg-g/Orbital-Desktop/issues)
- [Documentation](https://github.com/alexg-g/Orbital-Desktop/tree/main/docs)
- [GitHub Repository](https://github.com/alexg-g/Orbital-Desktop)

### Key Locations
- **App Location:** `/Applications/Orbital.app`
- **App Data:** `~/Library/Application Support/Orbital`
- **Logs:** `~/Library/Logs/Orbital/`

### Quick Fixes
- **Security Warning:** Right-click > Open
- **Reset App:** Delete `~/Library/Application Support/Orbital`
- **View Logs:** Console app or `~/Library/Logs/Orbital/`

### System Requirements
- macOS 10.15+
- 500 MB disk space
- Internet connection
- Phone number for verification
