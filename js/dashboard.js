// Teacher Dashboard Controller

export class TeacherDashboard {
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

    document.querySelectorAll('.btn-clear-history-action, #btn-clear-history-logs, #btn-clear-table-logs').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Are you sure you want to completely clear all pass logs and start fresh with empty data? This will clear logs across all connected devices.')) {
          this.storage.clearHistory();
          this.renderAnalytics();
          alert('All pass history logs have been completely cleared.');
        }
      });
    });

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

    if (error) error.classList.add('hidden');
    if (hint) {
      hint.textContent = 'Enter teacher PIN to unlock';
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
    const currentPin = (settings.pin || '1954').trim();

    // Unlock with teacher's custom PIN or Master Admin PIN (924226)
    if (entered === currentPin || entered === '924226') {
      this.closePinModal();
      this.openDashboard();
    } else {
      if (error) {
        error.textContent = 'Incorrect PIN. Please try again.';
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
    const pendingApproval = this.storage.getPendingApproval();

    const pendingBox = document.getElementById('monitor-pending-box');
    const pendingContent = document.getElementById('monitor-pending-content');
    if (pendingBox && pendingContent) {
      if (pendingApproval && pendingApproval.status !== 'denied') {
        pendingBox.classList.remove('hidden');
        pendingContent.innerHTML = `
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
            <div>
              <span class="text-xs font-black uppercase text-amber-800 tracking-wider">Pass Request</span>
              <h4 class="text-xl font-black text-gray-900 mt-0.5">${pendingApproval.studentName}</h4>
              <p class="text-sm text-gray-700">Period: <strong>${pendingApproval.periodName}</strong> | Destination: <strong class="text-indigo-700">${pendingApproval.destination} ${pendingApproval.destinationDetail ? '(' + pendingApproval.destinationDetail + ')' : ''}</strong></p>
              <p class="text-xs text-rose-600 font-bold mt-1">⛔ Restriction: ${pendingApproval.restrictionReason || 'On No Hall Pass List'}</p>
            </div>
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <button id="btn-deny-pass-req" class="flex-1 sm:flex-none px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold rounded-xl text-sm transition">❌ Deny</button>
              <button id="btn-approve-pass-req" class="flex-1 sm:flex-none px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm shadow-md transition">✅ Approve Pass</button>
            </div>
          </div>
        `;

        const btnApprove = document.getElementById('btn-approve-pass-req');
        if (btnApprove) {
          btnApprove.addEventListener('click', () => {
            this.queueManager.signOut(
              { id: pendingApproval.studentId, name: pendingApproval.studentName, period: pendingApproval.periodId },
              pendingApproval.destination,
              pendingApproval.destinationDetail,
              { id: pendingApproval.periodId, name: pendingApproval.periodName }
            );
            this.storage.savePendingApproval(null);
            this.renderMonitor();
            window.dispatchEvent(new CustomEvent('hallpass:statechange'));
          });
        }

        const btnDeny = document.getElementById('btn-deny-pass-req');
        if (btnDeny) {
          btnDeny.addEventListener('click', () => {
            this.storage.savePendingApproval({ ...pendingApproval, status: 'denied' });
            this.renderMonitor();
            window.dispatchEvent(new CustomEvent('hallpass:statechange'));
          });
        }
      } else {
        pendingBox.classList.add('hidden');
      }
    }

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
        const isNoPass = !!st.noPass || (st.restrictions && st.restrictions.toLowerCase().includes('no pass'));

        html += `
          <tr class="border-b border-gray-100 text-sm">
            <td class="py-2 px-3 font-semibold text-gray-900">${st.name}</td>
            <td class="py-2 px-3 text-gray-600">${pName}</td>
            <td class="py-2 px-3 text-center">
              <input type="checkbox" data-index="${idx}" class="toggle-student-nopass h-4 w-4 text-rose-600 rounded cursor-pointer" ${isNoPass ? 'checked' : ''} title="Toggle No Hall Pass restriction">
            </td>
            <td class="py-2 px-3 text-gray-600 text-xs">${st.restrictions || 'None'} ${st.notes ? '• ' + st.notes : ''}</td>
            <td class="py-2 px-3 text-right">
              <button data-index="${idx}" class="btn-delete-student text-rose-600 hover:text-rose-800 text-xs font-semibold">Delete</button>
            </td>
          </tr>
        `;
      });
      tableBody.innerHTML = html;

      tableBody.querySelectorAll('.toggle-student-nopass').forEach(chk => {
        chk.addEventListener('change', () => {
          const idx = parseInt(chk.dataset.index, 10);
          roster[idx].noPass = chk.checked;
          this.storage.saveRoster(roster);
        });
      });

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
        const noPassEl = document.getElementById('input-student-nopass');

        const name = nameEl ? nameEl.value.trim() : '';
        const period = periodEl ? periodEl.value : 'p1';
        const restr = restrEl ? restrEl.value.trim() : '';
        const notes = notesEl ? notesEl.value.trim() : '';
        const noPass = noPassEl ? noPassEl.checked : false;

        if (name) {
          roster.push({
            id: 's_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + period + '_' + Date.now().toString(36),
            name,
            period,
            noPass: noPass,
            restrictions: restr,
            notes
          });
          this.storage.saveRoster(roster);
          if (nameEl) nameEl.value = '';
          if (restrEl) restrEl.value = '';
          if (notesEl) notesEl.value = '';
          if (noPassEl) noPassEl.checked = false;
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
    document.getElementById('input-dashboard-pin').value = settings.pin || '1954';
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
    settings.pin = document.getElementById('input-dashboard-pin').value.trim() || '1954';
    settings.waitListEnabled = newWaitlist;
    settings.audioEnabled = document.getElementById('input-audio-enabled').checked;
    settings.wakeLockEnabled = document.getElementById('input-wakelock-enabled').checked;
    settings.maxTripDurationMins = parseInt(document.getElementById('input-max-duration').value, 10) || 10;

    if (prevWaitlist && !newWaitlist) {
      this.queueManager.purgeWaitList('Teacher disabled wait list feature');
    }

    this.storage.saveSettings(settings);
    if (this.cloudSync) this.cloudSync.broadcastState('SYNC_STATE');
    if (this.sounds) this.sounds.enabled = settings.audioEnabled;

    alert('Settings saved successfully!');
    window.dispatchEvent(new CustomEvent('hallpass:statechange'));
  }
}
