// Classroom Hall Pass Kiosk - Universal Multi-Device Application
(function(window, document) {
  'use strict';

  // Global on-screen diagnostic notification
  window.addEventListener('error', function(e) {
    console.error('Kiosk runtime error:', e);
    var errBox = document.getElementById('kiosk-fatal-error');
    if (!errBox && document.body) {
      errBox = document.createElement('div');
      errBox.id = 'kiosk-fatal-error';
      errBox.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#ffffff;padding:12px;font-family:sans-serif;font-size:13px;font-weight:bold;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.5);text-align:center;';
      document.body.appendChild(errBox);
    }
    if (errBox) {
      errBox.innerHTML = '⚠️ Kiosk Notice: ' + (e.message || 'Error running application') + (e.lineno ? ' (Line ' + e.lineno + ')' : '');
    }
  });

  // --- AUDIO MODULE ---
  ﻿// Web Audio API Sound Generator for Classroom Hall Pass Kiosk

class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioCtx && (typeof window !== 'undefined')) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      } catch (e) {
        console.warn('AudioContext creation note:', e);
      }
    }
  }

  play(type = 'checkout') {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;

      if (type === 'checkout') {
        this.createTone(587.33, now, 0.15, 'sine', 0.2); // D5
        this.createTone(880.00, now + 0.12, 0.28, 'sine', 0.25); // A5
      } else if (type === 'checkin') {
        this.createTone(523.25, now, 0.12, 'sine', 0.2); // C5
        this.createTone(659.25, now + 0.1, 0.12, 'sine', 0.2); // E5
        this.createTone(783.99, now + 0.2, 0.3, 'sine', 0.25); // G5
      } else if (type === 'next') {
        this.createTone(440.00, now, 0.1, 'sine', 0.25); // A4
        this.createTone(659.25, now + 0.1, 0.1, 'sine', 0.25); // E5
        this.createTone(880.00, now + 0.2, 0.35, 'sine', 0.3); // A5
      } else if (type === 'warning') {
        this.createTone(349.23, now, 0.18, 'triangle', 0.2); // F4
        this.createTone(293.66, now + 0.15, 0.25, 'triangle', 0.2); // D4
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  createTone(freq, startTime, duration, type = 'sine', volume = 0.2) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {}
  }
}

const sounds = new SoundEffects();


  // --- STORAGE MODULE ---
  // Storage and Data Management Layer with Multi-Teacher / Room Profile support

function getRoomPrefix() {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || params.get('teacher') || params.get('class');
    if (room) {
      return 'hallpass_' + room.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_';
    }
  }
  return 'hallpass_';
}

const STORAGE_KEYS = {
  SCHEDULES: 'schedules',
  BLACKOUT_RULES: 'blackout_rules',
  ROSTER: 'roster',
  SETTINGS: 'settings',
  ACTIVE_PASS: 'active_pass',
  WAIT_LIST: 'wait_list',
  HISTORY: 'history',
  TIME_SIMULATION: 'time_simulation'
};

// Default Bell Schedules as requested:
// 1st Period: 8:40 to 9:30
// 2nd Period: 9:35 to 10:25
// 3rd Period: 10:30 to 11:20
// 4th Period: 11:25 to 12:35
// 5th Period: 12:40 to 1:30
// 6th Period: 1:35 to 2:25
// 7th Period: 2:30 to 3:20
const DEFAULT_SCHEDULES = [
  { id: 'p1', name: '1st Period', start: '08:40', end: '09:30' },
  { id: 'p2', name: '2nd Period', start: '09:35', end: '10:25' },
  { id: 'p3', name: '3rd Period', start: '10:30', end: '11:20' },
  { id: 'p4', name: '4th Period', start: '11:25', end: '12:35' },
  { id: 'p5', name: '5th Period', start: '12:40', end: '13:30' },
  { id: 'p6', name: '6th Period', start: '13:35', end: '14:25' },
  { id: 'p7', name: '7th Period', start: '14:30', end: '15:20' }
];

// Default Blackout Rules:
// - First 10 minutes of each class
// - First 20 minutes of school day (8:40 to 9:00 am)
// - Last 20 minutes of school day (3:00 to 3:20 pm)
// - Last 10 minutes of regular classes
const DEFAULT_BLACKOUT_RULES = {
  firstMinutes: 10,
  firstMinutesWaitlistAllowed: true,
  lastMinutes: 10,
  lastMinutesPurgeWaitlist: true,
  passingPeriodBlackout: true,
  emergencyLockdown: false,
  lockdownReason: '',
  customBlackouts: [
    {
      id: 'cb_start_day',
      name: 'Start of School Day (First 20 min)',
      periodId: 'p1',
      start: '08:40',
      end: '09:00',
      reason: 'No hall passes during the first 20 minutes of the school day (8:40 AM to 9:00 AM).',
      canWaitlist: true,
      purgeWaitlist: false
    },
    {
      id: 'cb_end_day',
      name: 'End of School Day (Last 20 min)',
      periodId: 'p7',
      start: '15:00',
      end: '15:20',
      reason: 'No hall passes during the last 20 minutes of the school day (3:00 PM to 3:20 PM). Dismissal preparation.',
      canWaitlist: false,
      purgeWaitlist: true
    }
  ]
};

const DEFAULT_ROSTER = [
  // 1st Period
  { id: 's_alex', name: 'Alex M.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_ben', name: 'Benjamin K.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_chloe', name: 'Chloe T.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_david', name: 'David R.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_elena', name: 'Elena V.', period: 'p1', restrictions: '', notes: '' },

  // 2nd Period
  { id: 's_naomi', name: 'Naomi', period: 'p2', restrictions: '', notes: 'Honor Roll' },
  { id: 's_amari', name: 'Amari', period: 'p2', restrictions: '', notes: '' },
  { id: 's_emily', name: 'Emily', period: 'p2', restrictions: '', notes: '' },
  { id: 's_derek', name: 'Derek', period: 'p2', restrictions: '', notes: '' },
  { id: 's_zoey', name: 'Zoey', period: 'p2', restrictions: '', notes: '' },
  { id: 's_caitlin', name: 'Caitlin', period: 'p2', restrictions: '', notes: '' },
  { id: 's_marcus', name: 'Marcus', period: 'p2', restrictions: '', notes: '' },
  { id: 's_sophia', name: 'Sophia', period: 'p2', restrictions: '', notes: '' },
  { id: 's_lucas', name: 'Lucas', period: 'p2', restrictions: '', notes: '' },
  { id: 's_maya', name: 'Maya', period: 'p2', restrictions: '', notes: '' },

  // 3rd Period
  { id: 's_ethan', name: 'Ethan W.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_grace', name: 'Grace H.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_isaac', name: 'Isaac B.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_jasmine', name: 'Jasmine L.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_kyle', name: 'Kyle N.', period: 'p3', restrictions: '', notes: '' },

  // 4th Period
  { id: 's_liam', name: 'Liam S.', period: 'p4', restrictions: '', notes: '' },
  { id: 's_mia', name: 'Mia D.', period: 'p4', restrictions: '', notes: '' },
  { id: 's_noah', name: 'Noah C.', period: 'p4', restrictions: '', notes: '' },

  // 5th Period
  { id: 's_oliver', name: 'Oliver P.', period: 'p5', restrictions: '', notes: '' },
  { id: 's_penelope', name: 'Penelope G.', period: 'p5', restrictions: '', notes: '' },

  // 6th Period
  { id: 's_quinn', name: 'Quinn T.', period: 'p6', restrictions: '', notes: '' },
  { id: 's_riley', name: 'Riley M.', period: 'p6', restrictions: '', notes: '' },

  // 7th Period
  { id: 's_samuel', name: 'Samuel V.', period: 'p7', restrictions: '', notes: '' },
  { id: 's_tara', name: 'Tara B.', period: 'p7', restrictions: '', notes: '' }
];

const DEFAULT_SETTINGS = {
  roomName: 'Main Classroom',
  roomCode: 'ROBERTS',
  emergencyTeachers: 'Mr. Roberts or Mr. Hoerter',
  pin: '1234',
  googleSheetUrl: '',
  googleSheetGid: '0',
  autoSyncMinutes: 10,
  lastSyncTime: null,
  waitListEnabled: true,
  audioEnabled: true,
  wakeLockEnabled: true,
  maxTripDurationMins: 10,
  courtesyMessage: 'Please make your trip as quick as possible to respect classmates and minimize loss of instruction.'
};

const SAMPLE_HISTORY = [];

class StorageManager {
  constructor() {
    this.memoryFallback = {};
    this.prefix = getRoomPrefix();
  }

  getKey(keyName) {
    return this.prefix + keyName;
  }

  get(key, defaultValue) {
    const fullKey = this.getKey(key);
    try {
      if (typeof localStorage !== 'undefined') {
        const item = localStorage.getItem(fullKey);
        if (item !== null) {
          return JSON.parse(item);
        }
      }
    } catch (e) {
      console.warn('Storage get error for key ' + fullKey, e);
    }
    return this.memoryFallback[fullKey] !== undefined ? this.memoryFallback[fullKey] : defaultValue;
  }

