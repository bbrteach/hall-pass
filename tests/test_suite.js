// Automated Unit Tests for Classroom Hall Pass Engine & Bell Schedules

import { ScheduleEngine } from '../js/scheduleEngine.js';
import { QueueManager } from '../js/queueManager.js';
import { RosterSync } from '../js/rosterSync.js';
import { AnalyticsEngine } from '../js/analytics.js';

class MockStorage {
  constructor() {
    this.data = {
      schedules: [
        { id: 'p1', name: '1st Period', start: '08:40', end: '09:30' },
        { id: 'p2', name: '2nd Period', start: '09:35', end: '10:25' },
        { id: 'p3', name: '3rd Period', start: '10:30', end: '11:20' },
        { id: 'p4', name: '4th Period', start: '11:25', end: '12:35' },
        { id: 'p5', name: '5th Period', start: '12:40', end: '13:30' },
        { id: 'p6', name: '6th Period', start: '13:35', end: '14:25' },
        { id: 'p7', name: '7th Period', start: '14:30', end: '15:20' }
      ],
      blackoutRules: {
        firstMinutes: 10,
        firstMinutesWaitlistAllowed: true,
        lastMinutes: 10,
        lastMinutesPurgeWaitlist: true,
        passingPeriodBlackout: true,
        emergencyLockdown: false,
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
      },
      roster: [
        { id: 's_alex', name: 'Alex M.', period: 'p1', restrictions: '' },
        { id: 's_naomi', name: 'Naomi', period: 'p2', restrictions: '' },
        { id: 'samuel', name: 'Samuel V.', period: 'p7', restrictions: '' }
      ],
      settings: {
        emergencyTeachers: 'Mr. Roberts or Mr. Hoerter',
        pin: '1234',
        audioEnabled: false
      },
      activePass: null,
      waitList: [],
      history: [],
      timeSimulation: { enabled: false }
    };
  }

  getSchedules() { return this.data.schedules; }
  saveSchedules(s) { this.data.schedules = s; }
  getBlackoutRules() { return this.data.blackoutRules; }
  saveBlackoutRules(r) { this.data.blackoutRules = r; }
  getRoster() { return this.data.roster; }
  saveRoster(r) { this.data.roster = r; }
  getSettings() { return this.data.settings; }
  saveSettings(s) { this.data.settings = s; }
  getActivePass() { return this.data.activePass; }
  saveActivePass(p) { this.data.activePass = p; }
  getWaitList() { return this.data.waitList; }
  saveWaitList(w) { this.data.waitList = w; }
  getHistory() { return this.data.history; }
  saveHistory(h) { this.data.history = h; }
  addHistoryRecord(r) { this.data.history.unshift(r); return this.data.history; }
  getTimeSimulation() { return this.data.timeSimulation; }
  saveTimeSimulation(t) { this.data.timeSimulation = t; }
}

const mockSounds = { play: () => {} };

