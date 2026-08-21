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

const DEFAULT_SCHEDULES = [
  { id: 'p1', name: '1st Period', start: '08:35', end: '09:30' },
  { id: 'p2', name: '2nd Period', start: '09:35', end: '10:25' },
  { id: 'p3', name: '3rd Period', start: '10:30', end: '11:20' },
  { id: 'p4', name: '4th Period', start: '11:25', end: '12:45' },
  { id: 'p5', name: '5th Period', start: '12:50', end: '13:40' },
  { id: 'p6', name: '6th Period', start: '13:45', end: '14:35' },
  { id: 'p7', name: '7th Period', start: '14:40', end: '15:30' }
];

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
      id: 'cb_lunch',
      name: '4th Period Lunch Blackout',
      periodId: 'p4',
      start: '11:45',
      end: '12:15',
      reason: 'No hall passes during 4th period lunch'
    }
  ]
};

const DEFAULT_ROSTER = [
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

  { id: 's_alex', name: 'Alex M.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_ben', name: 'Benjamin K.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_chloe', name: 'Chloe T.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_david', name: 'David R.', period: 'p1', restrictions: '', notes: '' },
  { id: 's_elena', name: 'Elena V.', period: 'p1', restrictions: '', notes: '' },

  { id: 's_ethan', name: 'Ethan W.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_grace', name: 'Grace H.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_isaac', name: 'Isaac B.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_jasmine', name: 'Jasmine L.', period: 'p3', restrictions: '', notes: '' },
  { id: 's_kyle', name: 'Kyle N.', period: 'p3', restrictions: '', notes: '' },

  { id: 's_liam', name: 'Liam S.', period: 'p4', restrictions: '', notes: '' },
  { id: 's_mia', name: 'Mia D.', period: 'p4', restrictions: '', notes: '' },
  { id: 's_noah', name: 'Noah C.', period: 'p4', restrictions: '', notes: '' }
];

const DEFAULT_SETTINGS = {
  roomName: 'Main Classroom',
  emergencyTeachers: 'Mr. Roberts or Mr. Hoerter',
  pin: '1234',
  googleSheetUrl: '',
  googleSheetGid: '0',
  autoSyncMinutes: 10,
  lastSyncTime: null,
  audioEnabled: true,
  wakeLockEnabled: true,
  maxTripDurationMins: 10,
  courtesyMessage: 'Please make your trip as quick as possible to respect classmates and minimize loss of instruction.'
};

const SAMPLE_HISTORY = [
  {
    id: 'pass_sample_1',
    studentId: 's_alex',
    studentName: 'Alex M.',
    periodId: 'p1',
    periodName: '1st Period',
    destination: 'restroom',
    destinationDetail: '',
    signOutTime: new Date(Date.now() - 7200000).toISOString(),
    returnTime: new Date(Date.now() - 7200000 + 240000).toISOString(),
    durationSeconds: 240,
    date: new Date().toISOString().split('T')[0],
    status: 'completed'
  },
  {
    id: 'pass_sample_2',
    studentId: 's_chloe',
    studentName: 'Chloe T.',
    periodId: 'p1',
    periodName: '1st Period',
    destination: 'water',
    destinationDetail: '',
    signOutTime: new Date(Date.now() - 6600000).toISOString(),
    returnTime: new Date(Date.now() - 6600000 + 120000).toISOString(),
    durationSeconds: 120,
    date: new Date().toISOString().split('T')[0],
    status: 'completed'
  }
];

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

  set(key, value) {
    const fullKey = this.getKey(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(fullKey, JSON.stringify(value));
      }
    } catch (e) {
      console.warn('Storage set error for key ' + fullKey, e);
    }
    this.memoryFallback[fullKey] = value;
  }

  getSchedules() {
    return this.get(STORAGE_KEYS.SCHEDULES, DEFAULT_SCHEDULES);
  }

  saveSchedules(schedules) {
    this.set(STORAGE_KEYS.SCHEDULES, schedules);
  }

  getBlackoutRules() {
    const rules = this.get(STORAGE_KEYS.BLACKOUT_RULES, DEFAULT_BLACKOUT_RULES);
    return { ...DEFAULT_BLACKOUT_RULES, ...rules };
  }

  saveBlackoutRules(rules) {
    this.set(STORAGE_KEYS.BLACKOUT_RULES, rules);
  }

  getRoster() {
    return this.get(STORAGE_KEYS.ROSTER, DEFAULT_ROSTER);
  }

  saveRoster(roster) {
    this.set(STORAGE_KEYS.ROSTER, roster);
  }

  getSettings() {
    const settings = this.get(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  saveSettings(settings) {
    this.set(STORAGE_KEYS.SETTINGS, settings);
  }

  getActivePass() {
    return this.get(STORAGE_KEYS.ACTIVE_PASS, null);
  }

  saveActivePass(pass) {
    this.set(STORAGE_KEYS.ACTIVE_PASS, pass);
  }

  getWaitList() {
    return this.get(STORAGE_KEYS.WAIT_LIST, []);
  }

  saveWaitList(waitList) {
    this.set(STORAGE_KEYS.WAIT_LIST, waitList);
  }

  getHistory() {
    return this.get(STORAGE_KEYS.HISTORY, SAMPLE_HISTORY);
  }

  saveHistory(history) {
    this.set(STORAGE_KEYS.HISTORY, history);
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

  // Export full classroom profile as a portable JSON object
  exportConfigJson() {
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      schedules: this.getSchedules(),
      blackoutRules: this.getBlackoutRules(),
      settings: this.getSettings()
    }, null, 2);
  }

  // Import a shared classroom profile
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
