// Google Sheets Roster Sync and CSV Import/Export

export class RosterSync {
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
