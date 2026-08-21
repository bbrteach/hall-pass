// Analytics, Statistics, and Data Insights Engine

export class AnalyticsEngine {
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
