// Main Classroom Hall Pass Application Coordinator

import { storage } from './storage.js';
import { sounds } from './audio.js';
import { ScheduleEngine } from './scheduleEngine.js';
import { QueueManager } from './queueManager.js';
import { RosterSync } from './rosterSync.js';
import { AnalyticsEngine } from './analytics.js';
import { TeacherDashboard } from './dashboard.js';

class HallPassApp {
  constructor() {
    this.storage = storage;
    this.sounds = sounds;
    this.scheduleEngine = new ScheduleEngine(storage);
    this.queueManager = new QueueManager(storage, sounds);
    this.rosterSync = new RosterSync(storage);
    this.analytics = new AnalyticsEngine(storage, this.scheduleEngine);
    this.dashboard = new TeacherDashboard(
      storage,
      this.scheduleEngine,
      this.queueManager,
      this.rosterSync,
      this.analytics,
      sounds
    );

    this.selectedStudent = null;
    this.selectedDestination = null;
    this.selectedDestinationDetail = '';
    this.previousState = null;
    this.wakeLock = null;
    this.tickInterval = null;
  }

  init() {
    this.dashboard.init();
    this.bindKioskEvents();
    this.bindSimulatorEvents();
    this.initWakeLock();

    // Listen for state change events from dashboard
    window.addEventListener('hallpass:statechange', () => {
      this.updateState();
    });

    // Start 1-second master loop
    this.tick();
    this.tickInterval = setInterval(() => this.tick(), 1000);

    console.log('Classroom Hall Pass App initialized successfully.');
  }

  // Master 1-second tick
  tick() {
    this.updateClock();
    this.updateElapsedTimer();
    this.updateState();
  }

  // Update header clock
  updateClock() {
    const effective = this.scheduleEngine.getEffectiveTime();
    const clockEl = document.getElementById('kiosk-live-clock');
    const simBadge = document.getElementById('sim-mode-badge');

    if (clockEl) {
      const parts = effective.timeStr.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      const s = effective.seconds !== undefined ? effective.seconds : new Date().getSeconds();
      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      clockEl.textContent = `${hour12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${period}`;
    }

    if (simBadge) {
      if (effective.isSimulated) {
        simBadge.classList.remove('hidden');
      } else {
        simBadge.classList.add('hidden');
      }
    }
  }

  // Update live elapsed timer on active pass
  updateElapsedTimer() {
    const activePass = this.queueManager.getActivePass();
    const timerEl = document.getElementById('red-elapsed-timer');
    const timerBlackEl = document.getElementById('black-elapsed-timer');

    if (activePass) {
      const elapsedSec = Math.max(0, Math.round((Date.now() - activePass.signOutTime) / 1000));
      const formatted = this.scheduleEngine.formatDurationTimer(elapsedSec);
      if (timerEl) timerEl.textContent = formatted;
      if (timerBlackEl) timerBlackEl.textContent = formatted;
    }
  }

