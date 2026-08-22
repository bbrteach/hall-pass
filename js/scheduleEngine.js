// Schedule & Blackout Engine for Classroom Hall Pass Kiosk

export class ScheduleEngine {
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
        purgeWaitlist: false,
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
        purgeWaitlist: false,
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
        purgeWaitlist: false,
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
          const purgeWaitlist = cb.purgeWaitlist !== undefined ? cb.purgeWaitlist : false;
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
        reason: `No additional hall passes permitted in the last ${lastMinutes} minutes of class (dismissal preparation).`,
        canWaitlist: false,
        purgeWaitlist: true, // Wait list clears specifically for the last minutes of class / dismissal
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
