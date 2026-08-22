// Main Application Coordinator & Kiosk View Controller

import { sounds } from './audio.js';
import { storage } from './storage.js';
import { ScheduleEngine } from './scheduleEngine.js';
import { QueueManager } from './queueManager.js';
import { RosterSync } from './rosterSync.js';
import { AnalyticsEngine } from './analytics.js';
import { TeacherDashboard } from './dashboard.js';
import { CloudSyncEngine } from './cloudSync.js';

export class HallPassApp {
  constructor() {
    this.storage = storage;
    this.sounds = sounds;
    this.scheduleEngine = new ScheduleEngine(this.storage);
    this.queueManager = new QueueManager(this.storage, this.sounds);
    this.rosterSync = new RosterSync(this.storage);
    this.analytics = new AnalyticsEngine(this.storage, this.scheduleEngine);
    this.cloudSync = new CloudSyncEngine(this.storage);
    this.dashboard = new TeacherDashboard(
      this.storage,
      this.scheduleEngine,
      this.queueManager,
      this.rosterSync,
      this.analytics,
      this.sounds,
      this.cloudSync
    );

    this.clockInterval = null;
    this.wakeLock = null;
    this.selectedStudent = null;
    this.selectedDestination = 'Restroom';
    this.selectedDestinationDetail = '';
    this.pickerMode = 'signout'; // 'signout' or 'waitlist'
    this.previousState = null;
  }

  init() {
    this.dashboard.init();
    this.bindKioskEvents();
    this.initSimulator();
    this.initWakeLock();
    this.initCloudSync();
    this.startClockLoop();

    window.addEventListener('hallpass:statechange', () => {
      this.updateState();
    });

    // Initial evaluation
    this.updateState();

    // Check if opened with ?view=dashboard (Laptop Desk Monitor Mode)
    this.checkAutoDashboardMode();
  }

  initCloudSync() {
    this.cloudSync.init();

    const badge = document.getElementById('sync-status-badge');
    const text = document.getElementById('sync-status-text');
    const settingsIndicator = document.getElementById('settings-sync-indicator');

    if (badge) {
      badge.classList.remove('hidden');
      badge.addEventListener('click', () => {
        this.dashboard.openPinModal();
      });
    }

    this.cloudSync.onStatusChange((status, label) => {
      if (text) text.textContent = label;
      if (settingsIndicator) {
        if (status === 'connected') {
          settingsIndicator.className = 'px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300';
          settingsIndicator.textContent = '🟢 ' + label;
        } else {
          settingsIndicator.className = 'px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300';
          settingsIndicator.textContent = '🟡 ' + label;
        }
      }
    });
  }

  checkAutoDashboardMode() {
    if (typeof window === 'undefined' || !window.location) return;
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || params.get('mode');
    if (view === 'dashboard' || view === 'desk' || view === 'teacher') {
      setTimeout(() => {
        this.dashboard.openDashboard();
      }, 250);
    }
  }