function runTests() {
  console.log('=== Starting Classroom Hall Pass Schedule & Blackout Verification ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✕ FAIL: ${testName}`);
      failed++;
    }
  }

  const storage = new MockStorage();
  const scheduleEngine = new ScheduleEngine(storage);
  const queueManager = new QueueManager(storage, mockSounds);

  // Test 1: 8:40 AM (1st Period Start -> First 20 min of school day blackout)
  const eval840 = scheduleEngine.evaluate('08:40');
  assert(eval840.state === 'BLACKOUT', '8:40 AM is BLACKOUT');
  assert(eval840.title.includes('First 20 min'), '8:40 AM title includes First 20 min');
  assert(eval840.canWaitlist === true, '8:40 AM waitlist is allowed');
  assert(eval840.unlockTime === '9:00 AM', '8:40 AM unlock time is 9:00 AM');

  // Test 2: 8:50 AM (Still in First 20 min blackout)
  const eval850 = scheduleEngine.evaluate('08:50');
  assert(eval850.state === 'BLACKOUT', '8:50 AM is BLACKOUT');

  // Test 3: 9:00 AM (1st Period 20m blackout ends -> AVAILABLE / GREEN)
  const eval900 = scheduleEngine.evaluate('09:00');
  assert(eval900.state === 'AVAILABLE', '9:00 AM 1st Period is AVAILABLE (Green)');
  assert(eval900.currentPeriod.name === '1st Period', '9:00 AM active period is 1st Period');

  // Test 4: 9:25 AM (Last 10 min of 1st Period: 9:20-9:30)
  const eval925 = scheduleEngine.evaluate('09:25');
  assert(eval925.state === 'BLACKOUT', '9:25 AM is BLACKOUT (Last 10 min)');
  assert(eval925.purgeWaitlist === true, '9:25 AM purges waitlist');

  // Test 5: 9:35 AM (2nd Period Start: 9:35-10:25) -> First 10m blackout
  const eval935 = scheduleEngine.evaluate('09:35');
  assert(eval935.state === 'BLACKOUT', '9:35 AM is 2nd Period First 10m BLACKOUT');
  assert(eval935.canWaitlist === true, '9:35 AM allows waitlist');

  // Test 6: 9:45 AM (2nd Period 10m blackout ends -> AVAILABLE / GREEN)
  const eval945 = scheduleEngine.evaluate('09:45');
  assert(eval945.state === 'AVAILABLE', '9:45 AM 2nd Period is AVAILABLE (Green)');

  // Test 7: 10:15 AM (2nd Period Last 10m blackout: 10:15-10:25)
  const eval1015 = scheduleEngine.evaluate('10:15');
  assert(eval1015.state === 'BLACKOUT', '10:15 AM is 2nd Period Last 10m BLACKOUT');
  assert(eval1015.purgeWaitlist === true, '10:15 AM purges waitlist');

  // Test 8: 11:25 AM (4th Period: 11:25-12:35)
  const eval1125 = scheduleEngine.evaluate('11:25');
  assert(eval1125.state === 'BLACKOUT', '11:25 AM 4th Period First 10m BLACKOUT');

  // Test 9: 11:35 AM (4th Period AVAILABLE)
  const eval1135 = scheduleEngine.evaluate('11:35');
  assert(eval1135.state === 'AVAILABLE', '11:35 AM 4th Period is AVAILABLE');

  // Test 10: 12:40 PM (5th Period: 12:40-1:30)
  const eval1240 = scheduleEngine.evaluate('12:40');
  assert(eval1240.currentPeriod.name === '5th Period', '12:40 PM is 5th Period');

  // Test 11: 1:35 PM (6th Period: 1:35-2:25)
  const eval1335 = scheduleEngine.evaluate('13:35');
  assert(eval1335.currentPeriod.name === '6th Period', '1:35 PM is 6th Period');

  // Test 12: 2:30 PM (7th Period: 2:30-3:20)
  const eval1430 = scheduleEngine.evaluate('14:30');
  assert(eval1430.currentPeriod.name === '7th Period', '2:30 PM is 7th Period');

  // Test 13: 3:00 PM (Last 20 minutes of school day: 3:00-3:20 PM)
  const eval1500 = scheduleEngine.evaluate('15:00');
  assert(eval1500.state === 'BLACKOUT', '3:00 PM is BLACKOUT (Last 20 min of school day)');
  assert(eval1500.title.includes('Last 20 min'), 'Title mentions Last 20 min');
  assert(eval1500.purgeWaitlist === true, '3:00 PM purges waitlist');

  // Test 14: 3:20 PM (School Day Concluded)
  const eval1520 = scheduleEngine.evaluate('15:20');
  assert(eval1520.state === 'BLACKOUT', '3:20 PM is School Concluded');
  assert(eval1520.reasonType === 'AFTER_SCHOOL', 'Reason is AFTER_SCHOOL');

  // Test 15: PIN check
  storage.saveSettings({ pin: '5432' });
  assert(storage.getSettings().pin === '5432', 'Custom PIN 5432 saved');

  console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===\n`);
}

runTests();
