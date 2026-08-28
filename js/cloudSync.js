// Cloud Sync Engine for Real-Time Multi-Device Classroom Kiosks

export class CloudSyncEngine {
  constructor(storage) {
    this.storage = storage;
    this.ws = null;
    this.clientId = 'dev_' + Math.random().toString(36).substring(2, 9);
    this.roomCode = this.getRoomCode();
    this.connected = false;
    this.reconnectTimer = null;
    this.pingInterval = null;
    this.isApplyingRemote = false;
    this.statusListeners = [];
  }

  getRoomCode() {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('room') || params.get('code') || params.get('teacher');
      if (fromUrl) {
        return fromUrl.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      }
    }
    const settings = this.storage.getSettings();
    return (settings.roomCode || 'ROBERTS').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  }

  setRoomCode(newCode) {
    const code = (newCode || 'ROBERTS').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    this.roomCode = code;
    const settings = this.storage.getSettings();
    settings.roomCode = code;
    this.storage.saveSettings(settings);
    this.reconnect();
  }

  init() {
    if (typeof window === 'undefined') return;
    this.connect();
    
    // Listen for local state changes and broadcast to peer devices
    window.addEventListener('hallpass:statechange', (e) => {
      // Only broadcast if the change originated locally
      if (!this.isApplyingRemote && (!e.detail || e.detail.source !== 'remote')) {
        this.broadcastState();
      }
    });
  }

  connect() {
    if (typeof WebSocket === 'undefined') return;
    try {
      if (this.ws) {
        this.ws.close();
      }

      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      const wsUrl = 'wss://broker.hivemq.com:8884/mqtt';

      this.ws = new WebSocket(wsUrl, 'mqtt');

      this.ws.onopen = () => {
        this.connected = true;
        this.notifyStatus('connected', 'Live Sync: Room ' + this.roomCode);
        this.sendMqttConnect(this.clientId, topic);

        // Heartbeat ping every 30s to keep connection active
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendMqttPing();
          }
        }, 30000);
      };

      this.ws.onmessage = async (event) => {
        await this.handleMqttMessage(event.data);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.notifyStatus('disconnected', 'Reconnecting to cloud...');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.notifyStatus('error', 'Sync offline (local mode active)');
      };
    } catch (e) {
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 4000);
  }

  reconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connect();
  }

  // MQTT Packet Protocol Helpers
  sendMqttConnect(clientId, topic) {
    const protocolName = 'MQTT';
    const cleanSession = 0x02;
    const keepAlive = 60;

    const payload = this.encodeString(clientId);
    const varHeader = [
      0x00, 0x04, ...this.stringToBytes(protocolName),
      0x04, // v3.1.1
      cleanSession,
      0x00, keepAlive
    ];

    const remainingLength = varHeader.length + payload.length;
    const packet = new Uint8Array([0x10, remainingLength, ...varHeader, ...payload]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
      
      // Subscribe to room topic after connect
      setTimeout(() => {
        this.sendMqttSubscribe(topic);
        // Request latest state from any online device in the room
        setTimeout(() => {
          this.requestRoomState();
        }, 200);
      }, 300);
    }
  }

  requestRoomState() {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      const p = JSON.stringify({
        senderId: this.clientId,
        action: 'REQUEST_STATE',
        roomCode: this.roomCode,
        timestamp: Date.now()
      });
      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      this.sendMqttPublish(topic, p);
    } catch (e) {}
  }

  sendMqttSubscribe(topic) {
    const packetId = 1;
    const topicBytes = this.encodeString(topic);
    const varHeader = [0x00, packetId];
    const payload = [...topicBytes, 0x00]; // QoS 0
    const remainingLength = varHeader.length + payload.length;
    const packet = new Uint8Array([0x82, remainingLength, ...varHeader, ...payload]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
    }
  }

  sendMqttPublish(topic, jsonMessage) {
    const topicBytes = this.encodeString(topic);
    const messageBytes = this.stringToBytes(jsonMessage);
    const remainingLength = topicBytes.length + messageBytes.length;
    
    const lenBytes = [];
    let l = remainingLength;
    do {
      let digit = l % 128;
      l = Math.floor(l / 128);
      if (l > 0) digit = digit | 0x80;
      lenBytes.push(digit);
    } while (l > 0);

    const packet = new Uint8Array([0x30, ...lenBytes, ...topicBytes, ...messageBytes]);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet.buffer);
    }
  }

  sendMqttPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new Uint8Array([0xC0, 0x00]).buffer);
    }
  }

  async handleMqttMessage(data) {
    try {
      let arrayBuffer;
      if (data instanceof ArrayBuffer) {
        arrayBuffer = data;
      } else if (data && typeof data.arrayBuffer === 'function') {
        arrayBuffer = await data.arrayBuffer();
      } else if (data && data.buffer instanceof ArrayBuffer) {
        arrayBuffer = data.buffer;
      } else {
        return;
      }

      const bytes = new Uint8Array(arrayBuffer);
      const packetType = bytes[0] >> 4;

      if (packetType === 3) { // PUBLISH packet
        let offset = 1;
        while (bytes[offset] & 0x80) offset++;
        offset++;

        const topicLen = (bytes[offset] << 8) | bytes[offset + 1];
        offset += 2 + topicLen;

        const payloadBytes = bytes.subarray(offset);
        const jsonStr = new TextDecoder('utf-8').decode(payloadBytes);
        const payload = JSON.parse(jsonStr);

        // Ignore messages sent by self
        if (payload.senderId !== this.clientId && payload.roomCode === this.roomCode) {
          if (payload.action === 'REQUEST_STATE') {
            // Another device in our room just connected and requested current state -> reply!
            this.broadcastState('SYNC_STATE');
          } else {
            this.applyRemoteState(payload);
          }
        }
      }
    } catch (err) {
      console.warn('Sync packet parse note:', err);
    }
  }

  // Broadcast local state to all connected devices in the room
  broadcastState(action = 'SYNC_STATE') {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      const statePayload = {
        senderId: this.clientId,
        action: action,
        timestamp: Date.now(),
        roomCode: this.roomCode,
        activePass: this.storage.getActivePass(),
        shadowPass: this.storage.getShadowPass(),
        waitList: this.storage.getWaitList(),
        blackoutRules: this.storage.getBlackoutRules(),
        schedules: this.storage.getSchedules(),
        roster: this.storage.getRoster(),
        settings: this.storage.getSettings(),
        pendingApproval: this.storage.getPendingApproval(),
        timeSimulation: this.storage.getTimeSimulation(),
        history: this.storage.getHistory().slice(0, 20)
      };

      const topic = 'hallpass/v1/rooms/' + this.roomCode;
      this.sendMqttPublish(topic, JSON.stringify(statePayload));
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  }

  // Apply state received from another device (iPad <-> Laptop)
  applyRemoteState(remotePayload) {
    if (!remotePayload || !remotePayload.roomCode || remotePayload.roomCode !== this.roomCode) return;
    
    this.isApplyingRemote = true;
    try {
      if (remotePayload.activePass !== undefined) {
        if (remotePayload.activePass && remotePayload.activePass.signOutTime) {
          // Normalize signOutTime to this receiving device's local clock frame
          const remoteTimestamp = remotePayload.timestamp || Date.now();
          const elapsedMs = Math.max(0, remoteTimestamp - remotePayload.activePass.signOutTime);
          remotePayload.activePass.signOutTime = Date.now() - elapsedMs;
        }
        this.storage.saveActivePass(remotePayload.activePass, 'remote');
      }
      if (remotePayload.shadowPass !== undefined) {
        if (remotePayload.shadowPass && remotePayload.shadowPass.signOutTime) {
          const remoteTimestamp = remotePayload.timestamp || Date.now();
          const elapsedMs = Math.max(0, remoteTimestamp - remotePayload.shadowPass.signOutTime);
          remotePayload.shadowPass.signOutTime = Date.now() - elapsedMs;
        }
        this.storage.saveShadowPass(remotePayload.shadowPass, 'remote');
      }
      if (remotePayload.waitList !== undefined) {
        this.storage.saveWaitList(remotePayload.waitList, 'remote');
      }
      if (remotePayload.pendingApproval !== undefined) {
        this.storage.savePendingApproval(remotePayload.pendingApproval, 'remote');
      }
      if (remotePayload.blackoutRules !== undefined) {
        this.storage.saveBlackoutRules(remotePayload.blackoutRules, 'remote');
      }
      if (remotePayload.schedules !== undefined && Array.isArray(remotePayload.schedules) && remotePayload.schedules.length > 0) {
        this.storage.saveSchedules(remotePayload.schedules, 'remote');
      }
      if (remotePayload.roster !== undefined && Array.isArray(remotePayload.roster) && remotePayload.roster.length > 0) {
        this.storage.saveRoster(remotePayload.roster, 'remote');
      }
      if (remotePayload.settings !== undefined && typeof remotePayload.settings === 'object' && remotePayload.settings !== null) {
        this.storage.saveSettings(remotePayload.settings, 'remote');
      }
      if (remotePayload.timeSimulation !== undefined) {
        this.storage.saveTimeSimulation(remotePayload.timeSimulation, 'remote');
        const simToggle = document.getElementById('sim-enabled-toggle');
        const simTimeInput = document.getElementById('sim-time-input');
        const badge = document.getElementById('sim-mode-badge');
        if (simToggle) simToggle.checked = !!remotePayload.timeSimulation.enabled;
        if (simTimeInput && remotePayload.timeSimulation.simulatedTime) simTimeInput.value = remotePayload.timeSimulation.simulatedTime;
        if (badge) badge.classList.toggle('hidden', !remotePayload.timeSimulation.enabled);
      }
      if (remotePayload.history !== undefined && Array.isArray(remotePayload.history)) {
        this.storage.saveHistory(remotePayload.history, 'remote');
      }

      // Trigger UI refresh on this device
      window.dispatchEvent(new CustomEvent('hallpass:statechange', { detail: { source: 'remote' } }));
    } finally {
      setTimeout(() => {
        this.isApplyingRemote = false;
      }, 200);
    }
  }

  notifyStatus(status, label) {
    this.statusListeners.forEach(cb => cb(status, label));
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
  }

  // Byte helpers
  stringToBytes(str) {
    return new TextEncoder().encode(str);
  }

  encodeString(str) {
    const bytes = this.stringToBytes(str);
    return [bytes.length >> 8, bytes.length & 0xFF, ...bytes];
  }
}