  // Request Screen Wake Lock so iPads / Chromebooks stay awake (safe for iOS Safari)
  initWakeLock() {
    try {
      const settings = this.storage.getSettings();
      if (settings.wakeLockEnabled && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        const requestLock = async () => {
          try {
            this.wakeLock = await navigator.wakeLock.request('screen');
          } catch (err) {
            // iOS Safari may reject until first user touch, which is expected
          }
        };

        requestLock();

        // Bind to first user gesture for iOS WebKit policy
        const onFirstTouch = () => {
          requestLock();
          document.removeEventListener('touchstart', onFirstTouch);
          document.removeEventListener('click', onFirstTouch);
        };
        document.addEventListener('touchstart', onFirstTouch, { passive: true });
        document.addEventListener('click', onFirstTouch, { passive: true });

        document.addEventListener('visibilitychange', () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible') {
            requestLock();
          }
        });
      }
    } catch (e) {
      console.warn('Wake Lock init note:', e);
    }
  }

  // 1-second Clock Loop and State Evaluation
  startClockLoop() {
    this.updateClockAndState();
    this.clockInterval = setInterval(() => {
      this.updateClockAndState();
    }, 1000);
  }

  updateClockAndState() {
    const evaluation = this.scheduleEngine.evaluate();

    // 1. Update Live Clock Display
    const clockEl = document.getElementById('kiosk-live-clock');
    if (clockEl) {
      clockEl.textContent = evaluation.formattedTime;
    }

    // 2. Update Period Header Label
    const periodLabelEl = document.getElementById('kiosk-period-label');
    if (periodLabelEl) {
      if (evaluation.currentPeriod) {
        periodLabelEl.textContent = `${evaluation.currentPeriod.name} (${this.scheduleEngine.formatTime12Hour(evaluation.currentPeriod.start)} - ${this.scheduleEngine.formatTime12Hour(evaluation.currentPeriod.end)})`;
      } else if (evaluation.nextPeriod) {
        periodLabelEl.textContent = `Passing Period • Next: ${evaluation.nextPeriod.name} at ${this.scheduleEngine.formatTime12Hour(evaluation.nextPeriod.start)}`;
      } else {
        periodLabelEl.textContent = 'Outside Bell Schedule';
      }
    }

    // 3. Update active pass timers if a student is out
    const activePass = this.queueManager.getActivePass();
    if (activePass && activePass.signOutTime) {
      const elapsedSec = Math.max(0, Math.round((Date.now() - activePass.signOutTime) / 1000));
      const elapsedFormatted = this.scheduleEngine.formatDuration(elapsedSec);

      const redTimer = document.getElementById('red-elapsed-timer');
      if (redTimer) redTimer.textContent = elapsedFormatted;

      const blackTimer = document.getElementById('black-elapsed-timer');
      if (blackTimer) blackTimer.textContent = elapsedFormatted;
    }

    // 4. Periodically update screen status if state changed or minute rolled over
    this.updateState(evaluation);
  }

  // Update Visual State (Green, Red, Black Screen)
  updateState(cachedEvaluation = null) {
    const evaluation = cachedEvaluation || this.scheduleEngine.evaluate();
    const activePass = this.queueManager.getActivePass();
    const waitList = this.queueManager.getWaitList();
    const settings = this.storage.getSettings();

    // Check Auto-Purge Waitlist flag (e.g. Last 10 minutes begins or school day concludes)
    if (evaluation.purgeWaitlist && (waitList.length > 0 || this.queueManager.nextPromptStudent)) {
      this.queueManager.purgeWaitList('Last 10 minutes / Dismissal blackout');
      this.showToast('Wait list cleared for end-of-class dismissal preparation.', 'info');
    }

    // Screens references
    const greenScreen = document.getElementById('screen-green');
    const redScreen = document.getElementById('screen-red');
    const blackScreen = document.getElementById('screen-black');

    // Hide all screens initially
    [greenScreen, redScreen, blackScreen].forEach(s => s && s.classList.add('hidden'));

    // 1. If currently in BLACKOUT (or Emergency Lockdown / Pause)
    if (evaluation.state === 'BLACKOUT') {
      if (blackScreen) {
        blackScreen.classList.remove('hidden');
        document.body.className = 'bg-black text-white min-h-screen flex flex-col font-sans transition-colors duration-500 select-none';

        // Set Blackout Details
        document.getElementById('blackout-title').textContent = evaluation.title;
        document.getElementById('blackout-reason').textContent = evaluation.reason;

        // If a student is currently out during blackout / emergency hold
        const blackoutActiveBox = document.getElementById('blackout-active-student-box');
        if (activePass) {
          blackoutActiveBox.classList.remove('hidden');
          document.getElementById('blackout-student-name').textContent = activePass.studentName;
          document.getElementById('blackout-destination').textContent = `${activePass.destination} ${activePass.destinationDetail ? '(' + activePass.destinationDetail + ')' : ''}`;
          document.getElementById('btn-blackout-signin-name').textContent = `${activePass.studentName} is Back / Sign In`;
        } else {
          blackoutActiveBox.classList.add('hidden');
        }

        // Waitlist Status Notice on Black Screen
        const waitlistStatus = document.getElementById('blackout-waitlist-status');
        if (waitlistStatus) {
          if (settings.waitListEnabled !== false && waitList.length > 0) {
            waitlistStatus.classList.remove('hidden');
            waitlistStatus.innerHTML = `⏸️ <strong>Wait list paused:</strong> ${waitList.length} student(s) currently in line (${waitList.map(s => s.studentName).join(', ')}). Passes will resume in order once the hold/blackout is lifted.`;
          } else {
            waitlistStatus.classList.add('hidden');
          }
        }

        // Waitlist button in Blackout (allowed in first 10 min & passing period)
        const btnBlackoutWaitlist = document.getElementById('btn-blackout-waitlist');
        if (btnBlackoutWaitlist) {
          if (settings.waitListEnabled !== false && evaluation.canWaitlist) {
            btnBlackoutWaitlist.classList.remove('hidden');
            btnBlackoutWaitlist.textContent = `+ Add Name to Wait List for ${evaluation.unlockTime || 'Class'}`;
          } else {
            btnBlackoutWaitlist.classList.add('hidden');
          }
        }
      }
    } 
    // 2. If PASS IS SIGNED OUT (Red Screen)
    else if (activePass) {
      if (redScreen) {
        redScreen.classList.remove('hidden');
        document.body.className = 'bg-red-600 text-white min-h-screen flex flex-col font-sans transition-colors duration-500 select-none';

        document.getElementById('red-student-name').textContent = activePass.studentName;
        document.getElementById('red-destination').textContent = `${activePass.destination.toUpperCase()} ${activePass.destinationDetail ? '(' + activePass.destinationDetail + ')' : ''}`;
        document.getElementById('btn-signin-student-name').textContent = `${activePass.studentName} is Back (Sign In)`;
        
        // Emergency Contact Notice
        const emergencyText = document.getElementById('red-emergency-notice');
        if (emergencyText) {
          emergencyText.textContent = `In case of an extreme emergency, please talk to ${settings.emergencyTeachers || 'Mr. Roberts or Mr. Hoerter'}.`;
        }

        // Toggle Waitlist button & widget on Red Screen based on waitListEnabled setting
        const btnRedWaitlist = document.getElementById('btn-red-waitlist');
        const redWaitlistWidget = document.getElementById('red-waitlist-widget');
        const redButtonsGrid = document.getElementById('red-buttons-grid');

        if (btnRedWaitlist) {
          if (settings.waitListEnabled !== false) {
            btnRedWaitlist.classList.remove('hidden');
            if (redButtonsGrid) redButtonsGrid.classList.add('sm:grid-cols-2');
            if (redButtonsGrid) redButtonsGrid.classList.remove('sm:grid-cols-1');
          } else {
            btnRedWaitlist.classList.add('hidden');
            if (redButtonsGrid) redButtonsGrid.classList.remove('sm:grid-cols-2');
            if (redButtonsGrid) redButtonsGrid.classList.add('sm:grid-cols-1');
          }
        }

        if (redWaitlistWidget) {
          if (settings.waitListEnabled !== false) {
            redWaitlistWidget.classList.remove('hidden');
            this.renderRedWaitlistWidget(waitList);
          } else {
            redWaitlistWidget.classList.add('hidden');
          }
        }
      }
    } 
    // 3. PASS AVAILABLE (Green Screen)
    else {
      if (greenScreen) {
        greenScreen.classList.remove('hidden');
        document.body.className = 'bg-emerald-600 text-white min-h-screen flex flex-col font-sans transition-colors duration-500 select-none';

        // Only prompt waitlisted students when an emergency hold / blackout is lifted
        const isLiftedHold = this.previousState === 'BLACKOUT';
        if (isLiftedHold && settings.waitListEnabled !== false && waitList.length > 0 && !this.queueManager.nextPromptStudent && !this.isModalOpen()) {
          const next = waitList.shift();
          this.storage.saveWaitList(waitList);
          this.promptNextStudent(next);
        }
      }
    }

    // Check Pending Approval status
    const pendingApproval = this.storage.getPendingApproval();
    const approvalModal = document.getElementById('approval-wait-modal');
    if (activePass && approvalModal && !approvalModal.classList.contains('hidden')) {
      approvalModal.classList.add('hidden');
      this.showToast(`Pass approved! You may now take the pass.`, 'success');
    }
    if (pendingApproval && pendingApproval.status === 'denied') {
      if (approvalModal && !approvalModal.classList.contains('hidden')) {
        approvalModal.classList.add('hidden');
      }
      this.showToast(`❌ Pass request for ${pendingApproval.studentName} was denied by teacher.`, 'error');
      this.storage.savePendingApproval(null);

      // Advance to the next student on the wait list (e.g. Ciara)
      const currentWaitList = this.queueManager.getWaitList();
      if (currentWaitList.length > 0) {
        const next = currentWaitList.shift();
        this.storage.saveWaitList(currentWaitList);
        setTimeout(() => this.promptNextStudent(next), 400);
      }
    }

    this.previousState = evaluation.state;
  }

  // Render upcoming queue widget on Red Screen
  renderRedWaitlistWidget(waitList) {
    const queueList = document.getElementById('red-waitlist-items');
    const queueCountBadge = document.getElementById('red-waitlist-count');

    if (queueCountBadge) {
      queueCountBadge.textContent = `${waitList.length} in line`;
    }

    if (queueList) {
      if (waitList.length === 0) {
        queueList.innerHTML = '<p class="text-xs text-red-200 italic py-1">No students currently on wait list.</p>';
      } else {
        let html = '';
        waitList.forEach((st, idx) => {
          html += `
            <div class="flex items-center justify-between bg-red-700/60 border border-red-500/40 px-3 py-1.5 rounded-lg text-sm">
              <span class="font-bold text-white"><span class="text-red-300 font-mono text-xs mr-2">#${idx + 1}</span>${st.studentName}</span>
              <span class="text-xs text-red-200">Next up</span>
            </div>
          `;
        });
        queueList.innerHTML = html;
      }
    }
  }

  // Wire up all touch and click interactions
  bindKioskEvents() {
    // 1. Green Screen -> Sign Out button
    const btnGreenSignOut = document.getElementById('btn-green-signout');
    if (btnGreenSignOut) {
      btnGreenSignOut.addEventListener('click', () => {
        this.openStudentPicker('signout');
      });
    }

    // 2. Red Screen -> Sign In Button
    const btnSignIn = document.getElementById('btn-red-signin');
    if (btnSignIn) {
      btnSignIn.addEventListener('click', () => {
        this.handleStudentSignIn();
      });
    }

    // 3. Red Screen -> Add to Waitlist Button
    const btnRedWaitlist = document.getElementById('btn-red-waitlist');
    if (btnRedWaitlist) {
      btnRedWaitlist.addEventListener('click', () => {
        this.openStudentPicker('waitlist');
      });
    }

    // 4. Blackout Screen -> Sign In Button (for active student returning during blackout / hold)
    const btnBlackoutSignIn = document.getElementById('btn-blackout-signin');
    if (btnBlackoutSignIn) {
      btnBlackoutSignIn.addEventListener('click', () => {
        this.handleStudentSignIn();
      });
    }

    // 5. Blackout Screen -> Add to Waitlist Button (First 10 min / passing period)
    const btnBlackoutWaitlist = document.getElementById('btn-blackout-waitlist');
    if (btnBlackoutWaitlist) {
      btnBlackoutWaitlist.addEventListener('click', () => {
        this.openStudentPicker('waitlist');
      });
    }

    // 6. Teacher Lock Icon -> Open PIN Modal
    const btnTeacherLock = document.getElementById('btn-teacher-lock');
    if (btnTeacherLock) {
      btnTeacherLock.addEventListener('click', () => {
        this.dashboard.openPinModal();
      });
    }

    // 7. Modals close buttons
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-container');
        if (modal) modal.classList.add('hidden');
      });
    });

    // 8. Destination Buttons
    document.querySelectorAll('.destination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dest = btn.dataset.destination;
        this.handleDestinationSelected(dest);
      });
    });

    // Submit Teacher Destination button and Enter key
    const btnSubmitTeacher = document.getElementById('btn-submit-teacher-dest');
    if (btnSubmitTeacher) {
      btnSubmitTeacher.addEventListener('click', () => this.submitTeacherDestination());
    }
    const inputTeacher = document.getElementById('input-dest-teacher');
    if (inputTeacher) {
      inputTeacher.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitTeacherDestination();
        }
      });
    }

    // Submit Custom Destination button and Enter key
    const btnSubmitCustom = document.getElementById('btn-submit-custom-dest');
    if (btnSubmitCustom) {
      btnSubmitCustom.addEventListener('click', () => this.submitCustomDestination());
    }
    const inputCustom = document.getElementById('input-dest-custom');
    if (inputCustom) {
      inputCustom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitCustomDestination();
        }
      });
    }

    // Next Student Destination dropdown change
    const nextDestSelect = document.getElementById('next-student-destination-select');
    if (nextDestSelect) {
      nextDestSelect.addEventListener('change', (e) => {
        const teacherBox = document.getElementById('next-dest-teacher-box');
        if (e.target.value === 'Another Teacher') {
          if (teacherBox) teacherBox.classList.remove('hidden');
          const nextTeacherInput = document.getElementById('input-next-dest-teacher'); if (nextTeacherInput) nextTeacherInput.focus();
        } else {
          if (teacherBox) teacherBox.classList.add('hidden');
        }
      });
    }

    // 9. Confirm Sign Out button
    const btnConfirmSignOut = document.getElementById('btn-confirm-signout');
    if (btnConfirmSignOut) {
      btnConfirmSignOut.addEventListener('click', () => {
        this.handleConfirmSignOut();
      });
    }

    // Approval Wait Modal buttons
    const btnApprovalCancel = document.getElementById('btn-approval-cancel');
    if (btnApprovalCancel) {
      btnApprovalCancel.addEventListener('click', () => {
        this.storage.savePendingApproval(null);
        const modal = document.getElementById('approval-wait-modal');
        if (modal) modal.classList.add('hidden');
        this.showToast('Pass request cancelled.', 'info');

        // Advance to the next student in line (e.g. Ciara)
        const waitList = this.queueManager.getWaitList();
        if (waitList.length > 0) {
          const next = waitList.shift();
          this.storage.saveWaitList(waitList);
          setTimeout(() => this.promptNextStudent(next), 300);
        } else {
          this.updateState();
        }
      });
    }

    const btnApprovalPin = document.getElementById('btn-approval-pin-override');
    if (btnApprovalPin) {
      btnApprovalPin.addEventListener('click', () => {
        const pin = prompt('Teacher Authorization: Enter your PIN to approve this pass:');
        if (pin) {
          const settings = this.storage.getSettings();
          const correctPin = String(settings.teacherPin !== undefined ? settings.teacherPin : '1234');
          if (pin.trim() === correctPin) {
            const req = this.storage.getPendingApproval();
            if (req) {
              this.queueManager.signOut(
                { id: req.studentId, name: req.studentName, period: req.periodId },
                req.destination,
                req.destinationDetail,
                { id: req.periodId, name: req.periodName }
              );
              this.storage.savePendingApproval(null);
              const modal = document.getElementById('approval-wait-modal');
              if (modal) modal.classList.add('hidden');
              this.showToast(`Pass approved for ${req.studentName}!`, 'success');
              this.updateState();
            }
          } else {
            alert('Incorrect PIN.');
          }
        }
      });
    }

    // 10. Next Student in Line Modal buttons
    const btnNextSignOut = document.getElementById('btn-next-signout');
    if (btnNextSignOut) {
      btnNextSignOut.addEventListener('click', () => {
        this.handleNextStudentSignOut();
      });
    }

    const btnNextCancel = document.getElementById('btn-next-cancel');
    if (btnNextCancel) {
      btnNextCancel.addEventListener('click', () => {
        this.handleNextStudentCancelled();
      });
    }

    // Student Search filter in Picker
    const studentSearch = document.getElementById('student-search-input');
    if (studentSearch) {
      studentSearch.addEventListener('input', (e) => {
        this.renderStudentList(e.target.value);
      });
    }
  }

  // Open Student Picker (for Sign Out or Waitlist)
  openStudentPicker(mode = 'signout') {
    const settings = this.storage.getSettings();
    if (mode === 'waitlist' && settings.waitListEnabled === false) {
      this.showToast('Wait list is currently disabled in teacher settings.', 'warning');
      return;
    }

    // If students are waiting on the wait list, prompt the next in line rather than allowing walk-ups to jump the line
    if (mode === 'signout' && settings.waitListEnabled !== false) {
      const waitList = this.queueManager.getWaitList();
      if (waitList.length > 0) {
        const next = waitList.shift();
        this.storage.saveWaitList(waitList);
        this.promptNextStudent(next);
        return;
      }
    }

    this.pickerMode = mode;
    const modal = document.getElementById('student-picker-modal');
    const title = document.getElementById('student-picker-title');
    const search = document.getElementById('student-search-input');

    if (title) {
      title.textContent = mode === 'signout' ? 'Select Your Name to Sign Out' : 'Select Your Name to Join Wait List';
    }
    if (search) search.value = '';

    this.renderStudentList();
    if (modal) modal.classList.remove('hidden');
  }

  // Render students for current period
  renderStudentList(searchQuery = '') {
    const list = document.getElementById('student-picker-list');
    if (!list) return;

    const evaluation = this.scheduleEngine.evaluate();
    const targetPeriod = evaluation.currentPeriod || evaluation.nextPeriod;
    const periodId = targetPeriod ? targetPeriod.id : 'p1';

    const roster = this.storage.getRoster() || [];
    const activePass = this.queueManager.getActivePass();
    const waitList = this.queueManager.getWaitList();

    // Filter students by active period
    let students = roster.filter(s => s.period === periodId);

    // Apply search query if present
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      students = students.filter(s => s.name.toLowerCase().includes(q));
    }

    // Sort alphabetically
    students.sort((a, b) => a.name.localeCompare(b.name));

    if (students.length === 0) {
      list.innerHTML = `
        <div class="col-span-full py-8 text-center text-gray-500">
          <p class="font-semibold text-lg">No students found for ${targetPeriod ? targetPeriod.name : 'this period'}.</p>
          <p class="text-xs mt-1">Teachers can add or sync students in the Teacher Dashboard.</p>
        </div>
      `;
      return;
    }

    let html = '';
    students.forEach(st => {
      const isOut = activePass && activePass.studentId === st.id;
      const isOnWaitlist = waitList.some(item => item.studentId === st.id);
      const isRestricted = !!st.restrictions;

      let disabled = false;
      let badge = '';

      if (isOut) {
        disabled = true;
        badge = '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full ml-auto">Currently Out</span>';
      } else if (isOnWaitlist) {
        disabled = true;
        badge = '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full ml-auto">On Wait List</span>';
      } else if (isRestricted) {
        badge = `<span class="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded-full ml-auto" title="${st.restrictions}">Restricted</span>`;
      }

      html += `
        <button type="button" data-id="${st.id}" ${disabled ? 'disabled' : ''} class="student-select-card flex items-center p-4 rounded-xl border-2 text-left transition-all ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200' : 'bg-white hover:bg-blue-50 border-gray-200 hover:border-blue-500 shadow-sm active:scale-95'}">
          <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-black flex items-center justify-center mr-3 text-base">
            ${st.name.charAt(0)}
          </div>
          <div>
            <div class="font-bold text-gray-900 text-lg">${st.name}</div>
            ${st.restrictions ? `<div class="text-xs text-rose-600 font-semibold">${st.restrictions}</div>` : ''}
          </div>
          ${badge}
        </button>
      `;
    });

    list.innerHTML = html;

    // Attach click handlers
    list.querySelectorAll('.student-select-card:not([disabled])').forEach(card => {
      card.addEventListener('click', () => {
        const sid = card.dataset.id;
        const student = roster.find(s => s.id === sid);
        if (student) {
          this.handleStudentSelected(student);
        }
      });
    });
  }

  // Handle student selected from picker
  handleStudentSelected(student) {
    this.selectedStudent = student;
    const pickerModal = document.getElementById('student-picker-modal'); if (pickerModal) pickerModal.classList.add('hidden');

    if (this.pickerMode === 'waitlist') {
      const evaluation = this.scheduleEngine.evaluate();
      const targetP = evaluation.currentPeriod || evaluation.nextPeriod;
      this.queueManager.addToWaitList(student, targetP);
      this.showToast(`Added ${student.name} to the wait list!`, 'success');
      this.updateState();
      return;
    }

    // If Sign Out mode: check restrictions
    if (student.restrictions) {
      if (!confirm(`Note for ${student.name}: "${student.restrictions}"\n\nDo you want to proceed with signing out?`)) {
        return;
      }
    }

    // Open Destination Picker Modal
    this.openDestinationPicker();
  }

  openDestinationPicker() {
    const modal = document.getElementById('destination-modal');
    const studentLabel = document.getElementById('destination-student-name');
    if (studentLabel) studentLabel.textContent = this.selectedStudent ? this.selectedStudent.name : 'Student';
    
    // Reset custom inputs
    const tb = document.getElementById('dest-teacher-input-box'); if (tb) tb.classList.add('hidden');
    const cb = document.getElementById('dest-custom-input-box'); if (cb) cb.classList.add('hidden');
    const inputT = document.getElementById('input-dest-teacher');
    const inputC = document.getElementById('input-dest-custom');
    if (inputT) inputT.value = '';
    if (inputC) inputC.value = '';

    if (modal) modal.classList.remove('hidden');
  }

  handleDestinationSelected(dest) {
    if (dest === 'Another Teacher' || dest === 'teacher') {
      const cb = document.getElementById('dest-custom-input-box'); if (cb) cb.classList.add('hidden');
      const box = document.getElementById('dest-teacher-input-box');
      if (box) box.classList.remove('hidden');
      const it = document.getElementById('input-dest-teacher'); if (it) it.focus();
      return;
    }

    if (dest === 'Other' || dest === 'other') {
      const tb = document.getElementById('dest-teacher-input-box'); if (tb) tb.classList.add('hidden');
      const box = document.getElementById('dest-custom-input-box');
      if (box) box.classList.remove('hidden');
      const ic = document.getElementById('input-dest-custom'); if (ic) ic.focus();
      return;
    }

    this.selectedDestination = dest;
    this.selectedDestinationDetail = '';
    this.openCourtesyReminderModal();
  }

  submitTeacherDestination() {
    const teacherInput = document.getElementById('input-dest-teacher');
    const name = teacherInput ? teacherInput.value.trim() : '';
    if (!name) {
      alert('Please enter the name of the teacher you are visiting.');
      if (teacherInput) teacherInput.focus();
      return;
    }
    this.selectedDestination = 'Another Teacher';
    this.selectedDestinationDetail = name;
    this.openCourtesyReminderModal();
  }

  submitCustomDestination() {
    const customInput = document.getElementById('input-dest-custom');
    const desc = customInput ? customInput.value.trim() : '';
    if (!desc) {
      alert('Please enter your destination details.');
      if (customInput) customInput.focus();
      return;
    }
    this.selectedDestination = 'Other';
    this.selectedDestinationDetail = desc;
    this.openCourtesyReminderModal();
  }

  openCourtesyReminderModal() {
    const dm = document.getElementById('destination-modal'); if (dm) dm.classList.add('hidden');
    const modal = document.getElementById('courtesy-modal');
    const studentNameEl = document.getElementById('courtesy-student-name');
    const destEl = document.getElementById('courtesy-destination');
    const msgEl = document.getElementById('courtesy-message-text');
    const settings = this.storage.getSettings();

    if (studentNameEl) studentNameEl.textContent = this.selectedStudent ? this.selectedStudent.name : '';
    if (destEl) destEl.textContent = this.selectedDestination + (this.selectedDestinationDetail ? ` (${this.selectedDestinationDetail})` : '');
    if (msgEl) msgEl.textContent = settings.courtesyMessage || 'Please make your trip as quick as possible to respect classmates and minimize loss of instruction.';

    if (modal) modal.classList.remove('hidden');
  }

  handleConfirmSignOut() {
    if (!this.selectedStudent) return;

    const cm = document.getElementById('courtesy-modal'); 
    if (cm) cm.classList.add('hidden');

    const isNoPass = !!this.selectedStudent.noPass || 
      (this.selectedStudent.restrictions && this.selectedStudent.restrictions.trim().length > 0);

    const evaluation = this.scheduleEngine.evaluate();
    const currentPeriod = evaluation.currentPeriod || { id: 'p1', name: 'Class' };

    if (isNoPass) {
      // 1. Create a Pending Approval Request
      const pendingReq = {
        id: 'req_' + Date.now(),
        studentId: this.selectedStudent.id,
        studentName: this.selectedStudent.name,
        periodId: currentPeriod.id,
        periodName: currentPeriod.name,
        destination: this.selectedDestination || 'Restroom',
        destinationDetail: this.selectedDestinationDetail || '',
        restrictionReason: this.selectedStudent.restrictions || 'On No Hall Pass List',
        timestamp: Date.now(),
        status: 'pending'
      };

      this.storage.savePendingApproval(pendingReq);

      // 2. Open the Waiting for Approval Modal on Kiosk
      this.openApprovalWaitModal(pendingReq);
      return;
    }

    try {
      this.queueManager.signOut(
        this.selectedStudent,
        this.selectedDestination || 'Restroom',
        this.selectedDestinationDetail,
        evaluation.currentPeriod
      );
      this.showToast(`${this.selectedStudent.name} is now signed out!`, 'success');
      this.updateState();
    } catch (err) {
      alert(err.message);
    }
  }

  openApprovalWaitModal(req) {
    const modal = document.getElementById('approval-wait-modal');
    const nameEl = document.getElementById('approval-student-name');
    const reasonEl = document.getElementById('approval-reason-text');

    if (nameEl) nameEl.textContent = req.studentName;
    if (reasonEl) reasonEl.textContent = req.restrictionReason || 'No Hall Pass List';

    if (modal) modal.classList.remove('hidden');
  }

  // Handle student check-in / return
  handleStudentSignIn() {
    const evaluation = this.scheduleEngine.evaluate();
    const settings = this.storage.getSettings();
    const waitListEnabled = settings.waitListEnabled !== false;
    const isHoldActive = evaluation.state === 'BLACKOUT' || !waitListEnabled;
    const res = this.queueManager.signIn('completed', isHoldActive);

    if (res.completedPass) {
      this.showToast(`Welcome back, ${res.completedPass.studentName}! (${this.scheduleEngine.formatDuration(res.completedPass.durationSeconds)})`, 'success');
    }

    // If nextInLine is available and hold/blackout is NOT active and waitListEnabled is true
    if (res.nextInLine && !isHoldActive && waitListEnabled) {
      this.promptNextStudent(res.nextInLine);
    } else {
      this.updateState();
    }
  }

  // Prompt the next student in line
  promptNextStudent(nextStudent) {
    this.queueManager.nextPromptStudent = nextStudent;
    const roster = this.storage.getRoster() || [];
    const fullStudent = roster.find(s => s.id === nextStudent.studentId) || {
      id: nextStudent.studentId,
      name: nextStudent.studentName,
      period: nextStudent.periodId,
      noPass: nextStudent.noPass,
      restrictions: nextStudent.restrictions
    };
    this.selectedStudent = fullStudent;

    const modal = document.getElementById('next-student-modal');
    const nameEl = document.getElementById('next-student-name');
    if (nameEl) nameEl.textContent = nextStudent.studentName;

    // Reset destination choices on next prompt
    const destSelect = document.getElementById('next-student-destination-select');
    if (destSelect) destSelect.value = 'Restroom';
    const ndt = document.getElementById('next-dest-teacher-box'); if (ndt) ndt.classList.add('hidden');
    const teacherInput = document.getElementById('input-next-dest-teacher');
    if (teacherInput) teacherInput.value = '';

    this.selectedDestination = 'Restroom';
    this.selectedDestinationDetail = '';

    if (modal) modal.classList.remove('hidden');
    this.sounds.play('next');
  }

  handleNextStudentSignOut() {
    const destSelect = document.getElementById('next-student-destination-select');
    const dest = destSelect ? destSelect.value : 'Restroom';
    let detail = '';

    if (dest === 'Another Teacher') {
      const teacherInput = document.getElementById('input-next-dest-teacher');
      detail = teacherInput ? teacherInput.value.trim() : '';
      if (!detail) {
        alert('Please enter the name of the teacher you are visiting.');
        if (teacherInput) teacherInput.focus();
        return;
      }
    }
    
    const evaluation = this.scheduleEngine.evaluate();
    const currentPeriod = evaluation.currentPeriod || { id: 'p1', name: 'Class' };
    const nsm = document.getElementById('next-student-modal');
    if (nsm) nsm.classList.add('hidden');

    const isNoPass = !!this.selectedStudent.noPass || 
      (this.selectedStudent.restrictions && this.selectedStudent.restrictions.trim().length > 0);

    if (isNoPass) {
      const pendingReq = {
        id: 'req_' + Date.now(),
        studentId: this.selectedStudent.id,
        studentName: this.selectedStudent.name,
        periodId: currentPeriod.id,
        periodName: currentPeriod.name,
        destination: dest,
        destinationDetail: detail,
        restrictionReason: this.selectedStudent.restrictions || 'On No Hall Pass List',
        timestamp: Date.now(),
        status: 'pending'
      };

      this.storage.savePendingApproval(pendingReq);
      this.openApprovalWaitModal(pendingReq);
      return;
    }

    try {
      this.queueManager.signOut(
        this.selectedStudent,
        dest,
        detail,
        evaluation.currentPeriod
      );
      this.showToast(`${this.selectedStudent.name} is now signed out!`, 'success');
      this.updateState();
    } catch (err) {
      alert(err.message);
    }
  }

  // Next student says "I no longer need to leave"
  handleNextStudentCancelled() {
    const cancelledName = this.selectedStudent ? this.selectedStudent.name : 'Student';
    const nsm = document.getElementById('next-student-modal'); if (nsm) nsm.classList.add('hidden');

    this.showToast(`${cancelledName} cancelled. Advancing to next student in line.`, 'info');
    const next = this.queueManager.cancelPromptAndAdvance();

    if (next) {
      setTimeout(() => this.promptNextStudent(next), 300);
    } else {
      this.updateState();
    }
  }

  // Toast notifications
  showToast(message, type = 'info') {
    const toast = document.getElementById('kiosk-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-50 transition-all duration-300 ${
      type === 'success' ? 'bg-emerald-700 text-white' : type === 'warning' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-white'
    }`;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  isModalOpen() {
    const modals = document.querySelectorAll('.modal-container:not(.hidden)');
    return modals.length > 0;
  }

  // Time Machine / Simulation Bar controller
  initSimulator() {
    const toggleBarBtn = document.getElementById('btn-toggle-sim-bar');
    const simBar = document.getElementById('simulator-bar');
    const simToggle = document.getElementById('sim-enabled-toggle');
    const simTimeInput = document.getElementById('sim-time-input');
    const badge = document.getElementById('sim-mode-badge');

    if (toggleBarBtn && simBar) {
      toggleBarBtn.addEventListener('click', () => {
        simBar.classList.toggle('hidden');
      });
    }

    const simState = this.storage.getTimeSimulation();
    if (simToggle) {
      simToggle.checked = !!simState.enabled;
      simToggle.addEventListener('change', (e) => {
        simState.enabled = e.target.checked;
        this.storage.saveTimeSimulation(simState);
        if (badge) badge.classList.toggle('hidden', !simState.enabled);
        this.updateClockAndState();
      });
    }

    if (simTimeInput) {
      simTimeInput.value = simState.simulatedTime || '09:45';
      simTimeInput.addEventListener('change', (e) => {
        simState.simulatedTime = e.target.value;
        this.storage.saveTimeSimulation(simState);
        this.updateClockAndState();
      });
    }

    if (badge) badge.classList.toggle('hidden', !simState.enabled);

    // Preset buttons
    document.querySelectorAll('.btn-sim-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const time = btn.dataset.time;
        if (simToggle) simToggle.checked = true;
        if (simTimeInput) simTimeInput.value = time;
        simState.enabled = true;
        simState.simulatedTime = time;
        this.storage.saveTimeSimulation(simState);
        if (badge) badge.classList.remove('hidden');
        this.updateClockAndState();
      });
    });
  }
}

// Universal resilient bootstrap for iPad Safari, Chrome, Edge, and all platforms
function bootstrapHallPassApp() {
  try {
    if (!window.hallPassApp) {
      window.hallPassApp = new HallPassApp();
      window.hallPassApp.init();
      console.log('Classroom Hall Pass App successfully booted on ' + (navigator.userAgent || 'client'));
    }
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
}

if (typeof document !== 'undefined' && document) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapHallPassApp);
  } else {
    // If DOM is already interactive/complete (common on iPad Safari network load), boot immediately
    bootstrapHallPassApp();
  }
}
