// Automated Unit Tests for Classroom Hall Pass Engine & Scenarios

import { ScheduleEngine } from '../js/scheduleEngine.js';
import { QueueManager } from '../js/queueManager.js';
import { RosterSync } from '../js/rosterSync.js';
import { AnalyticsEngine } from '../js/analytics.js';

class MockStorage {
  constructor() {
    this.data = {
      schedules: [
        { id: 'p1', name: '1st Period', start: '08:35', end: '09:30' },
        { id: 'p2', name: '2nd Period', start: '09:35', end: '10:25' },
        { id: 'p3', name: '3rd Period', start: '10:30', end: '11:20' }
      ],
      blackoutRules: {
        firstMinutes: 10,
        firstMinutesWaitlistAllowed: true,
        lastMinutes: 10,
        lastMinutesPurgeWaitlist: true,
        passingPeriodBlackout: true,
        emergencyLockdown: false,
        customBlackouts: []
      },
      roster: [
        { id: 's_naomi', name: 'Naomi', period: 'p2', restrictions: '' },
        { id: 's_amari', name: 'Amari', period: 'p2', restrictions: '' },
        { id: 's_emily', name: 'Emily', period: 'p2', restrictions: '' },
        { id: 's_derek', name: 'Derek', period: 'p2', restrictions: '' },
        { id: 's_zoey', name: 'Zoey', period: 'p2', restrictions: '' },
        { id: 's_caitlin', name: 'Caitlin', period: 'p2', restrictions: '' }
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
  console.log('=== Starting Classroom Hall Pass Automated Scenario Verification ===\n');
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
  const rosterSync = new RosterSync(storage);
  const analytics = new AnalyticsEngine(storage, scheduleEngine);

  // Test 1: At 9:35 AM (Period 2 start -> First 10m blackout)
  const eval935 = scheduleEngine.evaluate('09:35');
  assert(eval935.state === 'BLACKOUT', '9:35 AM state is BLACKOUT');
  assert(eval935.reasonType === 'FIRST_MINUTES', '9:35 AM reason is FIRST_MINUTES');
  assert(eval935.canWaitlist === true, '9:35 AM waitlist is allowed');

  // Test 2: At 9:39 AM (First 10m blackout -> Naomi joins wait list)
  const eval939 = scheduleEngine.evaluate('09:39');
  assert(eval939.state === 'BLACKOUT', '9:39 AM state is BLACKOUT');
  queueManager.addToWaitList({ id: 's_naomi', name: 'Naomi', period: 'p2' }, eval939.currentPeriod);
  assert(queueManager.getWaitList().length === 1, 'Naomi successfully added to wait list during first 10 min blackout');

  // Test 3: At 9:45 AM (First 10m blackout ends -> Screen flips to GREEN)
  const eval945 = scheduleEngine.evaluate('09:45');
  assert(eval945.state === 'AVAILABLE', '9:45 AM state is AVAILABLE (Green Screen)');

  // Test 4: At 9:46 AM (Naomi signs out to Locker -> Screen turns RED)
  const passNaomi = queueManager.signOut({ id: 's_naomi', name: 'Naomi', period: 'p2' }, 'Locker', '', eval945.currentPeriod);
  assert(storage.getActivePass() !== null, 'Active pass exists in storage');
  assert(storage.getActivePass().studentName === 'Naomi', 'Active student is Naomi');
  assert(storage.getActivePass().destination === 'Locker', 'Destination is Locker');
  assert(queueManager.getWaitList().length === 0, 'Waitlist emptied when Naomi signed out');

  // Test 5: At 9:48 AM (Amari adds to waitlist)
  queueManager.addToWaitList({ id: 's_amari', name: 'Amari', period: 'p2' }, eval945.currentPeriod);
  assert(queueManager.getWaitList().length === 1, 'Amari added to wait list');
  assert(queueManager.getWaitList()[0].studentName === 'Amari', 'Amari is #1 on wait list');

  // Test 6: At 9:50 AM (Emily adds to waitlist)
  queueManager.addToWaitList({ id: 's_emily', name: 'Emily', period: 'p2' }, eval945.currentPeriod);
  assert(queueManager.getWaitList().length === 2, 'Emily added to wait list (2 in queue)');

  // Test 7: At 9:51 AM (Naomi returns -> Amari is up next)
  const returnRes = queueManager.signIn();
  assert(storage.getActivePass() === null, 'Pass is signed in');
  assert(returnRes.completedPass.studentName === 'Naomi', 'Completed pass logged for Naomi');
  assert(returnRes.nextInLine !== null, 'Next student in line is retrieved');
  assert(returnRes.nextInLine.studentName === 'Amari', 'Amari is up next');
  assert(queueManager.getWaitList().length === 1, 'Waitlist now contains Emily');

  // Test 8: Amari signs out for Restroom, Derek/Zoey/Caitlin join wait list
  queueManager.signOut({ id: 's_amari', name: 'Amari', period: 'p2' }, 'Restroom', '', eval945.currentPeriod);
  queueManager.addToWaitList({ id: 's_derek', name: 'Derek', period: 'p2' }, eval945.currentPeriod);
  queueManager.addToWaitList({ id: 's_zoey', name: 'Zoey', period: 'p2' }, eval945.currentPeriod);
  queueManager.addToWaitList({ id: 's_caitlin', name: 'Caitlin', period: 'p2' }, eval945.currentPeriod);
  assert(queueManager.getWaitList().length === 4, 'Wait list has Emily, Derek, Zoey, Caitlin');

  // Test 9: Amari returns at 10:06 -> Emily signs out & returns at 10:10
  queueManager.signIn(); // Amari in
  queueManager.signOut({ id: 's_emily', name: 'Emily', period: 'p2' }, 'Restroom', '', eval945.currentPeriod);
  const emilyReturn = queueManager.signIn(); // Emily in
  assert(emilyReturn.nextInLine.studentName === 'Derek', 'Derek is up next after Emily');

  // Test 10: Derek chooses "I no longer need to leave" -> Skipped, Zoey is up next!
  const nextAfterDerekCancel = queueManager.cancelPromptAndAdvance();
  assert(nextAfterDerekCancel.studentName === 'Zoey', 'Derek cancelled, Zoey is immediately up next');
  assert(queueManager.getWaitList().length === 1, 'Only Caitlin remains on wait list');

  // Test 11: Zoey signs out to Restroom
  queueManager.signOut({ id: 's_zoey', name: 'Zoey', period: 'p2' }, 'Restroom', '', eval945.currentPeriod);
  assert(storage.getActivePass().studentName === 'Zoey', 'Zoey is signed out');

  // Test 12: At 10:15 AM (Last 10 minutes begins while Zoey is out)
  const eval1015 = scheduleEngine.evaluate('10:15');
  assert(eval1015.state === 'BLACKOUT', '10:15 AM is BLACKOUT');
  assert(eval1015.reasonType === 'LAST_MINUTES', '10:15 AM is LAST_MINUTES');
  assert(eval1015.purgeWaitlist === true, '10:15 AM signals purge waitlist');

  // Purge waitlist as required by last 10 minutes rule
  const purgeRes = queueManager.purgeWaitList('Last 10 minutes of class');
  assert(purgeRes.purged === true && purgeRes.count === 1, 'Wait list automatically purged (Caitlin cleared)');
  assert(queueManager.getWaitList().length === 0, 'Wait list is now empty');
  assert(storage.getActivePass().studentName === 'Zoey', 'Zoey remains signed out');

  // Test 13: Zoey returns during last 10 minutes
  const zoeyReturn = queueManager.signIn();
  assert(zoeyReturn.completedPass.studentName === 'Zoey', 'Zoey signed back in successfully during blackout');
  assert(zoeyReturn.nextInLine === null, 'No new passes issued after Zoey returns');
  assert(storage.getActivePass() === null, 'Pass is now in classroom');

  // Test 14: At 10:25 AM (Period 2 ends -> Passing period blackout)
  const eval1025 = scheduleEngine.evaluate('10:25');
  assert(eval1025.state === 'BLACKOUT', '10:25 AM is passing period BLACKOUT');
  assert(eval1025.reasonType === 'PASSING_PERIOD', 'Reason is PASSING_PERIOD');
  assert(eval1025.nextPeriod.name === '3rd Period', 'Next period is 3rd Period');
  assert(eval1025.canWaitlist === true, 'Wait list joining is allowed for 3rd period');

  // Test 15: At 10:40 AM (3rd period blackout ends -> AVAILABLE)
  const eval1040 = scheduleEngine.evaluate('10:40');
  assert(eval1040.state === 'AVAILABLE', '10:40 AM 3rd Period is AVAILABLE (Green Screen)');

  // Test 16: Analytics Verification
  const summary = analytics.getSummaryStats('all');
  assert(summary.totalPasses >= 4, `Analytics tracked ${summary.totalPasses} total passes`);

  const studentStats = analytics.getStudentStats('all');
  const naomiStat = studentStats.find(s => s.studentName === 'Naomi');
  assert(naomiStat && naomiStat.passCount >= 1, 'Naomi stats calculated');

  console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===\n`);
}

runTests();
