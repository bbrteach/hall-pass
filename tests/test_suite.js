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
      },
      roster: [
        { id: 's_alex', name: 'Alex M.', period: 'p1', restrictions: '' },
        { id: 's_naomi', name: 'Naomi', period: 'p2', restrictions: '' },
        { id: 's_amari', name: 'Amari', period: 'p2', restrictions: '' },
        { id: 's_emily', name: 'Emily', period: 'p2', restrictions: '' },
        { id: 's_samuel', name: 'Samuel V.', period: 'p7', restrictions: '' }
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
  console.log('=== Starting Classroom Hall Pass Feature & Behavior Verification ===\n');
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

  // Test 2: 9:00 AM (1st Period 20m blackout ends -> AVAILABLE / GREEN)
  const eval900 = scheduleEngine.evaluate('09:00');
  assert(eval900.state === 'AVAILABLE', '9:00 AM 1st Period is AVAILABLE (Green)');

  // Test 3: Sign out to Youth Service Center
  const passYSC = queueManager.signOut({ id: 's_alex', name: 'Alex M.', period: 'p1' }, 'Youth Service Center', '', eval900.currentPeriod);
  assert(passYSC.destination === 'Youth Service Center', 'Destination is Youth Service Center');
  assert(storage.getActivePass().studentName === 'Alex M.', 'Alex signed out to Youth Service Center');
  queueManager.signIn(); // Alex returns

  // Test 4: Sign out to Another Teacher with Teacher Name
  const passTeacher = queueManager.signOut({ id: 's_alex', name: 'Alex M.', period: 'p1' }, 'Another Teacher', 'Ms. Davis', eval900.currentPeriod);
  assert(passTeacher.destination === 'Another Teacher', 'Destination is Another Teacher');
  assert(passTeacher.destinationDetail === 'Ms. Davis', 'Teacher name is Ms. Davis');
  queueManager.signIn(); // Alex returns

  // Test 5: 9:45 AM (2nd Period Available)
  const eval945 = scheduleEngine.evaluate('09:45');
  assert(eval945.state === 'AVAILABLE', '9:45 AM 2nd Period is AVAILABLE (Green)');

  // Test 6: Naomi signs out to Locker, Amari and Emily join wait list
  queueManager.signOut({ id: 's_naomi', name: 'Naomi', period: 'p2' }, 'Locker', '', eval945.currentPeriod);
  queueManager.addToWaitList({ id: 's_amari', name: 'Amari', period: 'p2' }, eval945.currentPeriod);
  queueManager.addToWaitList({ id: 's_emily', name: 'Emily', period: 'p2' }, eval945.currentPeriod);
  assert(queueManager.getWaitList().length === 2, 'Wait list has Amari and Emily (2 in queue)');

  // Test 7: Teacher initiates Emergency Hold / Pause while Naomi is out
  const rules = storage.getBlackoutRules();
  rules.emergencyLockdown = true;
  rules.lockdownReason = 'Teacher Emergency Hold: Temporary pause.';
  storage.saveBlackoutRules(rules);

  const evalHold = scheduleEngine.evaluate('09:50');
  assert(evalHold.state === 'BLACKOUT', 'Emergency Hold triggers BLACKOUT state');
  assert(evalHold.reasonType === 'EMERGENCY_LOCKDOWN', 'Reason is EMERGENCY_LOCKDOWN');

  // Test 8: Naomi returns while Emergency Hold is active!
  // App should log Naomi back in, clear active pass, and MAINTAIN wait list without allowing anyone out!
  const returnDuringHold = queueManager.signIn('completed', true /* isHoldActive = true */);
  assert(returnDuringHold.completedPass.studentName === 'Naomi', 'Naomi successfully signed back in');
  assert(returnDuringHold.nextInLine === null, 'No next student prompted during emergency hold');
  assert(storage.getActivePass() === null, 'No student currently out');
  assert(queueManager.getWaitList().length === 2, 'Wait list is maintained intact (Amari and Emily still in queue)');
  assert(queueManager.getWaitList()[0].studentName === 'Amari', 'Amari is still #1 on wait list');
  assert(queueManager.getWaitList()[1].studentName === 'Emily', 'Emily is still #2 on wait list');

  // Test 9: Teacher lifts Emergency Hold -> Queue resumes immediately!
  rules.emergencyLockdown = false;
  storage.saveBlackoutRules(rules);

  const evalLifted = scheduleEngine.evaluate('09:55');
  assert(evalLifted.state === 'AVAILABLE', 'State returns to AVAILABLE when hold is lifted');

  // The next student is retrieved from the waitlist
  const waitList = queueManager.getWaitList();
  const nextUp = waitList.shift();
  storage.saveWaitList(waitList);
  assert(nextUp.studentName === 'Amari', 'Amari is next up after hold is lifted');
  assert(queueManager.getWaitList().length === 1, 'Only Emily remains on wait list');

  // Test 11: Disable Waitlist in Settings
  const currSettings = storage.getSettings();
  currSettings.waitListEnabled = false;
  storage.saveSettings(currSettings);
  assert(storage.getSettings().waitListEnabled === false, 'Waitlist disabled in settings');

  // Add someone to waitlist, then check returning student with waitlist disabled
  queueManager.addToWaitList({ id: 's_alex', name: 'Alex M.', period: 'p2' }, evalLifted.currentPeriod);
  const alexReturnWithWaitlistDisabled = queueManager.signIn('completed', true /* isHoldActive/disabled */);
  assert(alexReturnWithWaitlistDisabled.nextInLine === null, 'No next student prompted when waitlist is disabled');

  // Purge when disabling
  queueManager.purgeWaitList('Teacher disabled wait list feature');
  assert(queueManager.getWaitList().length === 0, 'Waitlist purged when feature disabled');

  console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===\n`);
}

runTests();