  set(key, value, source = 'local') {
    const fullKey = this.getKey(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(fullKey, JSON.stringify(value));
      }
    } catch (e) {
      console.warn('Storage set error for key ' + fullKey, e);
    }
    this.memoryFallback[fullKey] = value;

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('hallpass:statechange', { detail: { key, source } }));
    }
  }

  getSchedules() {
    return this.get(STORAGE_KEYS.SCHEDULES, DEFAULT_SCHEDULES);
  }

  saveSchedules(schedules, source = 'local') {
    this.set(STORAGE_KEYS.SCHEDULES, schedules, source);
  }

  getBlackoutRules() {
    const rules = this.get(STORAGE_KEYS.BLACKOUT_RULES, DEFAULT_BLACKOUT_RULES);
    return { ...DEFAULT_BLACKOUT_RULES, ...rules };
  }

  saveBlackoutRules(rules, source = 'local') {
    this.set(STORAGE_KEYS.BLACKOUT_RULES, rules, source);
  }

  getRoster() {
    return this.get(STORAGE_KEYS.ROSTER, DEFAULT_ROSTER);
  }

  saveRoster(roster, source = 'local') {
    this.set(STORAGE_KEYS.ROSTER, roster, source);
  }

  getSettings() {
    const settings = this.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  saveSettings(settings, source = 'local') {
    this.set(STORAGE_KEYS.SETTINGS, settings, source);
  }

  getActivePass() {
    return this.get(STORAGE_KEYS.ACTIVE_PASS, null);
  }

  saveActivePass(pass, source = 'local') {
    this.set(STORAGE_KEYS.ACTIVE_PASS, pass, source);
  }

  getWaitList() {
    return this.get(STORAGE_KEYS.WAIT_LIST, []);
  }

  saveWaitList(list, source = 'local') {
    this.set(STORAGE_KEYS.WAIT_LIST, list, source);
  }

  getHistory() {
    const history = this.get(STORAGE_KEYS.HISTORY, []);
    return history.filter(h => h && h.studentId !== 's_alex' && h.studentName !== 'Alex M.' && h.id !== 'pass_sample_1');
  }

  saveHistory(history, source = 'local') {
    this.set(STORAGE_KEYS.HISTORY, history, source);
  }

  clearHistory() {
    this.saveHistory([]);
  }

  addHistoryRecord(record) {
    const history = this.getHistory();
    history.unshift(record);
    this.saveHistory(history);
    return history;
  }

  getTimeSimulation() {
    return this.get(STORAGE_KEYS.TIME_SIMULATION, {
      enabled: false,
      simulatedTime: '09:45',
      speed: 1
    });
  }

  saveTimeSimulation(sim) {
    this.set(STORAGE_KEYS.TIME_SIMULATION, sim);
  }

  exportConfigJson() {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      schedules: this.getSchedules(),
      blackoutRules: this.getBlackoutRules(),
      settings: this.getSettings()
    }, null, 2);
  }

  importConfigJson(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.schedules) this.saveSchedules(parsed.schedules);
      if (parsed.blackoutRules) this.saveBlackoutRules(parsed.blackoutRules);
      if (parsed.settings) this.saveSettings({ ...this.getSettings(), ...parsed.settings });
      return true;
    } catch (e) {
      console.error('Config import failed', e);
      return false;
    }
  }

  resetToDefaults() {
    this.saveSchedules(DEFAULT_SCHEDULES);
    this.saveBlackoutRules(DEFAULT_BLACKOUT_RULES);
    this.saveRoster(DEFAULT_ROSTER);
    this.saveSettings(DEFAULT_SETTINGS);
    this.saveActivePass(null);
    this.saveWaitList([]);
    this.saveHistory(SAMPLE_HISTORY);
  }
}

const storage = new StorageManager();


  // --- SCHEDULE ENGINE ---
  // Schedule & Blackout Engine for Classroom Hall Pass Kiosk

class ScheduleEngine {
  constructor(storage) {
    this.storage = storage;
  }

