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

export const storage = new StorageManager();
