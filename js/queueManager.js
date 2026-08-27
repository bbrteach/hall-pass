// Queue and Pass Manager

export class QueueManager {
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
      noPass: !!student.noPass,
      restrictions: student.restrictions || '',
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

  // Move student up 1 position on the wait list (Teacher Dashboard)
  moveWaitListStudentUp(studentId) {
    const waitList = this.getWaitList();
    const index = waitList.findIndex(item => item.studentId === studentId);
    if (index > 0) {
      const temp = waitList[index];
      waitList[index] = waitList[index - 1];
      waitList[index - 1] = temp;
      this.storage.saveWaitList(waitList);
    }
    return waitList;
  }

  // Move student down 1 position on the wait list (Teacher Dashboard)
  moveWaitListStudentDown(studentId) {
    const waitList = this.getWaitList();
    const index = waitList.findIndex(item => item.studentId === studentId);
    if (index >= 0 && index < waitList.length - 1) {
      const temp = waitList[index];
      waitList[index] = waitList[index + 1];
      waitList[index + 1] = temp;
      this.storage.saveWaitList(waitList);
    }
    return waitList;
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