  // Converts 'HH:MM' (24-hour) to total minutes from midnight
  timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  // Converts total minutes from midnight to 'HH:MM' 24-hr string
  minutesToTimeString(totalMinutes) {
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = Math.floor(totalMinutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Converts 'HH:MM' to friendly '9:35 AM' format
  formatTime12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':').map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  // Format seconds to 'Xm Ys' or '0s'
  formatDuration(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  }

  // Format timer 'MM:SS'
  formatDurationTimer(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Get date or simulated time representation
  getEffectiveTime() {
    const sim = this.storage.getTimeSimulation();
    if (sim && sim.enabled && sim.simulatedTime) {
      const parts = sim.simulatedTime.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return {
        date: d,
        timeStr: sim.simulatedTime,
        minutes: h * 60 + m,
        seconds: 0,
        isSimulated: true
      };
    }
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return {
      date: now,
      timeStr: timeStr,
      minutes: h * 60 + m,
      seconds: s,
      isSimulated: false
    };
  }

  // Main evaluation logic
  evaluate(overrideTimeStr = null) {
    const schedules = this.storage.getSchedules() || [];
    const blackoutRules = this.storage.getBlackoutRules();
    
    let currentMins = 0;
    let timeStr = '';
    let isSimulated = false;

    if (overrideTimeStr) {
      currentMins = this.timeToMinutes(overrideTimeStr);
      timeStr = overrideTimeStr;
      isSimulated = true;
    } else {
      const effective = this.getEffectiveTime();
      currentMins = effective.minutes;
      timeStr = effective.timeStr;
      isSimulated = effective.isSimulated;
    }

    // 1. Check Emergency Teacher Lockdown / Pause
    if (blackoutRules.emergencyLockdown) {
      return {
        state: 'BLACKOUT',
        reasonType: 'EMERGENCY_LOCKDOWN',
        title: 'Hall Passes Temporarily Paused',
        reason: blackoutRules.lockdownReason || 'Hall passes are temporarily paused by teacher request. Please remain in class.',
        canWaitlist: false,
        purgeWaitlist: false,
        currentPeriod: this.findPeriodForMinutes(schedules, currentMins),
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    // Sort periods chronologically
    const sortedSchedules = [...schedules].sort((a, b) => this.timeToMinutes(a.start) - this.timeToMinutes(b.start));

    if (sortedSchedules.length === 0) {
      return {
        state: 'BLACKOUT',
        reasonType: 'NO_SCHEDULE',
        title: 'No Class Schedule Configured',
        reason: 'Please configure class periods in the Teacher Dashboard.',
        canWaitlist: false,
        purgeWaitlist: false,
        currentPeriod: null,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    const firstPeriodStart = this.timeToMinutes(sortedSchedules[0].start);
    const lastPeriodEnd = this.timeToMinutes(sortedSchedules[sortedSchedules.length - 1].end);

    // Before school hours
    if (currentMins < firstPeriodStart) {
      const nextP = sortedSchedules[0];
      return {
        state: 'BLACKOUT',
        reasonType: 'BEFORE_SCHOOL',
        title: 'Before School Hours',
        reason: `School has not started yet. First period (${nextP.name}) begins at ${this.formatTime12Hour(nextP.start)}.`,
        canWaitlist: false,
        purgeWaitlist: true,
        currentPeriod: null,
        nextPeriod: nextP,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    // After school hours
    if (currentMins >= lastPeriodEnd) {
      return {
        state: 'BLACKOUT',
        reasonType: 'AFTER_SCHOOL',
        title: 'School Day Concluded',
        reason: `School day has concluded for today (ended at ${this.formatTime12Hour(sortedSchedules[sortedSchedules.length - 1].end)}).`,
        canWaitlist: false,
        purgeWaitlist: true,
        currentPeriod: null,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    // Find active period or passing period
    let currentPeriod = null;
    let nextPeriod = null;
    let isPassingPeriod = false;

    for (let i = 0; i < sortedSchedules.length; i++) {
      const p = sortedSchedules[i];
      const startM = this.timeToMinutes(p.start);
      const endM = this.timeToMinutes(p.end);

      if (currentMins >= startM && currentMins < endM) {
        currentPeriod = p;
        break;
      } else if (currentMins < startM) {
        // We are between the previous period and this period
        isPassingPeriod = true;
        nextPeriod = p;
        break;
      }
    }

    // Handle Passing Period
    if (isPassingPeriod && nextPeriod) {
      const first10UnlockMins = this.timeToMinutes(nextPeriod.start) + (blackoutRules.firstMinutes || 10);
      const unlockTimeStr = this.formatTime12Hour(this.minutesToTimeString(first10UnlockMins));
      
      return {
        state: 'BLACKOUT',
        reasonType: 'PASSING_PERIOD',
        title: 'Passing Period',
        reason: `Passing period in progress. ${nextPeriod.name} starts at ${this.formatTime12Hour(nextPeriod.start)}. Hall passes will open at ${unlockTimeStr} (after first 10 minutes).`,
        canWaitlist: true,
        targetPeriod: nextPeriod,
        unlockTime: unlockTimeStr,
        purgeWaitlist: false,
        currentPeriod: null,
        nextPeriod: nextPeriod,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    if (!currentPeriod) {
      return {
        state: 'BLACKOUT',
        reasonType: 'OFF_HOURS',
        title: 'No Active Class Period',
        reason: 'Currently outside scheduled class times.',
        canWaitlist: false,
        purgeWaitlist: true,
        currentPeriod: null,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    const startM = this.timeToMinutes(currentPeriod.start);
    const endM = this.timeToMinutes(currentPeriod.end);
    const minsFromStart = currentMins - startM;
    const minsUntilEnd = endM - currentMins;

    // Check Custom Blackouts (e.g. Start/End of Day, Lunch, Testing)
    if (blackoutRules.customBlackouts && blackoutRules.customBlackouts.length > 0) {
      for (const cb of blackoutRules.customBlackouts) {
        const cbStart = this.timeToMinutes(cb.start);
        const cbEnd = this.timeToMinutes(cb.end);
        if (currentMins >= cbStart && currentMins < cbEnd) {
          const unlockTimeStr = this.formatTime12Hour(cb.end);
          const canWaitlist = cb.canWaitlist !== undefined ? cb.canWaitlist : false;
          const purgeWaitlist = cb.purgeWaitlist !== undefined ? cb.purgeWaitlist : true;
          return {
            state: 'BLACKOUT',
            reasonType: 'CUSTOM_BLACKOUT',
            title: cb.name || 'Hall Pass Restricted',
            reason: cb.reason || 'Hall passes are not allowed during this scheduled window.',
            canWaitlist: canWaitlist,
            unlockTime: unlockTimeStr,
            purgeWaitlist: purgeWaitlist,
            currentPeriod,
            timeStr,
            formattedTime: this.formatTime12Hour(timeStr),
            isSimulated
          };
        }
      }
    }

    // Check First X Minutes Blackout
    const firstMinutes = Number(blackoutRules.firstMinutes) || 0;
    if (firstMinutes > 0 && minsFromStart < firstMinutes) {
      const unlockMins = startM + firstMinutes;
      const unlockTimeStr = this.formatTime12Hour(this.minutesToTimeString(unlockMins));
      const remainingMins = firstMinutes - minsFromStart;

      return {
        state: 'BLACKOUT',
        reasonType: 'FIRST_MINUTES',
        title: `First ${firstMinutes} Minutes of ${currentPeriod.name}`,
        reason: `No hall passes permitted during the first ${firstMinutes} minutes of class (${remainingMins} min remaining). Hall passes unlock at ${unlockTimeStr}.`,
        canWaitlist: !!blackoutRules.firstMinutesWaitlistAllowed,
        unlockTime: unlockTimeStr,
        purgeWaitlist: false,
        currentPeriod,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    // Check Last Y Minutes Blackout
    const lastMinutes = Number(blackoutRules.lastMinutes) || 0;
    if (lastMinutes > 0 && minsUntilEnd <= lastMinutes) {
      return {
        state: 'BLACKOUT',
        reasonType: 'LAST_MINUTES',
        title: `Last ${lastMinutes} Minutes of ${currentPeriod.name}`,
        reason: `No additional hall passes permitted in the last ${lastMinutes} minutes of class (dismissal preparation). Wait list is cleared.`,
        canWaitlist: false,
        purgeWaitlist: true, // Will clear wait list
        currentPeriod,
        timeStr,
        formattedTime: this.formatTime12Hour(timeStr),
        isSimulated
      };
    }

    // Fully Available (Green state if no student out)
    return {
      state: 'AVAILABLE',
      reasonType: 'AVAILABLE',
      title: 'Hall Pass Available',
      reason: 'Pass is ready for sign-out.',
      canWaitlist: true,
      purgeWaitlist: false,
      currentPeriod,
      minsUntilBlackout: minsUntilEnd - lastMinutes,
      timeStr,
      formattedTime: this.formatTime12Hour(timeStr),
      isSimulated
    };
  }

  findPeriodForMinutes(schedules, mins) {
    for (const p of schedules) {
      const startM = this.timeToMinutes(p.start);
      const endM = this.timeToMinutes(p.end);
      if (mins >= startM && mins < endM) {
        return p;
      }
    }
    return null;
  }
}


  // --- QUEUE MANAGER ---
  ﻿// Queue and Pass Manager

class QueueManager {
  constructor(storage, sounds) {
    this.storage = storage;
    this.sounds = sounds;
    this.nextPromptStudent = null; // Temporary student currently being prompted after previous return
  }

  getActivePass() {
    return this.storage.getActivePass();
  }

  getWaitList() {
    return this.storage.getWaitList() || [];
  }

  isStudentOut(studentId) {
    const active = this.getActivePass();
    return active && active.studentId === studentId;
  }

  isStudentOnWaitList(studentId) {
    const waitList = this.getWaitList();
    return waitList.some(item => item.studentId === studentId);
  }

  // Sign out a student
  signOut(student, destination, destinationDetail = '', currentPeriod = null) {
    const active = this.getActivePass();
    if (active) {
      throw new Error(`The hall pass is already signed out to ${active.studentName}`);
    }

    // Check if student was in the waitlist or being prompted
    this.removeFromWaitList(student.id || student.studentId);
    if (this.nextPromptStudent && this.nextPromptStudent.studentId === (student.id || student.studentId)) {
      this.nextPromptStudent = null;
    }

    const now = Date.now();
    const periodId = currentPeriod ? currentPeriod.id : (student.period || 'p2');
    const periodName = currentPeriod ? currentPeriod.name : 'Class';

    const pass = {
      id: 'pass_' + now + '_' + Math.random().toString(36).substring(2, 7),
      studentId: student.id || student.studentId,
      studentName: student.name || student.studentName,
      periodId: periodId,
      periodName: periodName,
      destination: destination,
      destinationDetail: destinationDetail || '',
      signOutTime: now,
      date: new Date().toISOString().split('T')[0],
      status: 'active'
    };

    this.storage.saveActivePass(pass);
    if (this.sounds) this.sounds.play('checkout');

    return pass;
  }

  // Sign in / Return current student
  signIn(overrideStatus = 'completed', isHoldActive = false) {
    const active = this.getActivePass();
    if (!active) {
      return { completedPass: null, nextInLine: null };
    }

    const returnTime = Date.now();
    const durationSeconds = Math.max(1, Math.round((returnTime - active.signOutTime) / 1000));

    const completedPass = {
      ...active,
      returnTime,
      durationSeconds,
      status: overrideStatus
    };

    this.storage.addHistoryRecord(completedPass);
    this.storage.saveActivePass(null);

    if (this.sounds) this.sounds.play('checkin');

    // If an emergency hold / pause / blackout is active, DO NOT pop from waitlist or allow another sign-out!
    // Maintain the entire wait list and return nextInLine: null
    if (isHoldActive) {
      this.nextPromptStudent = null;
      return { completedPass, nextInLine: null };
    }

    // Normal pass return: check wait list
    let nextInLine = null;
    const waitList = this.getWaitList();
    if (waitList.length > 0) {
      nextInLine = waitList.shift();
      this.storage.saveWaitList(waitList);
      this.nextPromptStudent = nextInLine;
      if (this.sounds) {
        setTimeout(() => this.sounds.play('next'), 400);
      }
    } else {
      this.nextPromptStudent = null;
    }

    return { completedPass, nextInLine };
  }

  // Add a student to the wait list
  addToWaitList(student, currentPeriod = null) {
    const studentId = student.id || student.studentId;
    const studentName = student.name || student.studentName;

    if (this.isStudentOut(studentId)) {
      throw new Error(`${studentName} is currently signed out.`);
    }
    if (this.isStudentOnWaitList(studentId)) {
      throw new Error(`${studentName} is already on the wait list.`);
    }

    const periodId = currentPeriod ? currentPeriod.id : (student.period || 'p2');
    const periodName = currentPeriod ? currentPeriod.name : 'Class';

    const waitList = this.getWaitList();
    const entry = {
      studentId,
      studentName,
      periodId,
      periodName,
      addedTime: Date.now()
    };

    waitList.push(entry);
    this.storage.saveWaitList(waitList);
    return waitList;
  }

  // Remove student from wait list
  removeFromWaitList(studentId) {
    const waitList = this.getWaitList();
    const filtered = waitList.filter(item => item.studentId !== studentId);
    if (filtered.length !== waitList.length) {
      this.storage.saveWaitList(filtered);
    }
    return filtered;
  }

  // Next in line says 'I no longer need to leave' -> Advance queue
  cancelPromptAndAdvance() {
    this.nextPromptStudent = null;
    const waitList = this.getWaitList();
    if (waitList.length > 0) {
      const next = waitList.shift();
      this.storage.saveWaitList(waitList);
      this.nextPromptStudent = next;
      if (this.sounds) this.sounds.play('next');
      return next;
    }
    return null;
  }

  // Purge wait list (used when last 10 minutes begins or school day concludes)
  purgeWaitList(reason = 'Dismissal / Blackout') {
    const waitList = this.getWaitList();
    const count = waitList.length;
    if (count > 0 || this.nextPromptStudent) {
      this.storage.saveWaitList([]);
      this.nextPromptStudent = null;
      return { purged: true, count, reason };
    }
    return { purged: false, count: 0, reason };
  }

  // Force return (teacher override)
  forceReturn(isHoldActive = false) {
    return this.signIn('teacher_override', isHoldActive);
  }
}


  // --- ROSTER SYNC ---
  ﻿// Google Sheets Roster Sync and CSV Import/Export

class RosterSync {
  constructor(storage) {
    this.storage = storage;
  }

  // Convert Google Sheet URL to direct CSV export link
  convertGoogleSheetUrlToCsv(rawUrl, gid = '0') {
    if (!rawUrl) return '';
    const clean = rawUrl.trim();

    if (clean.includes('output=csv') || clean.includes('/export?format=csv')) {
      return clean;
    }

    const idMatch = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      const sheetId = idMatch[1];
      const gidMatch = clean.match(/[#&?]gid=([0-9]+)/);
      const sheetGid = gidMatch ? gidMatch[1] : (gid || '0');
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
    }

    return clean;
  }

  // Fetch Google Sheets CSV
  async syncGoogleSheets(rawUrl, gid = '0') {
    const csvUrl = this.convertGoogleSheetUrlToCsv(rawUrl, gid);
    if (!csvUrl) {
      throw new Error('Please provide a valid Google Sheets URL.');
    }

    try {
      const response = await fetch(csvUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/csv, text/plain, */*' },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Google Sheet: HTTP ${response.status} ${response.statusText}. Please ensure the sheet is set to 'Anyone with the link can view' or published to the web.`);
      }

      const csvText = await response.text();
      const parsedStudents = this.parseCsv(csvText);

      if (parsedStudents.length === 0) {
        throw new Error('No students could be parsed from the Google Sheet. Please ensure your sheet has headers: Name, Period');
      }

      this.storage.saveRoster(parsedStudents);
      const settings = this.storage.getSettings();
      settings.lastSyncTime = new Date().toISOString();
      this.storage.saveSettings(settings);

      return {
        success: true,
        count: parsedStudents.length,
        students: parsedStudents,
        syncTime: settings.lastSyncTime
      };
    } catch (err) {
      console.error('Google Sheet sync error:', err);
      throw err;
    }
  }

  // Parse CSV text to roster array
  parseCsv(csvText) {
    if (!csvText) return [];
    const lines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]).map(h => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
    
    let nameIdx = headers.findIndex(h => h.includes('name') || h === 'student' || h === 'studentname');
    let periodIdx = headers.findIndex(h => h.includes('period') || h.includes('class') || h.includes('hour') || h === 'p');
    let restrictIdx = headers.findIndex(h => h.includes('restrict') || h.includes('limit') || h.includes('block'));
    let notesIdx = headers.findIndex(h => h.includes('note') || h.includes('info') || h.includes('comment'));

    if (nameIdx === -1) nameIdx = 0;
    if (periodIdx === -1) periodIdx = 1;

    const schedules = this.storage.getSchedules() || [];
    const students = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i]);
      if (cols.length <= nameIdx) continue;

      const rawName = (cols[nameIdx] || '').trim();
      if (!rawName) continue;

      const rawPeriod = cols[periodIdx] ? cols[periodIdx].trim() : 'Period 2';
      const restrictions = restrictIdx !== -1 && cols[restrictIdx] ? cols[restrictIdx].trim() : '';
      const notes = notesIdx !== -1 && cols[notesIdx] ? cols[notesIdx].trim() : '';

      const periodId = this.matchPeriodId(rawPeriod, schedules);
      const id = 's_' + rawName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + periodId;

      students.push({
        id,
        name: rawName,
        period: periodId,
        restrictions,
        notes
      });
    }

    return students;
  }

  matchPeriodId(rawPeriod, schedules) {
    if (!rawPeriod) return 'p2';
    const clean = rawPeriod.toLowerCase().trim();

    const directMatch = schedules.find(s => s.id.toLowerCase() === clean);
    if (directMatch) return directMatch.id;

    const nameMatch = schedules.find(s => s.name.toLowerCase() === clean);
    if (nameMatch) return nameMatch.id;

    const numMatch = clean.match(/([0-9]+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const byNumber = schedules.find(s => s.id === `p${num}` || s.name.toLowerCase().includes(String(num)));
      if (byNumber) return byNumber.id;
    }

    return schedules.length > 0 ? schedules[0].id : 'p2';
  }

  splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim().replace(/^[\"']|[\"']$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^[\"']|[\"']$/g, ''));
    return result;
  }

  exportCsv(roster) {
    const schedules = this.storage.getSchedules() || [];
    const periodMap = {};
    schedules.forEach(s => { periodMap[s.id] = s.name; });

    let csv = 'Student Name,Period,Restrictions,Notes\r\n';
    roster.forEach(st => {
      const pName = periodMap[st.period] || st.period;
      const safeName = `"${st.name.replace(/"/g, '""')}"`;
      const safePeriod = `"${pName.replace(/"/g, '""')}"`;
      const safeRestr = `"${(st.restrictions || '').replace(/"/g, '""')}"`;
      const safeNotes = `"${(st.notes || '').replace(/"/g, '""')}"`;
      csv += `${safeName},${safePeriod},${safeRestr},${safeNotes}\r\n`;
    });
    return csv;
  }

  getTemplateCsv() {
    return `Student Name,Period,Restrictions,Notes
Naomi,2nd Period,,Honor Roll
Amari,2nd Period,,
Emily,2nd Period,,
Derek,2nd Period,,
Zoey,2nd Period,,
Caitlin,2nd Period,,
Marcus,2nd Period,,
Sophia,2nd Period,,
Lucas,2nd Period,,
Maya,2nd Period,,
Alex M.,1st Period,,
Chloe T.,1st Period,,
Ethan W.,3rd Period,,
Grace H.,3rd Period,,
Liam S.,4th Period,,`;
  }
}


  // --- ANALYTICS ENGINE ---
  ﻿// Analytics, Statistics, and Data Insights Engine

class AnalyticsEngine {
  constructor(storage, scheduleEngine) {
    this.storage = storage;
    this.scheduleEngine = scheduleEngine;
  }

  filterHistory(timeframe = 'today', customPeriodId = null, customStudentId = null) {
    const history = this.storage.getHistory() || [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return history.filter(record => {
      if (customPeriodId && customPeriodId !== 'all' && record.periodId !== customPeriodId) {
        return false;
      }
      if (customStudentId && customStudentId !== 'all' && record.studentId !== customStudentId) {
        return false;
      }
      if (timeframe === 'all') return true;

      const recordDate = record.date || (record.signOutTime ? new Date(record.signOutTime).toISOString().split('T')[0] : '');

      if (timeframe === 'today') {
        return recordDate === todayStr;
      }

      if (timeframe === 'week') {
        const recordTime = new Date(record.signOutTime || recordDate).getTime();
        const oneWeekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        return recordTime >= oneWeekAgo;
      }

      if (timeframe === 'month') {
        const recordTime = new Date(record.signOutTime || recordDate).getTime();
        const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
        return recordTime >= thirtyDaysAgo;
      }

      return true;
    });
  }

  getSummaryStats(timeframe = 'today', periodId = null) {
    const records = this.filterHistory(timeframe, periodId);
    const totalPasses = records.length;

    let totalSeconds = 0;
    let maxSeconds = 0;
    let longestPassStudent = null;
    const destCounts = {};

    records.forEach(r => {
      const dur = r.durationSeconds || 0;
      totalSeconds += dur;
      if (dur > maxSeconds) {
        maxSeconds = dur;
        longestPassStudent = r.studentName;
      }
      const dest = (r.destination || 'other').toLowerCase();
      destCounts[dest] = (destCounts[dest] || 0) + 1;
    });

    const avgSeconds = totalPasses > 0 ? Math.round(totalSeconds / totalPasses) : 0;

    let topDest = 'None';
    let topDestCount = 0;
    Object.keys(destCounts).forEach(dest => {
      if (destCounts[dest] > topDestCount) {
        topDest = dest.charAt(0).toUpperCase() + dest.slice(1);
        topDestCount = destCounts[dest];
      }
    });

    return {
      totalPasses,
      totalMinutesFormatted: Math.round(totalSeconds / 60) + ' min',
      avgDurationFormatted: this.scheduleEngine.formatDuration(avgSeconds),
      avgDurationSeconds: avgSeconds,
      longestDurationFormatted: this.scheduleEngine.formatDuration(maxSeconds),
      longestPassStudent: longestPassStudent || 'N/A',
      topDestination: topDest,
      topDestinationCount: topDestCount,
      destCounts
    };
  }

  getStudentStats(timeframe = 'all', periodId = null) {
    const records = this.filterHistory(timeframe, periodId);
    const roster = this.storage.getRoster() || [];
    const studentMap = {};

    roster.forEach(st => {
      if (!periodId || periodId === 'all' || st.period === periodId) {
        studentMap[st.id] = {
          studentId: st.id,
          studentName: st.name,
          periodId: st.period,
          restrictions: st.restrictions || '',
          notes: st.notes || '',
          passCount: 0,
          totalSeconds: 0,
          destinations: {},
          recentPass: null
        };
      }
    });

    records.forEach(r => {
      if (!studentMap[r.studentId]) {
        studentMap[r.studentId] = {
          studentId: r.studentId,
          studentName: r.studentName,
          periodId: r.periodId,
          restrictions: '',
          notes: '',
          passCount: 0,
          totalSeconds: 0,
          destinations: {},
          recentPass: null
        };
      }

      const st = studentMap[r.studentId];
      st.passCount++;
      st.totalSeconds += (r.durationSeconds || 0);
      const dest = (r.destination || 'other').toLowerCase();
      st.destinations[dest] = (st.destinations[dest] || 0) + 1;
      if (!st.recentPass || new Date(r.signOutTime) > new Date(st.recentPass.signOutTime)) {
        st.recentPass = r;
      }
    });

    const list = Object.values(studentMap).map(st => {
      const avgSec = st.passCount > 0 ? Math.round(st.totalSeconds / st.passCount) : 0;
      const hasLongPass = avgSec > 480;
      const isFrequent = st.passCount >= 3;
      const isEfficient = st.passCount >= 1 && avgSec < 180;

      return {
        ...st,
        avgSeconds: avgSec,
        avgDurationFormatted: this.scheduleEngine.formatDuration(avgSec),
        totalMinutesFormatted: Math.round(st.totalSeconds / 60) + 'm',
        hasLongPass,
        isFrequent,
        isEfficient
      };
    });

    return list.sort((a, b) => b.passCount - a.passCount || b.totalSeconds - a.totalSeconds);
  }

  getPeriodStats(timeframe = 'today') {
    const records = this.filterHistory(timeframe);
    const schedules = this.storage.getSchedules() || [];
    
    return schedules.map(p => {
      const periodRecords = records.filter(r => r.periodId === p.id);
      const passCount = periodRecords.length;
      let totalSec = 0;
      periodRecords.forEach(r => { totalSec += (r.durationSeconds || 0); });
      const avgSec = passCount > 0 ? Math.round(totalSec / passCount) : 0;

      return {
        periodId: p.id,
        periodName: p.name,
        timeWindow: `${this.scheduleEngine.formatTime12Hour(p.start)} - ${this.scheduleEngine.formatTime12Hour(p.end)}`,
        passCount,
        totalMinutes: Math.round(totalSec / 60),
        avgDurationFormatted: this.scheduleEngine.formatDuration(avgSec),
        avgSeconds: avgSec
      };
    });
  }

  getPositiveReinforcement(timeframe = 'week') {
    const students = this.getStudentStats(timeframe).filter(s => s.passCount >= 1);
    const efficientStudents = [...students].sort((a, b) => a.avgSeconds - b.avgSeconds).slice(0, 5);
    const periods = this.getPeriodStats(timeframe).sort((a, b) => a.totalMinutes - b.totalMinutes);

    return {
      efficientStudents,
      bestPeriod: periods.length > 0 ? periods[0] : null
    };
  }

  exportHistoryCsv(timeframe = 'all', periodId = null, studentId = null) {
    const records = this.filterHistory(timeframe, periodId, studentId);
    let csv = 'Date,Period,Student Name,Destination,Detail,Sign Out Time,Sign In Time,Duration (Seconds),Duration (Formatted),Status\r\n';

    records.forEach(r => {
      const date = r.date || (r.signOutTime ? new Date(r.signOutTime).toISOString().split('T')[0] : '');
      const pName = `"${(r.periodName || r.periodId || '').replace(/"/g, '""')}"`;
      const sName = `"${(r.studentName || '').replace(/"/g, '""')}"`;
      const dest = `"${(r.destination || '').replace(/"/g, '""')}"`;
      const detail = `"${(r.destinationDetail || '').replace(/"/g, '""')}"`;
      const outTime = r.signOutTime ? new Date(r.signOutTime).toLocaleTimeString() : '';
      const inTime = r.returnTime ? new Date(r.returnTime).toLocaleTimeString() : '';
      const durSec = r.durationSeconds || 0;
      const durFmt = `"${this.scheduleEngine.formatDuration(durSec)}"`;
      const status = `"${(r.status || 'completed').replace(/"/g, '""')}"`;

      csv += `${date},${pName},${sName},${dest},${detail},${outTime},${inTime},${durSec},${durFmt},${status}\r\n`;
    });

    return csv;
  }
}


  // --- CLOUD MULTI-DEVICE SYNC ---
  // Cloud Sync Engine for Real-Time Multi-Device Classroom Kiosks

class CloudSyncEngine {
  constructor(storage) {
    this.storage = storage;
    this.ws = null;
    this.clientId = 'dev_' + Math.random().toString(36).substring(2, 9);
    this.roomCode = this.getRoomCode();
    this.connected = false;
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.isApplyingRemote = false;
    this.statusListeners = [];
  }

  getRoomCode() {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('room') || params.get('code') || params.get('teacher');
      if (fromUrl) {
        return fromUrl.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      }
    }
    const settings = this.storage.getSettings();
    return (settings.roomCode || 'ROBERTS').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  }

  setRoomCode(newCode) {
    const code = (newCode || 'ROBERTS').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.roomCode = code;
    const settings = this.storage.getSettings();
    settings.roomCode = code;
    this.storage.saveSettings(settings);
    this.reconnect();
  }

  init() {
    if (typeof window === 'undefined') return;
    this.connect();
    
    // Listen for local state changes and broadcast to peer devices
    window.addEventListener('hallpass:statechange', (e) => {
      // Only broadcast if the change originated locally
      if (!this.isApplyingRemote && (!e.detail || e.detail.source !== 'remote')) {
        this.broadcastState();
      }
    });
  }

  connect() {
    if (typeof WebSocket === 'undefined') return;
    try {
      if (this.ws) {
        this.ws.close();
      }

      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      const wsUrl = 'wss://broker.hivemq.com:8884/mqtt';

      this.ws = new WebSocket(wsUrl, 'mqtt');

      this.ws.onopen = () => {
        this.connected = true;
        this.notifyStatus('connected', 'Live Sync: Room ' + this.roomCode);
        this.sendMqttConnect(this.clientId, topic);

        // Heartbeat ping every 30s to keep connection active
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendMqttPing();
          }
        }, 30000);
      };

      this.ws.onmessage = async (event) => {
        await this.handleMqttMessage(event.data);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.notifyStatus('disconnected', 'Reconnecting to cloud...');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.notifyStatus('error', 'Sync offline (local mode active)');
      };
    } catch (e) {
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 4000);
  }

  reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }

  // MQTT Packet Protocol Helpers
  sendMqttConnect(clientId, topic) {
    const protocolName = 'MQTT';
    const cleanSession = 0x02;
    const keepAlive = 60;

    const payload = this.encodeString(clientId);
    const varHeader = [
      0x00, 0x04, ...this.stringToBytes(protocolName),
      0x04, // v3.1.1
      cleanSession,
      0x00, keepAlive
    ];

    const remainingLength = varHeader.length + payload.length;
    const packet = new Uint8Array([0x10, remainingLength, ...varHeader, ...payload]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
      
      // Subscribe to room topic after connect
      setTimeout(() => {
        this.sendMqttSubscribe(topic);
        // Request latest state from any online device in the room
        setTimeout(() => {
          this.requestRoomState();
        }, 200);
      }, 300);
    }
  }

  requestRoomState() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      const p = JSON.stringify({
        senderId: this.clientId,
        action: 'REQUEST_STATE',
        roomCode: this.roomCode,
        timestamp: Date.now()
      });
      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      this.sendMqttPublish(topic, p);
    } catch (e) {}
  }

  sendMqttSubscribe(topic) {
    const packetId = 1;
    const topicBytes = this.encodeString(topic);
    const varHeader = [0x00, packetId];
    const payload = [...topicBytes, 0x00]; // QoS 0
    const remainingLength = varHeader.length + payload.length;
    const packet = new Uint8Array([0x82, remainingLength, ...varHeader, ...payload]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
    }
  }

  sendMqttPublish(topic, jsonMessage) {
    const topicBytes = this.encodeString(topic);
    const messageBytes = this.stringToBytes(jsonMessage);
    const remainingLength = topicBytes.length + messageBytes.length;
    
    const lenBytes = [];
    let l = remainingLength;
    do {
      let digit = l % 128;
      l = Math.floor(l / 128);
      if (l > 0) digit = digit | 0x80;
      lenBytes.push(digit);
    } while (l > 0);

    const packet = new Uint8Array([0x30, ...lenBytes, ...topicBytes, ...messageBytes]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
    }
  }

  sendMqttPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new Uint8Array([0xC0, 0x00]).buffer);
    }
  }

  async handleMqttMessage(data) {
    try {
      let arrayBuffer;
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data && typeof data.arrayBuffer === 'function') {
        arrayBuffer = await data.arrayBuffer();
      } else if (data && data.buffer instanceof ArrayBuffer) {
        arrayBuffer = data.buffer;
      } else {
        return;
      }

      const bytes = new Uint8Array(arrayBuffer);
      const packetType = bytes[0] >> 4;

      if (packetType === 3) { // PUBLISH packet
        let offset = 1;
        while (bytes[offset] & 0x80) offset++;
        offset++;

        const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2 + topicLen;

        const payloadBytes = bytes.subarray(offset);
        const jsonStr = new TextDecoder('utf-8').decode(payloadBytes);
        const payload = JSON.parse(jsonStr);

        // Ignore messages sent by self
        if (payload.senderId !== this.clientId && payload.roomCode === this.roomCode) {
          if (payload.action === 'REQUEST_STATE') {
            // Another device in our room just connected and requested current state -> reply!
            this.broadcastState('SYNC_STATE');
          } else {
            this.applyRemoteState(payload);
          }
        }
      }
    } catch (err) {
      console.warn('Sync packet parse note:', err);
    }
  }

  // Broadcast local state to all connected devices in the room
  broadcastState(action = 'SYNC_STATE') {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      const statePayload = {
        senderId: this.clientId,
        action: action,
        timestamp: Date.now(),
        roomCode: this.roomCode,
        activePass: this.storage.getActivePass(),
        waitList: this.storage.getWaitList(),
        blackoutRules: this.storage.getBlackoutRules(),
        schedules: this.storage.getSchedules(),
        roster: this.storage.getRoster(),
        timeSimulation: this.storage.getTimeSimulation(),
        history: this.storage.getHistory().slice(0, 20)
      };

      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      this.sendMqttPublish(topic, JSON.stringify(statePayload));
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  }

  // Apply state received from another device (iPad <-> Laptop)
  applyRemoteState(remotePayload) {
    if (!remotePayload || !remotePayload.roomCode || remotePayload.roomCode !== this.roomCode) return;
    
    this.isApplyingRemote = true;
    try {
      if (remotePayload.activePass !== undefined) {
        if (remotePayload.activePass && remotePayload.activePass.signOutTime) {
          // Normalize signOutTime to this receiving device's local clock frame
          const remoteTimestamp = remotePayload.timestamp || Date.now();
          const elapsedMs = Math.max(0, remoteTimestamp - remotePayload.activePass.signOutTime);
          remotePayload.activePass.signOutTime = Date.now() - elapsedMs;
        }
        this.storage.saveActivePass(remotePayload.activePass, 'remote');
      }
      if (remotePayload.waitList !== undefined) {
        this.storage.saveWaitList(remotePayload.waitList, 'remote');
      }
      if (remotePayload.blackoutRules !== undefined) {
        this.storage.saveBlackoutRules(remotePayload.blackoutRules, 'remote');
      }
      if (remotePayload.schedules !== undefined && Array.isArray(remotePayload.schedules) && remotePayload.schedules.length > 0) {
        this.storage.saveSchedules(remotePayload.schedules, 'remote');
      }
      if (remotePayload.roster !== undefined && Array.isArray(remotePayload.roster) && remotePayload.roster.length > 0) {
        this.storage.saveRoster(remotePayload.roster, 'remote');
      }
      if (remotePayload.timeSimulation !== undefined) {
        this.storage.saveTimeSimulation(remotePayload.timeSimulation, 'remote');
        const simToggle = document.getElementById('sim-enabled-toggle');
        const simTimeInput = document.getElementById('sim-time-input');
        const badge = document.getElementById('sim-mode-badge');
        if (simToggle) simToggle.checked = !!remotePayload.timeSimulation.enabled;
        if (simTimeInput && remotePayload.timeSimulation.simulatedTime) simTimeInput.value = remotePayload.timeSimulation.simulatedTime;
        if (badge) badge.classList.toggle('hidden', !remotePayload.timeSimulation.enabled);
      }
      if (remotePayload.history !== undefined && remotePayload.history.length > 0) {
        this.storage.saveHistory(remotePayload.history, 'remote');
      }

      // Trigger UI refresh on this device
      window.dispatchEvent(new CustomEvent('hallpass:statechange', { detail: { source: 'remote' } }));
    } finally {
      setTimeout(() => {
        this.isApplyingRemote = false;
      }, 200);
    }
  }

  notifyStatus(status, label) {
    this.statusListeners.forEach(cb => cb(status, label));
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
  }

  // Byte helpers
  stringToBytes(str) {
    return new TextEncoder().encode(str);
  }

  encodeString(str) {
    const bytes = this.stringToBytes(str);
    return [bytes.length >> 8, bytes.length & 0xFF, ...bytes];
  }
}


  // --- TEACHER DASHBOARD ---
  // Teacher Dashboard Controller

class TeacherDashboard {
  constructor(storage, scheduleEngine, queueManager, rosterSync, analyticsEngine, sounds, cloudSync = null) {
    this.storage = storage;
    this.scheduleEngine = scheduleEngine;
    this.queueManager = queueManager;
    this.rosterSync = rosterSync;
    this.analytics = analyticsEngine;
    this.sounds = sounds;
    this.cloudSync = cloudSync;
    this.currentTab = 'monitor';
    this.timeframe = 'today';
    this.periodFilter = 'all';
    this.isOpen = false;
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    const btnUpdateRoom = document.getElementById('btn-update-room-code');
    if (btnUpdateRoom) {
      btnUpdateRoom.addEventListener('click', () => {
        const input = document.getElementById('input-room-code');
        const code = input ? input.value.trim().toUpperCase() : 'ROBERTS';
        if (!code) return;
        if (this.cloudSync) {
          this.cloudSync.setRoomCode(code);
        } else {
          const s = this.storage.getSettings();
          s.roomCode = code;
          this.storage.saveSettings(s);
        }
        this.renderSettingsTab();
        alert('Room code updated to: ' + code + '\nAll devices with this Room Code will stay in real-time sync.');
      });
    }

    document.querySelectorAll('.btn-copy-device-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const input = document.getElementById(target === 'kiosk' ? 'link-kiosk-url' : 'link-desk-url');
        if (input) {
          input.select();
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(input.value).catch(() => {});
          }
          alert('Copied ' + (target === 'kiosk' ? 'Door iPad Kiosk' : 'Laptop Desk Monitor') + ' link to clipboard!');
        }
      });
    });

    const pinForm = document.getElementById('pin-modal-form');
    if (pinForm) {
      pinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.verifyPin();
      });
    }

    const tabButtons = document.querySelectorAll('.dashboard-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    const closeBtns = document.querySelectorAll('.close-dashboard-btn');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.closeDashboard());
    });

    const timeframeSelect = document.getElementById('analytics-timeframe');
    if (timeframeSelect) {
      timeframeSelect.addEventListener('change', (e) => {
        this.timeframe = e.target.value;
        this.renderAnalytics();
      });
    }

    const periodSelect = document.getElementById('analytics-period-filter');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.periodFilter = e.target.value;
        this.renderAnalytics();
      });
    }

    const exportHistoryBtn = document.getElementById('btn-export-history-csv');
    if (exportHistoryBtn) {
      exportHistoryBtn.addEventListener('click', () => this.exportHistory());
    }

    const clearHistoryBtn = document.getElementById('btn-clear-history-logs');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all pass logs and placeholder test history?')) {
          this.storage.clearHistory();
          this.renderAnalytics();
          alert('Pass history logs have been cleared.');
        }
      });
    }

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    const scheduleForm = document.getElementById('schedules-form');
    if (scheduleForm) {
      scheduleForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSchedules();
      });
    }

    const btnSyncSheets = document.getElementById('btn-sync-sheets');
    if (btnSyncSheets) {
      btnSyncSheets.addEventListener('click', () => this.handleGoogleSheetsSync());
    }

    const btnReset = document.getElementById('btn-reset-defaults');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all schedules, roster, and settings to original defaults?')) {
          this.storage.resetToDefaults();
          alert('System reset to defaults.');
          window.location.reload();
        }
      });
    }

    const btnLockdown = document.getElementById('btn-toggle-lockdown');
    if (btnLockdown) {
      btnLockdown.addEventListener('click', () => this.toggleLockdown());
    }

    const btnForceReturn = document.getElementById('btn-force-return');
    if (btnForceReturn) {
      btnForceReturn.addEventListener('click', () => {
        const res = this.queueManager.forceReturn();
        if (res.completedPass) {
          alert(`Force returned ${res.completedPass.studentName}.`);
        }
        this.renderMonitor();
        window.dispatchEvent(new CustomEvent('hallpass:statechange'));
      });
    }

    const btnClearWaitlist = document.getElementById('btn-clear-waitlist');
    if (btnClearWaitlist) {
      btnClearWaitlist.addEventListener('click', () => {
        const res = this.queueManager.purgeWaitList('Teacher cleared wait list');
        alert(`Cleared ${res.count} student(s) from wait list.`);
        this.renderMonitor();
        window.dispatchEvent(new CustomEvent('hallpass:statechange'));
      });
    }

    const fileRosterCsv = document.getElementById('file-roster-csv');
    if (fileRosterCsv) {
      fileRosterCsv.addEventListener('change', (e) => this.handleCsvFileUpload(e));
    }

    const btnTemplate = document.getElementById('btn-download-template');
    if (btnTemplate) {
      btnTemplate.addEventListener('click', () => this.downloadTemplate());
    }
  }

  openPinModal() {
    const modal = document.getElementById('pin-modal');
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    const hint = document.getElementById('pin-hint-text');
    const settings = this.storage.getSettings();
    const currentPin = (settings.pin || '1234').trim();

    if (error) error.classList.add('hidden');
    if (hint) {
      hint.textContent = currentPin === '1234' ? 'Default PIN: 1234 (changeable in Settings)' : 'Enter your custom PIN to unlock';
    }
    if (input) input.value = '';
    if (modal) modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
  }

  closePinModal() {
    const modal = document.getElementById('pin-modal');
    if (modal) modal.classList.add('hidden');
  }

  verifyPin() {
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    const settings = this.storage.getSettings();
    const entered = (input ? input.value : '').trim();
    const currentPin = (settings.pin || '1234').trim();

    if (entered === currentPin) {
      this.closePinModal();
      this.openDashboard();
    } else {
      if (error) {
        error.textContent = currentPin === '1234' ? 'Incorrect PIN. Default is 1234.' : 'Incorrect PIN. Please try again.';
        error.classList.remove('hidden');
      }
      if (this.sounds) this.sounds.play('warning');
    }
  }

  openDashboard() {
    this.isOpen = true;
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.classList.remove('hidden');
    this.switchTab('monitor');
  }

  closeDashboard() {
    this.isOpen = false;
    const modal = document.getElementById('dashboard-modal');
    if (modal) modal.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('hallpass:statechange'));
  }

  switchTab(tab) {
    this.currentTab = tab;
    
    document.querySelectorAll('.dashboard-tab-btn').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('border-blue-600', 'text-blue-600', 'font-bold');
        btn.classList.remove('border-transparent', 'text-gray-500');
      } else {
        btn.classList.remove('border-blue-600', 'text-blue-600', 'font-bold');
        btn.classList.add('border-transparent', 'text-gray-500');
      }
    });

    document.querySelectorAll('.tab-content-panel').forEach(panel => {
      if (panel.id === `tab-panel-${tab}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    if (tab === 'monitor') this.renderMonitor();
    if (tab === 'analytics') this.renderAnalytics();
    if (tab === 'schedules') this.renderSchedulesTab();
    if (tab === 'roster') this.renderRosterTab();
    if (tab === 'settings') this.renderSettingsTab();
  }

  renderMonitor() {
    const activePass = this.queueManager.getActivePass();
    const waitList = this.queueManager.getWaitList();
    const rules = this.storage.getBlackoutRules();

    const activeBox = document.getElementById('monitor-active-pass-box');
    const waitListBox = document.getElementById('monitor-waitlist-box');
    const lockdownBtn = document.getElementById('btn-toggle-lockdown');

    if (lockdownBtn) {
      if (rules.emergencyLockdown) {
        lockdownBtn.textContent = 'Lift Emergency Lockdown';
        lockdownBtn.className = 'px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition';
      } else {
        lockdownBtn.textContent = 'Trigger Emergency Hold / Pause';
        lockdownBtn.className = 'px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition';
      }
    }

    if (activeBox) {
      if (activePass) {
        const elapsedSec = Math.max(0, Math.round((Date.now() - activePass.signOutTime) / 1000));
        activeBox.innerHTML = `
          <div class="bg-red-50 border-2 border-red-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="inline-block w-3 h-3 bg-red-600 rounded-full animate-ping"></span>
                <span class="text-xs font-bold text-red-700 uppercase tracking-wide">Pass Signed Out</span>
              </div>
              <h3 class="text-xl font-black text-gray-900 mt-1">${activePass.studentName}</h3>
              <p class="text-sm text-gray-600">Destination: <strong class="text-gray-900">${activePass.destination} ${activePass.destinationDetail ? '(' + activePass.destinationDetail + ')' : ''}</strong> | Period: ${activePass.periodName}</p>
              <p class="text-xs text-red-600 font-semibold mt-1">Out at ${new Date(activePass.signOutTime).toLocaleTimeString()} (Elapsed: ${this.scheduleEngine.formatDuration(elapsedSec)})</p>
            </div>
            <button id="btn-force-return" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm">Force Return</button>
          </div>
        `;
        const btnForce = document.getElementById('btn-force-return');
        if (btnForce) {
          btnForce.addEventListener('click', () => {
            this.queueManager.forceReturn();
            this.renderMonitor();
            window.dispatchEvent(new CustomEvent('hallpass:statechange'));
          });
        }
      } else {
        activeBox.innerHTML = `
          <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-emerald-800 flex items-center justify-between">
            <div>
              <p class="font-bold">No Student Currently Out</p>
              <p class="text-xs text-emerald-600">The hall pass is currently in the classroom.</p>
            </div>
            <span class="px-3 py-1 bg-emerald-200 text-emerald-900 text-xs font-black rounded-full uppercase">Pass Available</span>
          </div>
        `;
      }
    }

    if (waitListBox) {
      if (waitList.length === 0) {
        waitListBox.innerHTML = '<p class="text-sm text-gray-400 italic py-2">Wait list is currently empty.</p>';
      } else {
        let html = '<div class="space-y-2">';
        waitList.forEach((st, idx) => {
          html += `
            <div class="flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded-lg">
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center">#${idx + 1}</span>
                <div>
                  <strong class="text-gray-900 text-sm">${st.studentName}</strong>
                  <span class="text-xs text-gray-500 ml-2">(${st.periodName || 'Class'})</span>
                </div>
              </div>
              <button data-id="${st.studentId}" class="btn-remove-waitlist text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded">Remove</button>
            </div>
          `;
        });
        html += '</div>';
        waitListBox.innerHTML = html;

        waitListBox.querySelectorAll('.btn-remove-waitlist').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.id;
            this.queueManager.removeFromWaitList(sid);
            this.renderMonitor();
            window.dispatchEvent(new CustomEvent('hallpass:statechange'));
          });
        });
      }
    }
  }

  toggleLockdown() {
    const rules = this.storage.getBlackoutRules();
    rules.emergencyLockdown = !rules.emergencyLockdown;
    if (rules.emergencyLockdown) {
      const reason = prompt('Enter emergency hold reason (shown on kiosk):', 'Teacher Emergency Hold: Hall passes are temporarily paused.') || 'Hall passes are temporarily paused by teacher request.';
      rules.lockdownReason = reason;
    }
    this.storage.saveBlackoutRules(rules);
    this.renderMonitor();
    window.dispatchEvent(new CustomEvent('hallpass:statechange'));
  }

  renderAnalytics() {
    const summary = this.analytics.getSummaryStats(this.timeframe, this.periodFilter);
    const studentStats = this.analytics.getStudentStats(this.timeframe, this.periodFilter);
    const periodStats = this.analytics.getPeriodStats(this.timeframe);
    const positive = this.analytics.getPositiveReinforcement(this.timeframe);

    document.getElementById('stat-total-passes').textContent = summary.totalPasses;
    document.getElementById('stat-avg-duration').textContent = summary.avgDurationFormatted;
    document.getElementById('stat-total-time').textContent = summary.totalMinutesFormatted;
    document.getElementById('stat-top-destination').textContent = summary.topDestination;

    const posBox = document.getElementById('positive-champions-box');
    if (posBox) {
      if (positive.efficientStudents.length === 0) {
        posBox.innerHTML = '<p class="text-xs text-gray-500 italic">No pass data recorded for this timeframe yet.</p>';
      } else {
        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">';
        positive.efficientStudents.forEach((st) => {
          html += `
            <div class="flex items-center gap-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span class="text-lg">🌟</span>
              <div>
                <strong class="text-sm text-emerald-950">${st.studentName}</strong>
                <p class="text-xs text-emerald-700">${st.passCount} pass(es) • Avg: <strong>${st.avgDurationFormatted}</strong></p>
              </div>
            </div>
          `;
        });
        html += '</div>';
        posBox.innerHTML = html;
      }
    }

    const studentTable = document.getElementById('analytics-student-table-body');
    if (studentTable) {
      if (studentStats.length === 0) {
        studentTable.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">No student records found.</td></tr>';
      } else {
        let html = '';
        studentStats.forEach(st => {
          let badge = '';
          if (st.hasLongPass) {
            badge += '<span class="ml-1 px-2 py-0.5 bg-rose-100 text-rose-800 text-xs font-bold rounded-full">Long Trips</span>';
          }
          if (st.isFrequent) {
            badge += '<span class="ml-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">Frequent</span>';
          }
          if (st.isEfficient) {
            badge += '<span class="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">Time Star</span>';
          }

          html += `
            <tr class="border-b border-gray-100 hover:bg-gray-50 text-sm">
              <td class="py-2.5 px-3 font-semibold text-gray-900">${st.studentName} ${badge}</td>
              <td class="py-2.5 px-3 text-gray-600">${st.passCount}</td>
              <td class="py-2.5 px-3 text-gray-600 font-medium">${st.avgDurationFormatted}</td>
              <td class="py-2.5 px-3 text-gray-600">${st.totalMinutesFormatted}</td>
              <td class="py-2.5 px-3 text-gray-500 text-xs">${st.restrictions || 'None'}</td>
              <td class="py-2.5 px-3 text-right">
                <button data-id="${st.studentId}" class="btn-restrict-student text-xs text-blue-600 hover:underline">Edit Restr.</button>
              </td>
            </tr>
          `;
        });
        studentTable.innerHTML = html;

        studentTable.querySelectorAll('.btn-restrict-student').forEach(btn => {
          btn.addEventListener('click', () => {
            const sid = btn.dataset.id;
            const currentRoster = this.storage.getRoster();
            const student = currentRoster.find(s => s.id === sid);
            if (student) {
              const newRestr = prompt(`Enter pass restrictions for ${student.name} (leave empty to clear):`, student.restrictions || '');
              if (newRestr !== null) {
                student.restrictions = newRestr.trim();
                this.storage.saveRoster(currentRoster);
                this.renderAnalytics();
              }
            }
          });
        });
      }
    }

    const periodTable = document.getElementById('analytics-period-table-body');
    if (periodTable) {
      let html = '';
      periodStats.forEach(p => {
        html += `
          <tr class="border-b border-gray-100 text-sm">
            <td class="py-2.5 px-3 font-semibold text-gray-900">${p.periodName}</td>
            <td class="py-2.5 px-3 text-gray-500 text-xs">${p.timeWindow}</td>
            <td class="py-2.5 px-3 text-gray-700">${p.passCount}</td>
            <td class="py-2.5 px-3 text-gray-700 font-medium">${p.avgDurationFormatted}</td>
            <td class="py-2.5 px-3 text-gray-700">${p.totalMinutes} min</td>
          </tr>
        `;
      });
      periodTable.innerHTML = html;
    }

    const historyTable = document.getElementById('analytics-history-table-body');
    if (historyTable) {
      const records = this.analytics.filterHistory(this.timeframe, this.periodFilter);
      if (records.length === 0) {
        historyTable.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-400">No pass history recorded.</td></tr>';
      } else {
        let html = '';
        records.slice(0, 50).forEach(r => {
          const outStr = r.signOutTime ? new Date(r.signOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const inStr = r.returnTime ? new Date(r.returnTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Out';
          html += `
            <tr class="border-b border-gray-100 text-xs">
              <td class="py-2 px-3 text-gray-600">${r.date || 'Today'}</td>
              <td class="py-2 px-3 font-semibold text-gray-900">${r.studentName}</td>
              <td class="py-2 px-3 text-gray-600">${r.periodName || r.periodId}</td>
              <td class="py-2 px-3 text-gray-800 font-medium">${r.destination} ${r.destinationDetail ? '(' + r.destinationDetail + ')' : ''}</td>
              <td class="py-2 px-3 text-gray-500">${outStr} - ${inStr}</td>
              <td class="py-2 px-3 font-bold text-gray-700">${this.scheduleEngine.formatDuration(r.durationSeconds)}</td>
              <td class="py-2 px-3 text-gray-400 capitalize">${r.status || 'completed'}</td>
            </tr>
          `;
        });
        historyTable.innerHTML = html;
      }
    }
  }

  exportHistory() {
    const csv = this.analytics.exportHistoryCsv(this.timeframe, this.periodFilter);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hall_pass_history_${this.timeframe}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderSchedulesTab() {
    const schedules = this.storage.getSchedules() || [];
    const rules = this.storage.getBlackoutRules();

    document.getElementById('input-first-minutes').value = rules.firstMinutes || 10;
    document.getElementById('input-first-waitlist').checked = !!rules.firstMinutesWaitlistAllowed;
    document.getElementById('input-last-minutes').value = rules.lastMinutes || 10;
    document.getElementById('input-last-purge').checked = !!rules.lastMinutesPurgeWaitlist;
    document.getElementById('input-passing-blackout').checked = !!rules.passingPeriodBlackout;

    const list = document.getElementById('schedules-list');
    if (list) {
      let html = '';
      schedules.forEach((p, idx) => {
        html += `
          <div class="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg schedule-row" data-index="${idx}">
            <input type="text" class="period-name font-semibold text-gray-900 border rounded px-2 py-1 w-36" value="${p.name}">
            <div class="flex items-center gap-1 text-sm text-gray-600">
              <span>Start:</span>
              <input type="time" class="period-start border rounded px-2 py-1" value="${p.start}">
            </div>
            <div class="flex items-center gap-1 text-sm text-gray-600">
              <span>End:</span>
              <input type="time" class="period-end border rounded px-2 py-1" value="${p.end}">
            </div>
            <button type="button" class="btn-delete-period text-rose-600 hover:text-rose-800 ml-auto text-sm font-semibold">✕ Delete</button>
          </div>
        `;
      });
      list.innerHTML = html;

      list.querySelectorAll('.btn-delete-period').forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          schedules.splice(idx, 1);
          this.storage.saveSchedules(schedules);
          this.renderSchedulesTab();
        });
      });
    }

    const btnAddPeriod = document.getElementById('btn-add-period');
    if (btnAddPeriod) {
      btnAddPeriod.onclick = () => {
        const nextNum = schedules.length + 1;
        schedules.push({
          id: `p${nextNum}`,
          name: `${nextNum}${nextNum === 1 ? 'st' : nextNum === 2 ? 'nd' : nextNum === 3 ? 'rd' : 'th'} Period`,
          start: '08:00',
          end: '09:00'
        });
        this.storage.saveSchedules(schedules);
        this.renderSchedulesTab();
      };
    }
  }

  saveSchedules() {
    const rows = document.querySelectorAll('.schedule-row');
    const newSchedules = [];
    rows.forEach((r, idx) => {
      const name = r.querySelector('.period-name').value.trim() || `Period ${idx + 1}`;
      const start = r.querySelector('.period-start').value;
      const end = r.querySelector('.period-end').value;
      newSchedules.push({
        id: `p${idx + 1}`,
        name,
        start,
        end
      });
    });

    const rules = this.storage.getBlackoutRules();
    rules.firstMinutes = parseInt(document.getElementById('input-first-minutes').value, 10) || 0;
    rules.firstMinutesWaitlistAllowed = document.getElementById('input-first-waitlist').checked;
    rules.lastMinutes = parseInt(document.getElementById('input-last-minutes').value, 10) || 0;
    rules.lastMinutesPurgeWaitlist = document.getElementById('input-last-purge').checked;
    rules.passingPeriodBlackout = document.getElementById('input-passing-blackout').checked;

    this.storage.saveSchedules(newSchedules);
    this.storage.saveBlackoutRules(rules);

    alert('Schedules and blackout rules saved successfully!');
    window.dispatchEvent(new CustomEvent('hallpass:statechange'));
  }

  renderRosterTab() {
    const roster = this.storage.getRoster() || [];
    const settings = this.storage.getSettings();
    const schedules = this.storage.getSchedules() || [];

    document.getElementById('input-google-sheet-url').value = settings.googleSheetUrl || '';
    const lastSyncLabel = document.getElementById('label-last-sync');
    if (lastSyncLabel) {
      lastSyncLabel.textContent = settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString() : 'Never synced';
    }

    const tableBody = document.getElementById('roster-table-body');
    if (tableBody) {
      let html = '';
      roster.forEach((st, idx) => {
        const periodObj = schedules.find(s => s.id === st.period);
        const pName = periodObj ? periodObj.name : st.period;

        html += `
          <tr class="border-b border-gray-100 text-sm">
            <td class="py-2 px-3 font-semibold text-gray-900">${st.name}</td>
            <td class="py-2 px-3 text-gray-600">${pName}</td>
            <td class="py-2 px-3 text-gray-500 text-xs">${st.restrictions || 'None'}</td>
            <td class="py-2 px-3 text-gray-400 text-xs">${st.notes || ''}</td>
            <td class="py-2 px-3 text-right">
              <button data-index="${idx}" class="btn-delete-student text-rose-600 hover:text-rose-800 text-xs font-semibold">Delete</button>
            </td>
          </tr>
        `;
      });
      tableBody.innerHTML = html;

      tableBody.querySelectorAll('.btn-delete-student').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.index, 10);
          roster.splice(idx, 1);
          this.storage.saveRoster(roster);
          this.renderRosterTab();
        });
      });
    }

    const addStudentForm = document.getElementById('form-add-student');
    if (addStudentForm) {
      const periodSelect = document.getElementById('select-student-period');
      if (periodSelect) {
        periodSelect.innerHTML = schedules.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }

      addStudentForm.onsubmit = (e) => {
        e.preventDefault();
        const nameEl = document.getElementById('input-student-name');
        const periodEl = document.getElementById('select-student-period');
        const restrEl = document.getElementById('input-student-restr');
        const notesEl = document.getElementById('input-student-notes');

        const name = nameEl ? nameEl.value.trim() : '';
        const period = periodEl ? periodEl.value : 'p1';
        const restr = restrEl ? restrEl.value.trim() : '';
        const notes = notesEl ? notesEl.value.trim() : '';

        if (name) {
          roster.push({
            id: 's_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + period + '_' + Date.now().toString(36),
            name,
            period,
            restrictions: restr,
            notes
          });
          this.storage.saveRoster(roster);
          if (nameEl) nameEl.value = '';
          if (restrEl) restrEl.value = '';
          if (notesEl) notesEl.value = '';
          this.renderRosterTab();
          alert('Added ' + name + ' to the roster!');
        }
      };
    }
  }

  async handleGoogleSheetsSync() {
    const url = document.getElementById('input-google-sheet-url').value.trim();
    const statusLabel = document.getElementById('sheet-sync-status');
    const settings = this.storage.getSettings();
    settings.googleSheetUrl = url;
    this.storage.saveSettings(settings);

    if (!url) {
      alert('Please enter a Google Sheets URL first.');
      return;
    }

    if (statusLabel) {
      statusLabel.textContent = 'Syncing with Google Sheets...';
      statusLabel.className = 'text-xs text-blue-600 font-semibold mt-1';
    }

    try {
      const res = await this.rosterSync.syncGoogleSheets(url);
      if (statusLabel) {
        statusLabel.textContent = `✓ Successfully synced ${res.count} students!`;
        statusLabel.className = 'text-xs text-emerald-600 font-bold mt-1';
      }
      this.renderRosterTab();
      window.dispatchEvent(new CustomEvent('hallpass:statechange'));
    } catch (err) {
      if (statusLabel) {
        statusLabel.textContent = `Sync Error: ${err.message}`;
        statusLabel.className = 'text-xs text-rose-600 font-semibold mt-1';
      }
      alert(`Google Sheets Sync Error: ${err.message}\n\nTip: In Google Sheets, go to File > Share > Publish to web > Select CSV format, or ensure sharing is 'Anyone with link can view'.`);
    }
  }

  handleCsvFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = this.rosterSync.parseCsv(event.target.result);
        if (parsed.length === 0) {
          alert('Could not parse any students from CSV. Please check formatting.');
          return;
        }
        this.storage.saveRoster(parsed);
        alert(`Successfully imported ${parsed.length} students from CSV!`);
        this.renderRosterTab();
        window.dispatchEvent(new CustomEvent('hallpass:statechange'));
      } catch (err) {
        alert('Error parsing CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  downloadTemplate() {
    const csv = this.rosterSync.getTemplateCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hall_pass_roster_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  renderSettingsTab() {
    const settings = this.storage.getSettings();
    const roomCode = settings.roomCode || 'ROBERTS';
    const roomInput = document.getElementById('input-room-code');
    if (roomInput) roomInput.value = roomCode;

    if (typeof window !== 'undefined' && window.location) {
      const base = window.location.origin + window.location.pathname;
      const kioskUrl = base + '?room=' + encodeURIComponent(roomCode);
      const deskUrl = base + '?room=' + encodeURIComponent(roomCode) + '&view=dashboard';

      const kioskEl = document.getElementById('link-kiosk-url');
      const deskEl = document.getElementById('link-desk-url');
      if (kioskEl) kioskEl.value = kioskUrl;
      if (deskEl) deskEl.value = deskUrl;
    }

    document.getElementById('input-emergency-teachers').value = settings.emergencyTeachers || 'Mr. Roberts or Mr. Hoerter';
    document.getElementById('input-courtesy-msg').value = settings.courtesyMessage || '';
    document.getElementById('input-dashboard-pin').value = settings.pin || '1234';
    document.getElementById('input-waitlist-enabled').checked = settings.waitListEnabled !== false;
    document.getElementById('input-audio-enabled').checked = settings.audioEnabled !== false;
    document.getElementById('input-wakelock-enabled').checked = settings.wakeLockEnabled !== false;
    document.getElementById('input-max-duration').value = settings.maxTripDurationMins || 10;
  }

  saveSettings() {
    const settings = this.storage.getSettings();
    const prevWaitlist = settings.waitListEnabled !== false;
    const newWaitlist = document.getElementById('input-waitlist-enabled').checked;

    const roomInput = document.getElementById('input-room-code');
    if (roomInput) {
      const code = roomInput.value.trim().toUpperCase() || 'ROBERTS';
      settings.roomCode = code;
      if (this.cloudSync) this.cloudSync.setRoomCode(code);
    }

    settings.emergencyTeachers = document.getElementById('input-emergency-teachers').value.trim() || 'Mr. Roberts or Mr. Hoerter';
    settings.courtesyMessage = document.getElementById('input-courtesy-msg').value.trim();
    settings.pin = document.getElementById('input-dashboard-pin').value.trim() || '1234';
    settings.waitListEnabled = newWaitlist;
    settings.audioEnabled = document.getElementById('input-audio-enabled').checked;
    settings.wakeLockEnabled = document.getElementById('input-wakelock-enabled').checked;
    settings.maxTripDurationMins = parseInt(document.getElementById('input-max-duration').value, 10) || 10;

    if (prevWaitlist && !newWaitlist) {
      this.queueManager.purgeWaitList('Teacher disabled wait list feature');
    }

    this.storage.saveSettings(settings);
    if (this.sounds) this.sounds.enabled = settings.audioEnabled;

    alert('Settings saved successfully!');
    window.dispatchEvent(new CustomEvent('hallpass:statechange'));
  }
}


  // --- MAIN APPLICATION COORDINATOR ---
  // Main Application Coordinator & Kiosk View Controller

class HallPassApp {
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

        // If there are waitlisted students ready to be called once hold/blackout is lifted
        if (settings.waitListEnabled !== false && waitList.length > 0 && !this.queueManager.nextPromptStudent && !this.isModalOpen()) {
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

    const evaluation = this.scheduleEngine.evaluate();
    try {
      this.queueManager.signOut(
        this.selectedStudent,
        this.selectedDestination || 'Restroom',
        this.selectedDestinationDetail,
        evaluation.currentPeriod
      );
      const cm = document.getElementById('courtesy-modal'); if (cm) cm.classList.add('hidden');
      this.showToast(`${this.selectedStudent.name} is now signed out!`, 'success');
      this.updateState();
    } catch (err) {
      alert(err.message);
    }
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
    this.selectedStudent = {
      id: nextStudent.studentId,
      name: nextStudent.studentName,
      period: nextStudent.periodId
    };

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
    try {
      this.queueManager.signOut(
        this.selectedStudent,
        dest,
        detail,
        evaluation.currentPeriod
      );
      const nsm = document.getElementById('next-student-modal'); if (nsm) nsm.classList.add('hidden');
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapHallPassApp);
  } else {
    // If DOM is already interactive/complete (common on iPad Safari network load), boot immediately
    bootstrapHallPassApp();
  }
}


})(typeof window !== 'undefined' ? window : this, typeof document !== 'undefined' ? document : null);