  // Core State Evaluation and UI switching
  updateState() {
    const evaluation = this.scheduleEngine.evaluate();
    const activePass = this.queueManager.getActivePass();
    const waitList = this.queueManager.getWaitList();
    const settings = this.storage.getSettings();

    // Update Header Period Label
    const periodLabel = document.getElementById('kiosk-period-label');
    if (periodLabel) {
      if (evaluation.currentPeriod) {
        periodLabel.textContent = `${evaluation.currentPeriod.name} (${this.scheduleEngine.formatTime12Hour(evaluation.currentPeriod.start)} - ${this.scheduleEngine.formatTime12Hour(evaluation.currentPeriod.end)})`;
      } else if (evaluation.nextPeriod) {
        periodLabel.textContent = `Passing Period → ${evaluation.nextPeriod.name} at ${this.scheduleEngine.formatTime12Hour(evaluation.nextPeriod.start)}`;
      } else {
        periodLabel.textContent = evaluation.title;
      }
    }

    // Check for automatic waitlist purge on Last-10-minute blackout transition
    if (evaluation.purgeWaitlist && (waitList.length > 0 || this.queueManager.nextPromptStudent)) {
      this.queueManager.purgeWaitList('Last 10 minutes of class blackout');
      this.showToast('Wait list cleared for end-of-class dismissal preparation.', 'info');
    }

    // Screens references
    const greenScreen = document.getElementById('screen-green');
    const redScreen = document.getElementById('screen-red');
    const blackScreen = document.getElementById('screen-black');

    // Hide all screens initially
    [greenScreen, redScreen, blackScreen].forEach(s => s && s.classList.add('hidden'));

    // 1. If currently in BLACKOUT
    if (evaluation.state === 'BLACKOUT') {
      if (blackScreen) {
        blackScreen.classList.remove('hidden');
        document.body.className = 'bg-black text-white min-h-screen flex flex-col font-sans transition-colors duration-500 select-none';

        // Set Blackout Details
        document.getElementById('blackout-title').textContent = evaluation.title;
        document.getElementById('blackout-reason').textContent = evaluation.reason;

        // If a student is currently out during blackout (e.g. Zoey at 10:15)
        const blackoutActiveBox = document.getElementById('blackout-active-student-box');
        if (activePass) {
          blackoutActiveBox.classList.remove('hidden');
          document.getElementById('blackout-student-name').textContent = activePass.studentName;
          document.getElementById('blackout-destination').textContent = `${activePass.destination} ${activePass.destinationDetail ? '(' + activePass.destinationDetail + ')' : ''}`;
          document.getElementById('btn-blackout-signin-name').textContent = `${activePass.studentName} is Back / Sign In`;
        } else {
          blackoutActiveBox.classList.add('hidden');
        }

        // Waitlist button in Blackout (allowed in first 10 min & passing period)
        const btnBlackoutWaitlist = document.getElementById('btn-blackout-waitlist');
        if (btnBlackoutWaitlist) {
          if (evaluation.canWaitlist) {
            btnBlackoutWaitlist.classList.remove('hidden');
            const targetP = evaluation.currentPeriod || evaluation.nextPeriod;
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

        // Render Waitlist Queue Widget on Red Screen
        this.renderRedWaitlistWidget(waitList);
      }
    } 
    // 3. PASS AVAILABLE (Green Screen)
    else {
      if (greenScreen) {
        greenScreen.classList.remove('hidden');
        document.body.className = 'bg-emerald-600 text-white min-h-screen flex flex-col font-sans transition-colors duration-500 select-none';

        // Check if there are waitlisted students ready to be called
        if (waitList.length > 0 && !this.queueManager.nextPromptStudent && !this.isModalOpen()) {
          const next = waitList.shift();
          this.storage.saveWaitList(waitList);
          this.promptNextStudent(next);
        }
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

    // 4. Blackout Screen -> Sign In Button (for active student returning during blackout)
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

    // 9. Confirm Sign Out button
    const btnConfirmSignOut = document.getElementById('btn-confirm-signout');
    if (btnConfirmSignOut) {
      btnConfirmSignOut.addEventListener('click', () => {
        this.handleConfirmSignOut();
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
    const periodId = targetPeriod ? targetPeriod.id : 'p2';

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
    document.getElementById('student-picker-modal')?.classList.add('hidden');

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
    document.getElementById('dest-teacher-input-box')?.classList.add('hidden');
    document.getElementById('dest-custom-input-box')?.classList.add('hidden');
    document.getElementById('input-dest-teacher').value = '';
    document.getElementById('input-dest-custom').value = '';

    if (modal) modal.classList.remove('hidden');
  }

  handleDestinationSelected(dest) {
    if (dest === 'teacher') {
      const box = document.getElementById('dest-teacher-input-box');
      box?.classList.remove('hidden');
      document.getElementById('input-dest-teacher')?.focus();
      return;
    }

    if (dest === 'other') {
      const box = document.getElementById('dest-custom-input-box');
      box?.classList.remove('hidden');
      document.getElementById('input-dest-custom')?.focus();
      return;
    }

    this.selectedDestination = dest;
    this.selectedDestinationDetail = '';
    this.openCourtesyReminderModal();
  }

  openCourtesyReminderModal() {
    document.getElementById('destination-modal')?.classList.add('hidden');
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

    // Check if another teacher or custom destination input was active
    const teacherInput = document.getElementById('input-dest-teacher');
    const customInput = document.getElementById('input-dest-custom');

    if (!document.getElementById('dest-teacher-input-box')?.classList.contains('hidden') && teacherInput && teacherInput.value.trim()) {
      this.selectedDestination = 'Another Teacher';
      this.selectedDestinationDetail = teacherInput.value.trim();
    } else if (!document.getElementById('dest-custom-input-box')?.classList.contains('hidden') && customInput && customInput.value.trim()) {
      this.selectedDestination = 'Other';
      this.selectedDestinationDetail = customInput.value.trim();
    }

    const evaluation = this.scheduleEngine.evaluate();
    try {
      this.queueManager.signOut(
        this.selectedStudent,
        this.selectedDestination || 'Restroom',
        this.selectedDestinationDetail,
        evaluation.currentPeriod
      );
      document.getElementById('courtesy-modal')?.classList.add('hidden');
      this.showToast(`${this.selectedStudent.name} is now signed out!`, 'success');
      this.updateState();
    } catch (err) {
      alert(err.message);
    }
  }

  // Handle student check-in / return
  handleStudentSignIn() {
    const res = this.queueManager.signIn();
    if (res.completedPass) {
      this.showToast(`Welcome back, ${res.completedPass.studentName}! (${this.scheduleEngine.formatDuration(res.completedPass.durationSeconds)})`, 'success');
    }

    // Check if next student in queue should be called
    if (res.nextInLine) {
      this.promptNextStudent(res.nextInLine);
    } else {
      this.updateState();
    }
  }

  // Prompt the next student in line
  promptNextStudent(nextStudent) {
    this.queueManager.nextPromptStudent = nextStudent;
    this.selectedStudent = {
      id: nextStudent.studentId,
      name: nextStudent.studentName,
      period: nextStudent.periodId
    };

    const modal = document.getElementById('next-student-modal');
    const nameEl = document.getElementById('next-student-name');
    if (nameEl) nameEl.textContent = nextStudent.studentName;

    // Reset destination choices on next prompt
    this.selectedDestination = 'restroom';
    this.selectedDestinationDetail = '';

    if (modal) modal.classList.remove('hidden');
    this.sounds.play('next');
  }

  handleNextStudentSignOut() {
    const destSelect = document.getElementById('next-student-destination-select');
    const dest = destSelect ? destSelect.value : 'Restroom';
    
    const evaluation = this.scheduleEngine.evaluate();
    try {
      this.queueManager.signOut(
        this.selectedStudent,
        dest,
        '',
        evaluation.currentPeriod
      );
      document.getElementById('next-student-modal')?.classList.add('hidden');
      this.showToast(`${this.selectedStudent.name} is now signed out!`, 'success');
      this.updateState();
    } catch (err) {
      alert(err.message);
    }
  }

  handleNextStudentCancelled() {
    // Next student clicked 'I no longer need to leave'
    const studentName = this.selectedStudent ? this.selectedStudent.name : 'Student';
    document.getElementById('next-student-modal')?.classList.add('hidden');
    this.showToast(`${studentName} was removed from the wait list.`, 'info');

    const nextInLine = this.queueManager.cancelPromptAndAdvance();
    if (nextInLine) {
      this.promptNextStudent(nextInLine);
    } else {
      this.updateState();
    }
  }

  isModalOpen() {
    const modals = document.querySelectorAll('.modal-container:not(.hidden)');
    return modals.length > 0;
  }

  // Toast notification banner
  showToast(message, type = 'info') {
    const toast = document.getElementById('kiosk-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-bold shadow-2xl z-50 transition-all duration-300 ${type === 'success' ? 'bg-emerald-800 text-white' : type === 'warning' ? 'bg-amber-800 text-white' : 'bg-gray-900 text-white'}`;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }

  // Screen Wake Lock API for iPads and Chromebooks
  async initWakeLock() {
    const settings = this.storage.getSettings();
    if (settings.wakeLockEnabled === false) return;

    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible') {
            this.wakeLock = await navigator.wakeLock.request('screen');
          }
        });
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  }

  // Time Simulator Controls
  bindSimulatorEvents() {
    const simBar = document.getElementById('simulator-bar');
    const btnToggleSim = document.getElementById('btn-toggle-sim-bar');
    const simEnabledCheck = document.getElementById('sim-enabled-toggle');
    const simTimeInput = document.getElementById('sim-time-input');

    if (btnToggleSim && simBar) {
      btnToggleSim.addEventListener('click', () => {
        simBar.classList.toggle('hidden');
      });
    }

    const simConfig = this.storage.getTimeSimulation();
    if (simEnabledCheck) {
      simEnabledCheck.checked = !!simConfig.enabled;
      simEnabledCheck.addEventListener('change', (e) => {
        simConfig.enabled = e.target.checked;
        simConfig.simulatedTime = simTimeInput ? simTimeInput.value : '09:45';
        this.storage.saveTimeSimulation(simConfig);
        this.updateState();
      });
    }

    if (simTimeInput) {
      simTimeInput.value = simConfig.simulatedTime || '09:45';
      simTimeInput.addEventListener('change', (e) => {
        simConfig.simulatedTime = e.target.value;
        this.storage.saveTimeSimulation(simConfig);
        this.updateState();
      });
    }

    // Scenario preset buttons
    document.querySelectorAll('.btn-sim-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const time = btn.dataset.time;
        if (simTimeInput) simTimeInput.value = time;
        if (simEnabledCheck) simEnabledCheck.checked = true;
        simConfig.enabled = true;
        simConfig.simulatedTime = time;
        this.storage.saveTimeSimulation(simConfig);
        this.updateState();
      });
    });
  }
}

// Bootstrap app on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new HallPassApp();
  window.hallPassApp = app;
  app.init();
});
