# Classroom Hall Pass Web Application

A modern, responsive, touch-friendly classroom hall pass management system designed for **Chromebooks**, **iPads**, and desktop web browsers.

---

## 🌟 Key Features

1. **Dynamic High-Visibility Visual States**:
   - **🟢 Green Screen (Available)**: Pass is in the classroom and ready for sign-out.
   - **🔴 Red Screen (In Use)**: Pass is out. Displays student name, destination, elapsed timer, emergency notice (`"Please talk to Mr. Roberts or Mr. Hoerter"`), return button, and a live upcoming waitlist queue widget.
   - **⚫ Black Screen (Blackout)**: Displays during restricted times (first 10 min, last 10 min, passing periods, lunch, testing, or teacher emergency pause) with clear explanation.
2. **Smart Schedule & Blackout Engine**:
   - **First 10 Minutes Blackout**: Screen turns black; students cannot sign out yet but **can add their names to the wait list** for when passes open.
   - **Last 10 Minutes Blackout**: Screen turns black; **automatically purges the wait list** for dismissal prep. If a student is currently out, they can still check back in when they return.
   - **Passing Periods**: Between periods, screen informs students of the upcoming class and lets them join the wait list.
3. **Wait List Queue System**:
   - Students tap **"Add to Wait List"** during active passes or first-10-minute blackout.
   - When the current student returns, the kiosk immediately chimes and prompts the next student in line to select their destination and sign out.
   - Next student can tap **"I no longer need to leave"** to cancel without taking a pass, immediately advancing to the next student in queue.
4. **Google Sheets Roster Integration & CSV Import/Export**:
   - Live sync with Google Sheets (via published CSV URL or Sheet ID).
   - Direct CSV upload and in-app roster editor with student pass restriction notes.
5. **Teacher Analytics & Secure Controls (PIN: 1234)**:
   - Live Pass Monitor with manual emergency override (force return, emergency pause, clear queue).
   - Frequency metrics, average & total durations, outlier alerts (trips > 8 min, frequent users).
   - **Positive Reinforcement Leaderboard**: Honors students and classes with the best time efficiency.
   - Pass history logs with multi-filters and 1-click CSV export.
6. **Time Simulator / Time Machine**:
   - Built-in simulation bar to jump between bell times (`9:35`, `9:39`, `9:45`, `9:46`, `9:48`, `9:51`, `10:15`, `10:25`, `10:40`) to demonstrate and test all schedule transitions.
7. **Kiosk Optimizations for iPad & Chromebook**:
   - Screen Wake Lock API (prevents tablet screens from going to sleep).
   - Tactile touch buttons (48px+ tap targets, no accidental double-tap zoom).
   - Synthesized gentle audio chimes (Web Audio API).

---

## 🚀 How to Run the App

### Option A: Direct Browser Launch
Open `index.html` directly in Google Chrome, Microsoft Edge, or Apple Safari:
```
C:\Users\bbrte\.gemini\antigravity\scratch\hall-pass-app\index.html
```

### Option B: Local Web Server (Recommended for iPads on Local Wi-Fi)
In the project directory, run:
```powershell
& "C:\Users\bbrte\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
```
The server will print:
- **Local URL**: `http://localhost:3000`
- **iPad / Chromebook Wi-Fi URL**: `http://<your-local-ip>:3000`

---

## 📱 iPad / Chromebook Setup Tips

- **iPad (Kiosk / Full Screen)**:
  1. Open Safari on the iPad and go to the app URL.
  2. Tap the **Share** icon (square with arrow pointing up) and choose **"Add to Home Screen"**.
  3. Tap the icon on the home screen to launch in clean, full-screen kiosk mode.
  4. (Optional) Turn on **Guided Access** in iPad Settings -> Accessibility -> Guided Access to lock the iPad strictly to the hall pass kiosk.
- **Chromebook (Kiosk Mode)**:
  1. Open Chrome and press **F11** for full-screen mode.

---

## 🔒 Teacher Dashboard Default Credentials

- **Default PIN**: `1234` (Can be changed in the **Settings** tab).
- **Default Emergency Contacts**: `Mr. Roberts or Mr. Hoerter` (Customizable in Settings).

---

## 🧪 Automated Scenario Verification

To run the automated scenario test suite verifying the narrative:
```powershell
& "C:\Users\bbrte\AppData\Roaming\Antigravity\bin\agy-node.cmd" tests\test_suite.js
```
