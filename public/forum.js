// ============================================================================
// BINARY PROTOCOL CLIENT - Custom WebSocket Protocol
// ============================================================================

class BinaryProtocolClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.buffer = new Uint8Array(0);
    this.handlers = new Map();
    this.connected = false;
    this.clientId = null;
    this.MAGIC_BYTES = new Uint8Array([0x42, 0x50]);
    this.PROTOCOL_VERSION = 0x01;
    
    this.OpCode = {
      PING: 0x00, PONG: 0x01, HANDSHAKE: 0x02, HANDSHAKE_ACK: 0x03,
      USER_JOIN: 0x10, USER_LEAVE: 0x11, USERS_ONLINE: 0x12,
      CHAT_JOIN: 0x20, CHAT_LEAVE: 0x21, CHAT_MESSAGE: 0x22, CHAT_HISTORY: 0x23,
      TYPING_START: 0x24, TYPING_STOP: 0x25,
      VOICE_JOIN: 0x30, VOICE_LEAVE: 0x31, VOICE_USERS: 0x32,
      DM_SEND: 0x40, DM_RECEIVE: 0x41, DM_SENT: 0x42,
      CALL_OFFER: 0x50, CALL_ANSWER: 0x51, ICE_CANDIDATE: 0x52,
      CALL_ENDED: 0x53, CALL_REJECTED: 0x54, CALL_FAILED: 0x55,
      ERROR: 0xfe, CLOSE: 0xff
    };
  }

  concatArrays(a, b) {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
  }

  buildString(str) {
    const bytes = new TextEncoder().encode(str);
    const buffer = new Uint8Array(2 + bytes.length);
    new DataView(buffer.buffer).setUint16(0, bytes.length, false);
    buffer.set(bytes, 2);
    return buffer;
  }

  parseString(buffer, offset = 0) {
    const len = new DataView(buffer.buffer, buffer.byteOffset).getUint16(offset, false);
    const str = new TextDecoder().decode(buffer.slice(offset + 2, offset + 2 + len));
    return { value: str, nextOffset: offset + 2 + len };
  }

  buildUsersList(users) {
    const userBuffers = users.map(u => this.buildString(u));
    const totalLen = 2 + userBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const buffer = new Uint8Array(totalLen);
    new DataView(buffer.buffer).setUint16(0, users.length, false);
    let offset = 2;
    userBuffers.forEach(buf => { buffer.set(buf, offset); offset += buf.length; });
    return buffer;
  }

  parseUsersList(buffer) {
    const count = new DataView(buffer.buffer, buffer.byteOffset).getUint16(0, false);
    const users = [];
    let offset = 2;
    for (let i = 0; i < count; i++) {
      const result = this.parseString(buffer, offset);
      users.push(result.value);
      offset = result.nextOffset;
    }
    return users;
  }

  buildUserJoin(username, pfp) {
    return this.concatArrays(this.buildString(username), this.buildString(pfp));
  }

  buildChatMessage(username, pfp, message, timestamp) {
    return this.concatArrays(
      this.concatArrays(this.buildString(username), this.buildString(pfp)),
      this.concatArrays(this.buildString(message), this.buildString(timestamp))
    );
  }

  parseChatMessage(buffer) {
    let offset = 0;
    const username = this.parseString(buffer, offset);
    offset = username.nextOffset;
    const pfp = this.parseString(buffer, offset);
    offset = pfp.nextOffset;
    const message = this.parseString(buffer, offset);
    offset = message.nextOffset;
    const timestamp = this.parseString(buffer, offset);
    return { username: username.value, pfp: pfp.value, message: message.value, timestamp: timestamp.value };
  }

  buildChatMessageWithCommunity(communityId, username, pfp, message, timestamp) {
    return this.concatArrays(this.buildString(communityId), this.buildChatMessage(username, pfp, message, timestamp));
  }

  parseChatMessageWithCommunity(buffer) {
    const communityId = this.parseString(buffer, 0);
    const messageData = this.parseChatMessage(buffer.slice(communityId.nextOffset));
    return { communityId: communityId.value, ...messageData };
  }

  buildDirectMessage(to, from, pfp, message) {
    return this.concatArrays(
      this.concatArrays(this.buildString(to), this.buildString(from)),
      this.concatArrays(this.buildString(pfp), this.buildString(message))
    );
  }

  parseDirectMessage(buffer) {
    let offset = 0;
    const to = this.parseString(buffer, offset);
    offset = to.nextOffset;
    const from = this.parseString(buffer, offset);
    offset = from.nextOffset;
    const pfp = this.parseString(buffer, offset);
    offset = pfp.nextOffset;
    const message = this.parseString(buffer, offset);
    return { to: to.value, from: from.value, pfp: pfp.value, message: message.value };
  }

  buildWebRTC(to, from, data) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return this.concatArrays(this.concatArrays(this.buildString(to), this.buildString(from)), this.buildString(dataStr));
  }

  parseWebRTC(buffer) {
    let offset = 0;
    const to = this.parseString(buffer, offset);
    offset = to.nextOffset;
    const from = this.parseString(buffer, offset);
    offset = from.nextOffset;
    const data = this.parseString(buffer, offset);
    return { to: to.value, from: from.value, data: data.value };
  }

  encodeFrame(opcode, payload = new Uint8Array(0)) {
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    header[0] = this.MAGIC_BYTES[0];
    header[1] = this.MAGIC_BYTES[1];
    header[2] = this.PROTOCOL_VERSION;
    header[3] = opcode;
    view.setUint32(4, payload.length, false);
    return this.concatArrays(header, payload);
  }

  decodeFrame(buffer) {
    if (buffer.length < 8) return null;
    if (buffer[0] !== this.MAGIC_BYTES[0] || buffer[1] !== this.MAGIC_BYTES[1]) {
      throw new Error('Invalid magic bytes');
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset);
    const version = buffer[2];
    const opcode = buffer[3];
    const length = view.getUint32(4, false);
    if (buffer.length < 8 + length) return null;
    return { version, opcode, payload: buffer.slice(8, 8 + length), remaining: buffer.slice(8 + length) };
  }

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = 'arraybuffer';

    this.socket.onopen = () => {
      console.log('[BINARY] Connected');
      this.emit('open');
    };

    this.socket.onmessage = (event) => {
      this.buffer = this.concatArrays(this.buffer, new Uint8Array(event.data));
      while (this.buffer.length >= 8) {
        try {
          const frame = this.decodeFrame(this.buffer);
          if (!frame) break;
          this.buffer = frame.remaining;
          this.processFrame(frame);
        } catch (err) {
          console.error('[BINARY] Decode error:', err.message);
          this.emit('error', err);
          this.disconnect();
          return;
        }
      }
    };

    this.socket.onclose = () => {
      this.connected = false;
      console.log('[BINARY] Disconnected');
      this.emit('disconnect');
    };

    this.socket.onerror = (event) => {
      console.error('[BINARY] Error');
      this.emit('error', new Error('WebSocket error'));
    };
  }

  processFrame(frame) {
    const { opcode, payload } = frame;
    switch (opcode) {
      case this.OpCode.HANDSHAKE:
        this.clientId = this.parseString(payload, 0).value;
        console.log('[BINARY] Client ID:', this.clientId);
        this.sendFrame(this.OpCode.HANDSHAKE_ACK, this.buildString(this.clientId));
        this.connected = true;
        this.emit('ready', this.clientId);
        break;
      case this.OpCode.PING:
        this.sendFrame(this.OpCode.PONG, payload);
        break;
      case this.OpCode.USERS_ONLINE:
        this.emit('users:online', this.parseUsersList(payload));
        break;
      case this.OpCode.CHAT_MESSAGE:
        this.emit('chat:message', this.parseChatMessageWithCommunity(payload));
        break;
      case this.OpCode.CHAT_HISTORY:
        this.emit('chat:history', []);
        break;
      case this.OpCode.DM_RECEIVE:
        this.emit('dm:receive', this.parseDirectMessage(payload));
        break;
      case this.OpCode.DM_SENT:
        this.emit('dm:sent', this.parseDirectMessage(payload));
        break;
      case this.OpCode.TYPING_START:
        const ts = this.parseChatMessageWithCommunity(payload);
        this.emit('typing:start', { communityId: ts.communityId, username: ts.username });
        break;
      case this.OpCode.TYPING_STOP:
        const tsp = this.parseChatMessageWithCommunity(payload);
        this.emit('typing:stop', { communityId: tsp.communityId, username: tsp.username });
        break;
      case this.OpCode.VOICE_USERS:
        this.emit('voice:users', this.parseChatMessageWithCommunity(payload));
        break;
      case this.OpCode.CALL_OFFER:
        const offer = this.parseWebRTC(payload);
        const offerData = JSON.parse(offer.data);
        this.emit('call:offer', { to: offer.to, from: offer.from, offer: offerData.offer, callType: offerData.callType });
        break;
      case this.OpCode.CALL_ANSWER:
        const answer = this.parseWebRTC(payload);
        const answerData = JSON.parse(answer.data);
        this.emit('call:answer', { to: answer.to, from: answer.from, answer: answerData.answer });
        break;
      case this.OpCode.ICE_CANDIDATE:
        const ice = this.parseWebRTC(payload);
        const iceData = JSON.parse(ice.data);
        this.emit('call:ice-candidate', { to: ice.to, candidate: iceData.candidate });
        break;
      case this.OpCode.CALL_ENDED:
        const ended = this.parseWebRTC(payload);
        this.emit('call:ended', { to: ended.to, from: ended.from });
        break;
      case this.OpCode.CALL_REJECTED:
        const rejected = this.parseWebRTC(payload);
        this.emit('call:rejected', { to: rejected.to, from: rejected.from });
        break;
      case this.OpCode.CALL_FAILED:
        this.emit('call:error', { message: this.parseString(payload, 0).value });
        break;
      case this.OpCode.ERROR:
        this.emit('error', new Error(this.parseString(payload, 0).value));
        break;
      case this.OpCode.CLOSE:
        this.disconnect();
        break;
    }
  }

  sendFrame(opcode, payload = new Uint8Array(0)) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(this.encodeFrame(opcode, payload).buffer);
    return true;
  }

  userJoin(username, pfp) { this.sendFrame(this.OpCode.USER_JOIN, this.buildUserJoin(username, pfp)); }
  chatJoin(communityId) { this.sendFrame(this.OpCode.CHAT_JOIN, this.buildString(communityId)); }
  chatMessage(communityId, username, pfp, message) {
    this.sendFrame(this.OpCode.CHAT_MESSAGE, this.buildChatMessageWithCommunity(communityId, username, pfp, message, new Date().toISOString()));
  }
  sendDirectMessage(to, from, pfp, message) { this.sendFrame(this.OpCode.DM_SEND, this.buildDirectMessage(to, from, pfp, message)); }
  typingStart(communityId, username) { this.sendFrame(this.OpCode.TYPING_START, this.concatArrays(this.buildString(communityId), this.buildString(username))); }
  typingStop(communityId, username) { this.sendFrame(this.OpCode.TYPING_STOP, this.concatArrays(this.buildString(communityId), this.buildString(username))); }
  voiceJoin(communityId) { this.sendFrame(this.OpCode.VOICE_JOIN, this.buildString(communityId)); }
  voiceLeave(communityId) { this.sendFrame(this.OpCode.VOICE_LEAVE, this.buildString(communityId)); }
  callOffer(to, from, offer, callType) { this.sendFrame(this.OpCode.CALL_OFFER, this.buildWebRTC(to, from, JSON.stringify({ offer, callType }))); }
  callAnswer(to, from, answer) { this.sendFrame(this.OpCode.CALL_ANSWER, this.buildWebRTC(to, from, JSON.stringify({ answer }))); }
  sendIceCandidate(to, from, candidate) { this.sendFrame(this.OpCode.ICE_CANDIDATE, this.buildWebRTC(to, from, JSON.stringify({ candidate }))); }
  callEnded(to, from) { this.sendFrame(this.OpCode.CALL_ENDED, this.buildWebRTC(to, from, '')); }
  callReject(to, from) { this.sendFrame(this.OpCode.CALL_REJECTED, this.buildWebRTC(to, from, '')); }
  disconnect() { if (this.socket) { this.sendFrame(this.OpCode.CLOSE); this.socket.close(); this.socket = null; } }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  once(event, handler) {
    const wrapper = (...args) => { handler(...args); this.off(event, wrapper); };
    this.on(event, wrapper);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  emit(event, ...args) {
    const handlers = this.handlers.get(event);
    if (handlers) handlers.forEach(h => h(...args));
  }

  isConnected() { return this.connected && this.socket?.readyState === WebSocket.OPEN; }
  getClientId() { return this.clientId; }
}

// ============================================================================
// WEBSOCKET CONNECTION MANAGER
// ============================================================================

let binaryClient;
let socketConnected = false;
let reconnectInterval;

function connectWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('[BINARY] Connecting to:', wsUrl);
    binaryClient = new BinaryProtocolClient(wsUrl);
    
    binaryClient.on('ready', (clientId) => {
      console.log('[BINARY] Ready, ID:', clientId);
      socketConnected = true;
      if (reconnectInterval) { clearInterval(reconnectInterval); reconnectInterval = null; }
      if (currentUser) {
        binaryClient.userJoin(currentUser.username, currentUser.pfp);
        binaryClient.chatJoin('main');
      }
    });
    
    binaryClient.on('users:online', (users) => console.log('[BINARY] Online:', users));
    binaryClient.on('chat:message', (data) => addChatMessage(data));
    binaryClient.on('chat:history', (messages) => messages.forEach(msg => addChatMessage(msg)));
    
    binaryClient.on('dm:receive', (data) => {
      const dmData = {
        id: Date.now().toString(), from: data.from, to: data.to, pfp: data.pfp,
        message: data.message, timestamp: new Date().toISOString(), read: false
      };
      addDMMessage(dmData);
      addDMConversation(data.from);
      updateMessageCount();
    });
    
    binaryClient.on('dm:sent', (data) => {
      const dmData = {
        id: Date.now().toString(), from: data.from, to: data.to, pfp: data.pfp,
        message: data.message, timestamp: new Date().toISOString(), read: true
      };
      addDMMessage(dmData);
      addDMConversation(data.to);
    });
    
    binaryClient.on('call:offer', (data) => showIncomingCall(data));
    binaryClient.on('call:answer', (data) => handleCallAnswer(data));
    binaryClient.on('call:ice-candidate', (data) => handleIceCandidate(data));
    binaryClient.on('call:ended', () => { stopRingtone(); endCall(); showAlert('Call ended', 'CALL', 'fa-phone'); });
    binaryClient.on('call:rejected', () => { stopRingtone(); endCall(); showAlert('Call rejected', 'CALL', 'fa-phone-slash'); });
    binaryClient.on('call:error', (data) => { stopRingtone(); endCall(); showAlert(data.message || 'Call failed', 'ERROR', 'fa-exclamation-triangle'); });
    binaryClient.on('typing:start', (data) => showTypingIndicator(data.username));
    binaryClient.on('typing:stop', (data) => hideTypingIndicator(data.username));
    binaryClient.on('voice:users', (data) => console.log('[BINARY] Voice:', data));
    
    binaryClient.on('disconnect', () => {
      socketConnected = false;
      if (!reconnectInterval) {
        reconnectInterval = setInterval(() => { console.log('[BINARY] Reconnecting...'); connectWebSocket(); }, 5000);
      }
    });
    
    binaryClient.on('error', (err) => { console.error('[BINARY] Error:', err); socketConnected = false; });
    binaryClient.connect();
  } catch (error) {
    console.log('[BINARY] Not available');
    socketConnected = false;
  }
}

function sendWebSocket(type, data) {
  if (!binaryClient || !socketConnected) return;
  switch (type) {
    case 'user:join': binaryClient.userJoin(data.username, data.pfp); break;
    case 'chat:join': binaryClient.chatJoin(data); break;
    case 'chat:message': binaryClient.chatMessage(data.communityId, data.username, data.pfp, data.message); break;
    case 'dm:send': binaryClient.sendDirectMessage(data.to, data.from, data.pfp, data.message); break;
    case 'typing:start': binaryClient.typingStart(data.communityId, data.username); break;
    case 'typing:stop': binaryClient.typingStop(data.communityId, data.username); break;
    case 'voice:join': binaryClient.voiceJoin(data.communityId); break;
    case 'voice:leave': binaryClient.voiceLeave(data.communityId); break;
    case 'call:offer': binaryClient.callOffer(data.to, data.from, data.offer, data.callType); break;
    case 'call:answer': binaryClient.callAnswer(data.to, data.from, data.answer); break;
    case 'call:ice-candidate': binaryClient.sendIceCandidate(data.to, data.from, data.candidate); break;
    case 'call:ended': binaryClient.callEnded(data.to, data.from); break;
    case 'call:reject': binaryClient.callReject(data.to, data.from); break;
  }
}

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let currentUser = null;
let currentCommunity = null;
let currentSort = 'new';
let currentTimeRange = 'all';
let currentDMUser = null;
let dmConversations = new Map();

// WebRTC variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let callActive = false;
let callType = null;
let isMuted = false;
let isVideoOff = false;
let pendingIceCandidates = [];
let incomingCallData = null;
let isCallMinimized = false;
let remoteUserInfo = null;
let ringtoneAudio = null;
let localAudioContext = null;
let remoteAudioContext = null;
let localAnalyser = null;
let remoteAnalyser = null;
let localVADInterval = null;
let remoteVADInterval = null;
const SPEAKING_THRESHOLD = 30;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// ============================================================================
// MODAL FUNCTIONS
// ============================================================================

function showAlert(message, title = 'NOTIFICATION', icon = 'fa-info-circle') {
  document.getElementById('alert-title').innerHTML = `<i class="fas ${icon}"></i> ${title}`;
  document.getElementById('alert-message').textContent = message;
  document.getElementById('custom-alert-modal').classList.add('open');
}

function closeCustomAlert() {
  document.getElementById('custom-alert-modal').classList.remove('open');
}

function showConfirm(message, title = 'CONFIRM') {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').innerHTML = `<i class="fas fa-question-circle"></i> ${title}`;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('custom-confirm-modal').classList.add('open');
    
    const yesBtn = document.getElementById('confirm-yes-btn');
    const noBtn = document.getElementById('confirm-no-btn');
    
    const handleYes = () => { cleanup(); resolve(true); };
    const handleNo = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      document.getElementById('custom-confirm-modal').classList.remove('open');
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
  });
}

function showPrompt(message, title = 'INPUT', placeholder = 'Enter your text...') {
  return new Promise((resolve) => {
    document.getElementById('prompt-title').innerHTML = `<i class="fas fa-edit"></i> ${title}`;
    document.getElementById('prompt-message').textContent = message;
    const input = document.getElementById('prompt-input');
    input.value = '';
    input.placeholder = placeholder;
    document.getElementById('custom-prompt-modal').classList.add('open');
    input.focus();
    
    const submitBtn = document.getElementById('prompt-submit-btn');
    const cancelBtn = document.getElementById('prompt-cancel-btn');
    
    const handleSubmit = () => { const value = input.value.trim(); cleanup(); resolve(value || null); };
    const handleCancel = () => { cleanup(); resolve(null); };
    const handleEnter = (e) => { if (e.key === 'Enter' && e.ctrlKey) handleSubmit(); };
    const cleanup = () => {
      document.getElementById('custom-prompt-modal').classList.remove('open');
      submitBtn.removeEventListener('click', handleSubmit);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keypress', handleEnter);
    };
    
    submitBtn.addEventListener('click', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keypress', handleEnter);
  });
}

// ============================================================================
// WEBRTC FUNCTIONS (Part 1 - Incoming Calls & Setup)
// ============================================================================

async function showIncomingCall(data) {
  console.log('[WebRTC] Incoming call from:', data.from);
  incomingCallData = data;
  
  ringtoneAudio = new Audio('https://www.myinstants.com/media/sounds/deltarune-ringtone_SnkHGfF.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio.volume = 0.2;
  ringtoneAudio.play().catch(err => console.error('Ringtone failed:', err));
  
  try {
    const callerResponse = await fetch(`/api/users/${data.from}`);
    if (callerResponse.ok) {
      const callerData = await callerResponse.json();
      document.getElementById('incoming-caller-avatar').src = callerData.user.pfp;
      remoteUserInfo = callerData.user;
    } else {
      document.getElementById('incoming-caller-avatar').src = '/uploads/default-0.png';
    }
  } catch (error) {
    document.getElementById('incoming-caller-avatar').src = '/uploads/default-0.png';
  }
  
  document.getElementById('incoming-caller-username').textContent = data.from;
  const callTypeText = data.callType === 'video' ? 'Video Call' : 'Voice Call';
  const callTypeIcon = data.callType === 'video' ? 'fa-video' : 'fa-phone-volume';
  document.getElementById('incoming-call-type').innerHTML = `<i class="fas ${callTypeIcon}"></i><span>Incoming ${callTypeText}</span>`;
  document.getElementById('incoming-call-modal').classList.add('active');
}

function stopRingtone() {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
    ringtoneAudio = null;
  }
}

document.getElementById('accept-call-btn').addEventListener('click', async () => {
  stopRingtone();
  document.getElementById('incoming-call-modal').classList.remove('active');
  if (!incomingCallData) return;
  await handleCallOffer(incomingCallData);
  incomingCallData = null;
});

document.getElementById('decline-call-btn').addEventListener('click', () => {
  stopRingtone();
  document.getElementById('incoming-call-modal').classList.remove('active');
  if (!incomingCallData) return;
  sendWebSocket('call:reject', { to: incomingCallData.from, from: currentUser.username });
  incomingCallData = null;
});

async function handleCallOffer(data) {
  try {
    callType = data.callType;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
    createCallUI(callType === 'video', data.from, remoteUserInfo?.pfp || '/uploads/default-0.png', currentUser.pfp);
    setupPeerConnection(data.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    while (pendingIceCandidates.length > 0) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(pendingIceCandidates.shift()));
    }
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    sendWebSocket('call:answer', { to: data.from, from: currentUser.username, answer: answer });
  } catch (error) {
    console.error('[WebRTC] Error:', error);
    showAlert('Failed to accept call: ' + error.message, 'ERROR', 'fa-exclamation-triangle');
    endCall();
  }
}

async function handleCallAnswer(data) {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    while (pendingIceCandidates.length > 0) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(pendingIceCandidates.shift()));
    }
    document.getElementById('call-status').textContent = 'Connected';
    document.getElementById('widget-status').textContent = 'Connected';
  } catch (error) {
    console.error('[WebRTC] Answer error:', error);
    showAlert('Call connection failed', 'ERROR', 'fa-exclamation-triangle');
    endCall();
  }
}

async function handleIceCandidate(data) {
  try {
    if (peerConnection && peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } else {
      pendingIceCandidates.push(data.candidate);
    }
  } catch (error) {
    console.error('[WebRTC] ICE error:', error);
  }
}

function setupPeerConnection(remoteUsername) {
  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      document.getElementById('remote-video').srcObject = remoteStream;
    }
    remoteStream.addTrack(event.track);
    document.getElementById('call-status').textContent = 'Connected';
    document.getElementById('widget-status').textContent = 'Connected';
    if (event.track.kind === 'audio') setTimeout(() => setupVoiceActivityDetection(), 500);
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) sendWebSocket('call:ice-candidate', { to: remoteUsername, from: currentUser.username, candidate: event.candidate });
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection.iceConnectionState === 'connected') {
      document.getElementById('call-status').textContent = 'Connected';
      document.getElementById('widget-status').textContent = 'Connected';
    } else if (peerConnection.iceConnectionState === 'disconnected') {
      document.getElementById('call-status').textContent = 'Reconnecting...';
      document.getElementById('widget-status').textContent = 'Reconnecting...';
    } else if (peerConnection.iceConnectionState === 'failed') {
      showAlert('Connection failed', 'ERROR', 'fa-exclamation-triangle');
      endCall();
    }
  };
}

function createCallUI(isVideo, remoteUsername, remotePfp, localPfp) {
  callActive = true;
  document.getElementById('remote-username').textContent = remoteUsername;
  document.getElementById('local-username').textContent = 'You';
  document.getElementById('remote-avatar').src = remotePfp;
  document.getElementById('local-avatar').src = localPfp;
  document.getElementById('widget-avatar').src = remotePfp;
  document.getElementById('widget-username').textContent = remoteUsername;
  document.getElementById('widget-status').textContent = 'Calling...';
  
  if (isVideo) {
    document.getElementById('call-header-title').innerHTML = '<i class="fas fa-video"></i> Video Call';
    document.getElementById('call-grid').classList.remove('voice-call');
    document.getElementById('video-btn').classList.remove('hidden');
    document.getElementById('widget-video-btn').classList.remove('hidden');
    document.getElementById('local-video-icon').classList.remove('hidden');
    document.getElementById('remote-video-icon').classList.remove('hidden');
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('local-video').classList.remove('hidden');
    document.getElementById('local-avatar-container').classList.add('hidden');
  } else {
    document.getElementById('call-header-title').innerHTML = '<i class="fas fa-phone-volume"></i> Voice Call';
    document.getElementById('call-grid').classList.add('voice-call');
    document.getElementById('video-btn').classList.add('hidden');
    document.getElementById('widget-video-btn').classList.add('hidden');
    document.getElementById('local-video-icon').classList.add('hidden');
    document.getElementById('remote-video-icon').classList.add('hidden');
    document.getElementById('local-video').classList.add('hidden');
    document.getElementById('local-avatar-container').classList.remove('hidden');
    document.getElementById('remote-video').classList.add('hidden');
    document.getElementById('remote-avatar-container').classList.remove('hidden');
  }
  document.getElementById('call-container').classList.add('active');
  setupVoiceActivityDetection();
}

// ============================================================================
// WEBRTC FUNCTIONS (Part 2 - Voice Activity Detection)
// ============================================================================

function setupVoiceActivityDetection() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      try {
        localAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = localAudioContext.createMediaStreamSource(localStream);
        localAnalyser = localAudioContext.createAnalyser();
        localAnalyser.fftSize = 256;
        localAnalyser.smoothingTimeConstant = 0.8;
        source.connect(localAnalyser);
        startLocalVAD();
      } catch (error) {
        console.error('[VAD] Local error:', error);
      }
    }
  }

  setTimeout(() => {
    if (remoteStream) {
      const audioTrack = remoteStream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          remoteAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = remoteAudioContext.createMediaStreamSource(remoteStream);
          remoteAnalyser = remoteAudioContext.createAnalyser();
          remoteAnalyser.fftSize = 256;
          remoteAnalyser.smoothingTimeConstant = 0.8;
          source.connect(remoteAnalyser);
          startRemoteVAD();
        } catch (error) {
          console.error('[VAD] Remote error:', error);
        }
      }
    }
  }, 1000);
}

function getAudioLevel(analyser) {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
  return sum / bufferLength;
}

function startLocalVAD() {
  if (localVADInterval) clearInterval(localVADInterval);
  const localTile = document.getElementById('local-tile');
  let wasSpeaking = false;
  localVADInterval = setInterval(() => {
    if (!localAnalyser || !localStream || isMuted) {
      if (wasSpeaking) { localTile.classList.remove('speaking'); wasSpeaking = false; }
      return;
    }
    const level = getAudioLevel(localAnalyser);
    const isSpeaking = level > SPEAKING_THRESHOLD;
    if (isSpeaking && !wasSpeaking) { localTile.classList.add('speaking'); wasSpeaking = true; }
    else if (!isSpeaking && wasSpeaking) { localTile.classList.remove('speaking'); wasSpeaking = false; }
  }, 100);
}

function startRemoteVAD() {
  if (remoteVADInterval) clearInterval(remoteVADInterval);
  const remoteTile = document.getElementById('remote-tile');
  const widgetAvatar = document.getElementById('widget-avatar');
  let wasSpeaking = false;
  remoteVADInterval = setInterval(() => {
    if (!remoteAnalyser || !remoteStream) {
      if (wasSpeaking) { remoteTile.classList.remove('speaking'); widgetAvatar.classList.remove('speaking'); wasSpeaking = false; }
      return;
    }
    const level = getAudioLevel(remoteAnalyser);
    const isSpeaking = level > SPEAKING_THRESHOLD;
    if (isSpeaking && !wasSpeaking) { remoteTile.classList.add('speaking'); widgetAvatar.classList.add('speaking'); wasSpeaking = true; }
    else if (!isSpeaking && wasSpeaking) { remoteTile.classList.remove('speaking'); widgetAvatar.classList.remove('speaking'); wasSpeaking = false; }
  }, 100);
}

function stopVoiceActivityDetection() {
  if (localVADInterval) { clearInterval(localVADInterval); localVADInterval = null; }
  if (remoteVADInterval) { clearInterval(remoteVADInterval); remoteVADInterval = null; }
  if (localAudioContext) { localAudioContext.close(); localAudioContext = null; }
  if (remoteAudioContext) { remoteAudioContext.close(); remoteAudioContext = null; }
  localAnalyser = null;
  remoteAnalyser = null;
  document.getElementById('local-tile').classList.remove('speaking');
  document.getElementById('remote-tile').classList.remove('speaking');
  document.getElementById('widget-avatar').classList.remove('speaking');
}

// ============================================================================
// WEBRTC FUNCTIONS (Part 3 - Controls)
// ============================================================================

function toggleMute() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMuted = !audioTrack.enabled;
    const muteBtn = document.getElementById('mute-btn');
    const widgetMuteBtn = document.getElementById('widget-mute-btn');
    const localMuteIcon = document.getElementById('local-mute-icon');
    if (isMuted) {
      muteBtn.classList.add('active');
      widgetMuteBtn.classList.add('active');
      muteBtn.querySelector('i').className = 'fas fa-microphone-slash';
      widgetMuteBtn.querySelector('i').className = 'fas fa-microphone-slash';
      muteBtn.querySelector('.control-label').textContent = 'Unmute';
      localMuteIcon.classList.add('muted');
      localMuteIcon.querySelector('i').className = 'fas fa-microphone-slash';
    } else {
      muteBtn.classList.remove('active');
      widgetMuteBtn.classList.remove('active');
      muteBtn.querySelector('i').className = 'fas fa-microphone';
      widgetMuteBtn.querySelector('i').className = 'fas fa-microphone';
      muteBtn.querySelector('.control-label').textContent = 'Mute';
      localMuteIcon.classList.remove('muted');
      localMuteIcon.querySelector('i').className = 'fas fa-microphone';
    }
  }
}

function toggleVideo() {
  if (!localStream || callType !== 'video') return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoOff = !videoTrack.enabled;
    const videoBtn = document.getElementById('video-btn');
    const widgetVideoBtn = document.getElementById('widget-video-btn');
    const localVideo = document.getElementById('local-video');
    const localAvatarContainer = document.getElementById('local-avatar-container');
    const localVideoIcon = document.getElementById('local-video-icon');
    if (isVideoOff) {
      videoBtn.classList.add('active');
      widgetVideoBtn.classList.add('active');
      videoBtn.querySelector('i').className = 'fas fa-video-slash';
      widgetVideoBtn.querySelector('i').className = 'fas fa-video-slash';
      videoBtn.querySelector('.control-label').textContent = 'Turn On Camera';
      localVideo.classList.add('hidden');
      localAvatarContainer.classList.remove('hidden');
      localVideoIcon.classList.add('video-off');
      localVideoIcon.querySelector('i').className = 'fas fa-video-slash';
    } else {
      videoBtn.classList.remove('active');
      widgetVideoBtn.classList.remove('active');
      videoBtn.querySelector('i').className = 'fas fa-video';
      widgetVideoBtn.querySelector('i').className = 'fas fa-video';
      videoBtn.querySelector('.control-label').textContent = 'Turn Off Camera';
      localVideo.classList.remove('hidden');
      localAvatarContainer.classList.add('hidden');
      localVideoIcon.classList.remove('video-off');
      localVideoIcon.querySelector('i').className = 'fas fa-video';
    }
  }
}

function minimizeCall() {
  isCallMinimized = true;
  document.getElementById('call-container').classList.remove('active');
  document.getElementById('call-widget').classList.add('active');
}

function expandCall() {
  isCallMinimized = false;
  document.getElementById('call-widget').classList.remove('active');
  document.getElementById('call-container').classList.add('active');
}

function endCall() {
  stopRingtone();
  stopVoiceActivityDetection();
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  document.getElementById('call-container').classList.remove('active');
  document.getElementById('call-widget').classList.remove('active');
  document.getElementById('incoming-call-modal').classList.remove('active');
  document.getElementById('local-video').srcObject = null;
  document.getElementById('remote-video').srcObject = null;
  if (callActive && remoteUserInfo) {
    sendWebSocket('call:ended', { to: remoteUserInfo.username, from: currentUser.username });
  }
  callActive = false;
  callType = null;
  isMuted = false;
  isVideoOff = false;
  remoteStream = null;
  pendingIceCandidates = [];
  incomingCallData = null;
  isCallMinimized = false;
  remoteUserInfo = null;
  document.getElementById('mute-btn').classList.remove('active');
  document.getElementById('mute-btn').querySelector('i').className = 'fas fa-microphone';
  document.getElementById('video-btn').classList.remove('active');
  document.getElementById('video-btn').querySelector('i').className = 'fas fa-video';
  document.getElementById('widget-mute-btn').classList.remove('active');
  document.getElementById('widget-mute-btn').querySelector('i').className = 'fas fa-microphone';
  document.getElementById('widget-video-btn').classList.remove('active');
  document.getElementById('widget-video-btn').querySelector('i').className = 'fas fa-video';
  document.getElementById('call-grid').classList.remove('voice-call');
}

document.getElementById('mute-btn').addEventListener('click', toggleMute);
document.getElementById('video-btn').addEventListener('click', toggleVideo);
document.getElementById('hangup-btn').addEventListener('click', endCall);
document.getElementById('widget-mute-btn').addEventListener('click', toggleMute);
document.getElementById('widget-video-btn').addEventListener('click', toggleVideo);
document.getElementById('widget-hangup-btn').addEventListener('click', endCall);
document.getElementById('minimize-call-btn').addEventListener('click', minimizeCall);
document.getElementById('expand-call-btn').addEventListener('click', expandCall);

// ============================================================================
// CURSOR ANIMATION
// ============================================================================

const cursorDot = document.querySelector('.cursor-dot');
let mouseX = 0, mouseY = 0, cursorX = 0, cursorY = 0;
document.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
function animateCursor() {
  cursorX += (mouseX - cursorX) * 0.2;
  cursorY += (mouseY - cursorY) * 0.2;
  cursorDot.style.left = cursorX + 'px';
  cursorDot.style.top = cursorY + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

// ============================================================================
// INITIALIZATION & APP SETUP
// ============================================================================

async function init() {
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) { window.location.href = '/'; return; }
    const data = await response.json();
    currentUser = data.user;
    if (!currentUser.level) currentUser.level = 1;
    if (!currentUser.xp) currentUser.xp = 0;
    if (!currentUser.streak) currentUser.streak = 0;
    if (!currentUser.reputation) currentUser.reputation = 0;
    
    connectWebSocket();
    
    document.getElementById('user-pfp-icon').src = currentUser.pfp;
    document.getElementById('user-profile-btn').href = `/profile/${currentUser.username}`;
    updateXPDisplay();
    document.getElementById('chat-container').classList.add('active');
    
    await loadPreferences();
    await Promise.all([loadCommunities(), loadPosts(), loadDrafts(), loadAchievements(), loadNotifications(), loadAllDMConversations()]);
    setupEventListeners();
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openMessages') === 'true') setTimeout(() => toggleMessages(), 500);
  } catch (error) {
    window.location.href = '/';
  }
}

function updateXPDisplay() {
  if (!currentUser) return;
  const level = currentUser.level || 1;
  const xp = currentUser.xp || 0;
  const xpInLevel = xp % 100;
  document.getElementById('user-level').textContent = level;
  document.getElementById('user-xp-fill').style.width = xpInLevel + '%';
}

async function loadPreferences() {
  try {
    const response = await fetch('/api/preferences');
    const data = await response.json();
    const prefs = data.preferences;
    if (prefs.theme === 'light') document.body.classList.add('light-theme');
    if (prefs.viewMode === 'compact') document.body.classList.add('compact-view');
    document.documentElement.style.fontSize = prefs.fontSize === 'small' ? '14px' : prefs.fontSize === 'large' ? '18px' : '16px';
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

function setupEventListeners() {
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (e.target.value.length >= 2) performSearch(e.target.value);
      else document.getElementById('search-results').classList.remove('active');
    }, 300);
  });
  
  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      loadPosts();
    });
  });
  
  document.getElementById('time-range-select').addEventListener('change', (e) => { currentTimeRange = e.target.value; loadPosts(); });
  document.getElementById('notifications-btn').addEventListener('click', toggleNotifications);
  document.getElementById('messages-btn').addEventListener('click', toggleMessages);
  document.getElementById('leaderboard-btn').addEventListener('click', () => openModal('leaderboard-modal'));
  document.getElementById('achievements-btn').addEventListener('click', () => openModal('achievements-modal'));
  document.getElementById('settings-btn').addEventListener('click', () => openModal('settings-modal'));
  document.getElementById('create-community-btn').addEventListener('click', () => openModal('create-community-modal'));
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('new-post-btn').addEventListener('click', () => openModal('create-post-modal'));
  document.getElementById('submit-post-btn').addEventListener('click', submitPost);
  document.getElementById('cancel-post-btn').addEventListener('click', () => closeModal('create-post-modal'));
  document.getElementById('save-draft-btn').addEventListener('click', saveDraft);
  document.getElementById('submit-community-btn').addEventListener('click', submitCommunity);
  document.getElementById('cancel-community-btn').addEventListener('click', () => closeModal('create-community-modal'));
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
  document.getElementById('dm-send-btn').addEventListener('click', sendDM);
  document.getElementById('dm-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendDM(); });
  document.getElementById('notifications-toggle').addEventListener('click', function() { this.classList.toggle('active'); });
  document.getElementById('reply-submit-btn').addEventListener('click', submitReply);
  document.getElementById('reply-input').addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } });
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('post-detail-view').classList.remove('active');
    document.getElementById('posts-list-view').classList.remove('hidden');
    window.currentPostId = null;
    window.scrollTo(0, 0);
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
  });
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

async function performSearch(query) {
  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    const resultsDiv = document.getElementById('search-results');
    if (data.results.length === 0) {
      resultsDiv.innerHTML = '<div style="padding: 1rem; text-align: center; color: rgba(255,255,255,0.5);">No results found</div>';
    } else {
      resultsDiv.innerHTML = data.results.map(post => `
        <div class="search-result-item" onclick="viewPost('${post.id}')">
          <div style="color: #ff6b8a; font-weight: 600;">${escapeHtml(post.title)}</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 0.25rem;">by ${post.author} • ${post.category}</div>
        </div>
      `).join('');
    }
    resultsDiv.classList.add('active');
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// ============================================================================
// POST LOADING & RENDERING
// ============================================================================

async function loadPosts() {
  try {
    let url = `/api/posts?sort=${currentSort}&timeRange=${currentTimeRange}`;
    if (currentCommunity) url += `&community=${currentCommunity}`;
    const response = await fetch(url);
    const data = await response.json();
    renderPosts(data.posts);
  } catch (error) {
    console.error('Failed to load posts:', error);
  }
}

function renderPosts(posts) {
  const container = document.getElementById('posts-container');
  if (posts.length === 0) {
    container.innerHTML = '<div class="loading">No posts found</div>';
    return;
  }
  
  container.innerHTML = posts.map(post => {
    const nsfwTag = post.nsfw ? '<span class="tag" style="background: #ff6b00; color: #fff;"><i class="fas fa-exclamation-triangle"></i> NSFW</span>' : '';
    const pinTag = post.pinned ? '<span class="tag" style="background: #fbbf24; color: #000;"><i class="fas fa-thumbtack"></i> PINNED</span>' : '';
    const imageBlur = post.nsfw ? 'nsfw-blur' : '';
    const communityTag = post.community ? `<span>•</span><a href="/o/${post.community}" class="post-community-link" onclick="event.stopPropagation(); navigateToCommunity('${post.community}')">o/${post.community}</a>` : '';
    
    return `
    <div class="post-card" onclick="viewPost('${post.id}')">
      <div class="post-header">
        <img src="${post.authorPfp}" alt="${post.author}" class="post-pfp" onclick="event.stopPropagation(); window.location.href='/profile/${post.author}'">
        <div style="flex: 1;">
          <div class="post-title">${escapeHtml(post.title)} ${pinTag} ${nsfwTag}</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 0.25rem;">
            by <a href="/profile/${post.author}" onclick="event.stopPropagation()">${post.author}</a> • ${formatDate(post.timestamp)} • ${post.category}
            ${post.views ? ` • <i class="fas fa-eye"></i> ${post.views} views` : ''}
            ${communityTag}
          </div>
        </div>
      </div>
      <div style="color: rgba(255,255,255,0.85); margin: 1rem 0;">${escapeHtml(post.content.substring(0, 200))}${post.content.length > 200 ? '...' : ''}</div>
      ${post.tags && post.tags.length > 0 ? `<div style="margin-bottom: 1rem;">${post.tags.map(tag => `<span class="tag"><i class="fas fa-hashtag"></i>${tag}</span>`).join('')}</div>` : ''}
      ${post.awards && post.awards.length > 0 ? `<div style="margin-bottom: 1rem;">${post.awards.map(award => `<span class="award" title="${award.type}"><i class="fas fa-trophy"></i></span>`).join('')}</div>` : ''}
      ${post.image ? `<img src="${post.image}" class="post-image ${imageBlur}" data-nsfw="${post.nsfw}" alt="Post image" onclick="handleImageClick(event, this)">` : ''}
      <div class="post-actions">
        <button class="action-btn" onclick="event.stopPropagation(); votePost('${post.id}', 'upvote')"><i class="fas fa-arrow-up"></i> ${post.upvotes || 0}</button>
        <button class="action-btn" onclick="event.stopPropagation(); votePost('${post.id}', 'downvote')"><i class="fas fa-arrow-down"></i> ${post.downvotes || 0}</button>
        <span class="action-btn"><i class="fas fa-comment"></i> ${post.replies ? post.replies.length : 0}</span>
        <button class="action-btn" onclick="event.stopPropagation(); bookmarkPost('${post.id}')"><i class="fas fa-bookmark"></i> Save</button>
        <button class="action-btn" onclick="event.stopPropagation(); reportPost('${post.id}')"><i class="fas fa-flag"></i> Report</button>
        ${(post.author === currentUser.username || currentUser.role === 'admin' || currentUser.role === 'owner') ? 
          `<button class="action-btn" onclick="event.stopPropagation(); handleDeletePost(event, '${post.id}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
        ${(currentUser.role === 'admin' || currentUser.role === 'owner') ? 
          `<button class="action-btn ${post.pinned ? 'active' : ''}" onclick="event.stopPropagation(); handlePinPost(event, '${post.id}')"><i class="fas fa-thumbtack"></i> ${post.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
      </div>
    </div>
  `}).join('');
}

// ============================================================================
// COMMUNITY LOADING
// ============================================================================

async function loadCommunities() {
  try {
    const response = await fetch('/api/communities');
    const data = await response.json();
    const container = document.getElementById('community-list');
    container.innerHTML = `
      <div class="community-item ${!currentCommunity ? 'active' : ''}" onclick="selectCommunity(null)">
        <div style="font-weight: 600;">o/main</div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">Main forum</div>
      </div>
      ${data.communities.map(c => {
        const memberCount = Array.isArray(c.members) ? c.members.length : 1;
        const postCount = c.posts || 0;
        return `
        <div class="community-item ${currentCommunity === c.id ? 'active' : ''}" onclick="selectCommunity('${c.id}')">
          <div style="font-weight: 600;">o/${c.id}</div>
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">${postCount} posts • ${memberCount} ${memberCount === 1 ? 'member' : 'members'}</div>
        </div>
        `;
      }).join('')}
    `;
  } catch (error) {
    console.error('Failed to load communities:', error);
  }
}

function selectCommunity(communityId) {
  currentCommunity = communityId;
  loadCommunities();
  loadPosts();
  if (!communityId) {
    document.getElementById('chat-container').classList.add('active');
    if (socketConnected) sendWebSocket('chat:join', 'main');
  } else {
    document.getElementById('chat-container').classList.remove('active');
  }
}

// ============================================================================
// CHAT FUNCTIONS
// ============================================================================

function sendChatMessage() {
  if (!socketConnected) {
    showAlert('Chat unavailable - No connection', 'ERROR', 'fa-exclamation-triangle');
    return;
  }
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (message && !currentCommunity) {
    sendWebSocket('chat:message', { communityId: 'main', message, username: currentUser.username, pfp: currentUser.pfp });
    input.value = '';
  }
}

function addChatMessage(msg) {
  const container = document.getElementById('chat-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `
    <img src="${msg.pfp}" alt="${msg.username}">
    <div class="chat-message-content">
      <div class="chat-message-author">${msg.username}</div>
      <div class="chat-message-text">${escapeHtml(msg.message)}</div>
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// ============================================================================
// CONTINUE IN NEXT PART (Post Details, DMs, Settings, etc.)
// ============================================================================

// ============================================================================
// MODAL FUNCTIONS
// ============================================================================

function openModal(modalId) {
  document.getElementById(modalId).classList.add('open');
  if (modalId === 'leaderboard-modal') loadLeaderboard();
  if (modalId === 'achievements-modal') loadAchievements();
  if (modalId === 'settings-modal') loadSettingsModal();
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

// ============================================================================
// LEADERBOARD
// ============================================================================

async function loadLeaderboard(type = 'xp') {
  try {
    const response = await fetch(`/api/leaderboard/${type}`);
    const data = await response.json();
    const container = document.getElementById('leaderboard-content');
    container.innerHTML = data.leaderboard.map((user, index) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank">#${index + 1}</div>
        <img src="${user.pfp || '/uploads/default-0.png'}" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid #e91f42;">
        <div class="leaderboard-user">
          <div style="font-weight: 600; color: #ff6b8a;">${user.username}</div>
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">Level ${user.level || 1}</div>
        </div>
        <div class="leaderboard-stat">${user[type] || 0}</div>
      </div>
    `).join('');
    document.querySelectorAll('[data-lb]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lb === type);
      btn.onclick = () => loadLeaderboard(btn.dataset.lb);
    });
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
  }
}

// ============================================================================
// ACHIEVEMENTS
// ============================================================================

async function loadAchievements() {
  try {
    const response = await fetch(`/api/achievements/${currentUser.username}`);
    const data = await response.json();
    const allAchievements = [
      { id: 'first_steps', name: 'First Steps', desc: 'Joined Odium', icon: 'fa-hand-peace' },
      { id: 'first_post', name: 'First Post', desc: 'Created your first post', icon: 'fa-pen' },
      { id: 'prolific', name: 'Prolific', desc: 'Created 10 posts', icon: 'fa-pencil-alt' },
      { id: 'veteran', name: 'Veteran', desc: 'Reached level 5', icon: 'fa-star' },
      { id: 'social', name: 'Social', desc: 'Made 50 replies', icon: 'fa-comments' },
      { id: 'popular', name: 'Popular', desc: 'Got 100 upvotes', icon: 'fa-crown' }
    ];
    const unlockedIds = data.achievements.map(a => a.id);
    document.getElementById('achievement-grid').innerHTML = allAchievements.map(ach => `
      <div class="achievement-card ${unlockedIds.includes(ach.id) ? 'unlocked' : ''}">
        <div class="achievement-icon"><i class="fas ${ach.icon}"></i></div>
        <div class="achievement-name">${ach.name}</div>
        <div class="achievement-desc">${ach.desc}</div>
        ${unlockedIds.includes(ach.id) ? '<div style="color: #4ade80; font-size: 0.8rem; margin-top: 0.5rem;"><i class="fas fa-check"></i> UNLOCKED</div>' : '<div style="color: rgba(255,255,255,0.3); font-size: 0.8rem; margin-top: 0.5rem;"><i class="fas fa-lock"></i> LOCKED</div>'}
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load achievements:', error);
  }
}

// ============================================================================
// DRAFTS
// ============================================================================

async function loadDrafts() {
  try {
    const response = await fetch('/api/drafts');
    const data = await response.json();
    document.getElementById('draft-count').textContent = data.drafts.length;
  } catch (error) {
    console.error('Failed to load drafts:', error);
  }
}

async function saveDraft() {
  const draft = {
    title: document.getElementById('post-title').value,
    content: document.getElementById('post-content').value,
    category: document.getElementById('post-category').value,
    tags: document.getElementById('post-tags').value
  };
  try {
    await fetch('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft)
    });
    showAlert('Draft saved successfully!', 'SUCCESS', 'fa-check-circle');
    loadDrafts();
  } catch (error) {
    showAlert('Failed to save draft', 'ERROR', 'fa-exclamation-circle');
  }
}

// ============================================================================
// POST SUBMISSION
// ============================================================================

async function submitPost() {
  const formData = new FormData();
  formData.append('title', document.getElementById('post-title').value);
  formData.append('content', document.getElementById('post-content').value);
  formData.append('category', document.getElementById('post-category').value);
  formData.append('nsfw', document.getElementById('post-nsfw').checked);
  formData.append('tags', JSON.stringify(document.getElementById('post-tags').value.split(',').map(t => t.trim()).filter(t => t)));
  if (currentCommunity) formData.append('community', currentCommunity);
  const imageFile = document.getElementById('post-image').files[0];
  if (imageFile) formData.append('postImage', imageFile);
  
  try {
    const response = await fetch('/api/posts', { method: 'POST', body: formData });
    if (response.ok) {
      closeModal('create-post-modal');
      loadPosts();
      document.getElementById('post-title').value = '';
      document.getElementById('post-content').value = '';
      document.getElementById('post-tags').value = '';
      document.getElementById('post-image').value = '';
      document.getElementById('post-nsfw').checked = false;
      showAlert('Post created successfully!', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to create post', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

// ============================================================================
// COMMUNITY CREATION
// ============================================================================

async function submitCommunity() {
  const name = document.getElementById('community-name').value.trim();
  const description = document.getElementById('community-description').value.trim();
  const categoriesInput = document.getElementById('community-categories').value.trim();
  const isPrivate = document.getElementById('community-private').checked;
  
  if (!name || !description) {
    showAlert('Community name and description are required', 'VALIDATION ERROR', 'fa-exclamation-triangle');
    return;
  }
  if (name.length < 3 || name.length > 21) {
    showAlert('Community name must be 3-21 characters', 'VALIDATION ERROR', 'fa-exclamation-triangle');
    return;
  }
  const categories = categoriesInput ? categoriesInput.split(',').map(c => c.trim()).filter(c => c) : ['general'];
  
  try {
    const response = await fetch('/api/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, categories, isPrivate })
    });
    if (response.ok) {
      closeModal('create-community-modal');
      loadCommunities();
      document.getElementById('community-name').value = '';
      document.getElementById('community-description').value = '';
      document.getElementById('community-categories').value = '';
      document.getElementById('community-private').checked = false;
      showAlert('Community created successfully!', 'SUCCESS', 'fa-check-circle');
    } else {
      const error = await response.json();
      showAlert(error.error || 'Failed to create community', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

// ============================================================================
// SETTINGS
// ============================================================================

function loadSettingsModal() {
  fetch('/api/preferences')
    .then(r => r.json())
    .then(data => {
      const prefs = data.preferences;
      document.getElementById('theme-select').value = prefs.theme;
      document.getElementById('font-size-select').value = prefs.fontSize;
      document.getElementById('view-mode-select').value = prefs.viewMode;
      document.getElementById('notifications-toggle').classList.toggle('active', prefs.notifications);
    });
}

async function saveSettings() {
  const toggle = document.getElementById('notifications-toggle');
  const prefs = {
    theme: document.getElementById('theme-select').value,
    fontSize: document.getElementById('font-size-select').value,
    viewMode: document.getElementById('view-mode-select').value,
    notifications: toggle.classList.contains('active')
  };
  try {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs)
    });
    location.reload();
  } catch (error) {
    showAlert('Failed to save settings', 'ERROR', 'fa-exclamation-circle');
  }
}

// ============================================================================
// POST ACTIONS
// ============================================================================

async function bookmarkPost(postId) {
  try {
    await fetch(`/api/bookmarks/${postId}`, { method: 'POST' });
    showAlert('Post bookmarked successfully!', 'SUCCESS', 'fa-bookmark');
  } catch (error) {
    showAlert('Failed to bookmark post', 'ERROR', 'fa-exclamation-circle');
  }
}

async function reportPost(postId) {
  const reason = await showPrompt('Why are you reporting this post?', 'REPORT POST', 'Enter your reason...');
  if (reason) {
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'post', targetId: postId, reason, category: 'other' })
      });
      if (response.ok) {
        showAlert('Report submitted successfully', 'SUCCESS', 'fa-flag');
      } else {
        showAlert('Failed to submit report', 'ERROR', 'fa-exclamation-circle');
      }
    } catch (error) {
      showAlert('Failed to submit report', 'ERROR', 'fa-exclamation-circle');
    }
  }
}

function navigateToCommunity(communityId) {
  window.location.href = `/o/${communityId}`;
}

async function votePost(postId, voteType) {
  try {
    await fetch(`/api/posts/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType })
    });
    loadPosts();
  } catch (error) {
    console.error('Vote failed:', error);
  }
}

async function handlePinPost(event, postId) {
  event.stopPropagation();
  try {
    const response = await fetch(`/api/admin/pin/${postId}`, { method: 'POST' });
    if (response.ok) await loadPosts();
    else showAlert('Failed to pin/unpin post', 'ERROR', 'fa-exclamation-circle');
  } catch (error) {
    console.error('Failed to pin post:', error);
  }
}

async function handleDeletePost(event, postId) {
  event.stopPropagation();
  const confirmed = await showConfirm('Are you sure you want to delete this post? This action cannot be undone.', 'DELETE POST');
  if (!confirmed) return;
  try {
    const response = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (response.ok) {
      await loadPosts();
      showAlert('Post deleted successfully', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to delete post', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

function handleImageClick(event, img) {
  event.stopPropagation();
  if (img.dataset.nsfw === 'true' && img.classList.contains('nsfw-blur')) {
    img.classList.remove('nsfw-blur');
  } else if (img.dataset.nsfw !== 'true') {
    window.open(img.src, '_blank');
  }
}

// ============================================================================
// POST DETAIL VIEW
// ============================================================================

async function viewPost(postId) {
  try {
    const response = await fetch(`/api/posts/${postId}`);
    const data = await response.json();
    const post = data.post;
    const nsfwTag = post.nsfw ? '<span class="tag" style="background: #ff6b00; color: #fff;"><i class="fas fa-exclamation-triangle"></i> NSFW</span>' : '';
    const pinTag = post.pinned ? '<span class="tag" style="background: #fbbf24; color: #000;"><i class="fas fa-thumbtack"></i> PINNED</span>' : '';
    const communityTag = post.community ? `<span>•</span><a href="/o/${post.community}" class="post-community-link">o/${post.community}</a>` : '';
    
    document.getElementById('detail-title').innerHTML = `${escapeHtml(post.title)} ${pinTag} ${nsfwTag}`;
    document.getElementById('detail-author').innerHTML = `<a href="/profile/${post.author}" style="color: inherit; text-decoration: none;">${post.author}</a>`;
    document.getElementById('detail-time').textContent = formatDate(post.timestamp);
    document.getElementById('detail-category').textContent = post.category;
    document.getElementById('detail-community-tag').innerHTML = communityTag;
    document.getElementById('detail-content').textContent = post.content;
    
    const detailPfp = document.getElementById('detail-pfp');
    detailPfp.src = post.authorPfp;
    detailPfp.onclick = () => window.location.href = `/profile/${post.author}`;
    
    document.getElementById('detail-upvotes').textContent = post.upvotes || 0;
    document.getElementById('detail-downvotes').textContent = post.downvotes || 0;

    const imageContainer = document.getElementById('detail-image-container');
    if (post.image) {
      const imageBlur = post.nsfw ? 'nsfw-blur' : '';
      const warningHtml = post.nsfw ? '<div style="background: rgba(255, 107, 0, 0.2); border: 1px solid rgba(255, 107, 0, 0.4); border-radius: 8px; padding: 0.75rem; margin-top: 1rem; color: #ff9d6b; font-size: 0.9rem; text-align: center;"><i class="fas fa-exclamation-triangle"></i> This post contains NSFW content. Click image to reveal.</div>' : '';
      imageContainer.innerHTML = `${warningHtml}<img src="${post.image}" class="post-image ${imageBlur}" data-nsfw="${post.nsfw}" alt="Post image" onclick="handleImageClick(event, this)" style="margin-top: 1rem;">`;
    } else {
      imageContainer.innerHTML = '';
    }

    const deleteBtn = document.getElementById('detail-delete-btn');
    if (post.author === currentUser.username || currentUser.role === 'admin' || currentUser.role === 'owner') {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = () => handleDeletePostDetail(post.id);
    } else {
      deleteBtn.style.display = 'none';
    }

    const pinBtn = document.getElementById('detail-pin-btn');
    if (currentUser.role === 'admin' || currentUser.role === 'owner') {
      pinBtn.style.display = 'inline-flex';
      pinBtn.innerHTML = `<i class="fas fa-thumbtack"></i> ${post.pinned ? 'Unpin' : 'Pin'}`;
      pinBtn.onclick = () => handlePinPostDetail(post.id);
    } else {
      pinBtn.style.display = 'none';
    }

    document.getElementById('detail-upvote-btn').onclick = () => votePostDetail(post.id, 'upvote');
    document.getElementById('detail-downvote-btn').onclick = () => votePostDetail(post.id, 'downvote');
    renderReplies(post.replies || []);
    
    document.getElementById('posts-list-view').classList.add('hidden');
    document.getElementById('post-detail-view').classList.add('active');
    window.currentPostId = postId;
    window.scrollTo(0, 0);
  } catch (error) {
    console.error('Failed to load post:', error);
    showAlert('Failed to load post. Please try again.', 'ERROR', 'fa-exclamation-circle');
  }
}

function renderReplies(replies) {
  const container = document.getElementById('replies-container');
  document.getElementById('replies-count').textContent = replies.length;
  if (replies.length === 0) {
    container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center;">No replies yet. Be the first!</p>';
    return;
  }
  container.innerHTML = replies.map(reply => `
    <div class="reply-card">
      <div class="reply-header">
        <div class="reply-author-info">
          <img src="${reply.authorPfp}" alt="${reply.author}" class="reply-pfp">
          <span class="reply-author"><a href="/profile/${reply.author}" style="color: inherit; text-decoration: none;">${reply.author}</a></span>
          <span class="reply-time">${formatDate(reply.timestamp)}</span>
        </div>
        ${(reply.author === currentUser.username || currentUser.role === 'admin' || currentUser.role === 'owner') ? 
          `<button class="action-btn" onclick="handleDeleteReply('${reply.id}')"><i class="fas fa-trash"></i></button>` : ''}
      </div>
      <p class="reply-content">${escapeHtml(reply.content)}</p>
    </div>
  `).join('');
}

async function votePostDetail(postId, voteType) {
  try {
    await fetch(`/api/posts/${postId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteType })
    });
    viewPost(postId);
  } catch (error) {
    console.error('Vote failed:', error);
  }
}

async function handlePinPostDetail(postId) {
  try {
    const response = await fetch(`/api/admin/pin/${postId}`, { method: 'POST' });
    if (response.ok) viewPost(postId);
  } catch (error) {
    console.error('Failed to pin post:', error);
  }
}

async function handleDeletePostDetail(postId) {
  const confirmed = await showConfirm('Are you sure you want to delete this post? This action cannot be undone.', 'DELETE POST');
  if (!confirmed) return;
  try {
    const response = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (response.ok) {
      document.getElementById('back-btn').click();
      await loadPosts();
      showAlert('Post deleted successfully', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to delete post', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

async function handleDeleteReply(replyId) {
  const confirmed = await showConfirm('Are you sure you want to delete this reply? This action cannot be undone.', 'DELETE REPLY');
  if (!confirmed) return;
  try {
    const response = await fetch(`/api/posts/${window.currentPostId}/replies/${replyId}`, { method: 'DELETE' });
    if (response.ok) {
      await viewPost(window.currentPostId);
      showAlert('Reply deleted successfully', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to delete reply', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

async function submitReply() {
  const content = document.getElementById('reply-input').value.trim();
  if (!content || !window.currentPostId) return;
  try {
    const response = await fetch(`/api/posts/${window.currentPostId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (response.ok) {
      document.getElementById('reply-input').value = '';
      await viewPost(window.currentPostId);
    }
  } catch (error) {
    console.error('Failed to submit reply:', error);
  }
}

// ============================================================================
// NOTIFICATIONS & MESSAGES
// ============================================================================

function toggleNotifications() {
  document.getElementById('notification-panel').classList.toggle('active');
}

function toggleMessages() {
  const sidebar = document.getElementById('dm-sidebar');
  sidebar.classList.toggle('active');
  if (sidebar.classList.contains('active')) loadDMConversations();
}

async function loadNotifications() {
  console.log('Loading notifications...');
}

// ============================================================================
// DIRECT MESSAGES
// ============================================================================

async function loadAllDMConversations() {
  try {
    const response = await fetch('/api/messages/conversations');
    if (response.ok) {
      const data = await response.json();
      if (data.conversations && Array.isArray(data.conversations)) {
        data.conversations.forEach(conv => {
          dmConversations.set(conv.username, {
            pfp: conv.pfp,
            lastMessage: conv.lastMessage,
            messages: []
          });
        });
      }
      updateMessageCount();
    }
  } catch (error) {
    console.error('[DM] Failed to load conversations:', error);
  }
}

function loadDMConversations() {
  const listContainer = document.getElementById('dm-list');
  if (dmConversations.size === 0) {
    listContainer.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.5); padding: 1rem;">No conversations yet</div>';
    return;
  }
  listContainer.innerHTML = Array.from(dmConversations.entries()).map(([username, data]) => `
    <div class="dm-item ${currentDMUser === username ? 'active' : ''}" onclick="openDMChat('${username}')">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <img src="${data.pfp}" style="width: 35px; height: 35px; border-radius: 50%; border: 2px solid #e91f42;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #ff6b8a;">${username}</div>
          <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">${data.lastMessage}</div>
        </div>
      </div>
    </div>
  `).join('');
}

async function addDMConversation(username) {
  if (!dmConversations.has(username)) {
    try {
      const response = await fetch(`/api/users/${username}`);
      if (response.ok) {
        const data = await response.json();
        dmConversations.set(username, { pfp: data.user.pfp, lastMessage: 'New message', messages: [] });
      } else {
        dmConversations.set(username, { pfp: '/uploads/default-0.png', lastMessage: 'New message', messages: [] });
      }
    } catch (error) {
      dmConversations.set(username, { pfp: '/uploads/default-0.png', lastMessage: 'New message', messages: [] });
    }
    loadDMConversations();
    updateMessageCount();
  }
}

async function openDMChat(username) {
  currentDMUser = username;
  document.getElementById('dm-list').style.display = 'none';
  document.getElementById('dm-chat-area').style.display = 'block';
  document.getElementById('dm-chat-user-name').textContent = username;
  document.getElementById('dm-messages').innerHTML = '';
  
  try {
    const response = await fetch(`/api/messages/${username}`);
    if (response.ok) {
      const data = await response.json();
      if (!dmConversations.has(username)) await addDMConversation(username);
      const conversation = dmConversations.get(username);
      conversation.messages = data.messages;
      const otherUserPfp = conversation.pfp;
      const myPfp = currentUser.pfp;
      data.messages.forEach(msg => {
        msg.pfp = msg.from === currentUser.username ? myPfp : otherUserPfp;
        addDMMessageToUI(msg);
      });
    }
  } catch (error) {
    console.error('Failed to load messages:', error);
  }
  loadDMConversations();
}

function closeDMChat() {
  currentDMUser = null;
  document.getElementById('dm-list').style.display = 'block';
  document.getElementById('dm-chat-area').style.display = 'none';
}

function closeDMSidebar() {
  document.getElementById('dm-sidebar').classList.remove('active');
  closeDMChat();
}

function updateMessageCount() {
  const count = dmConversations.size;
  const badge = document.getElementById('message-count');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function sendDM() {
  const input = document.getElementById('dm-input');
  const message = input.value.trim();
  if (!message || !currentDMUser) return;
  
  fetch(`/api/messages/${currentDMUser}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      input.value = '';
      const msg = {
        id: data.message.id,
        from: currentUser.username,
        to: currentDMUser,
        message: data.message.message,
        pfp: currentUser.pfp,
        timestamp: data.message.timestamp
      };
      addDMMessage(msg);
    }
  })
  .catch(error => {
    console.error('[DM] Failed to send:', error);
    showAlert('Failed to send message', 'ERROR', 'fa-exclamation-circle');
  });
}

function addDMMessage(msg) {
  const otherUser = msg.from === currentUser.username ? msg.to : msg.from;
  if (!dmConversations.has(otherUser)) {
    dmConversations.set(otherUser, {
      pfp: msg.pfp || '/uploads/default-0.png',
      lastMessage: msg.message.substring(0, 30) + (msg.message.length > 30 ? '...' : ''),
      messages: []
    });
  }
  const conversation = dmConversations.get(otherUser);
  conversation.messages.push(msg);
  conversation.lastMessage = msg.message.substring(0, 30) + (msg.message.length > 30 ? '...' : '');
  if (currentDMUser === otherUser) addDMMessageToUI(msg);
  loadDMConversations();
}

function addDMMessageToUI(msg) {
  const container = document.getElementById('dm-messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  const isMe = msg.from === currentUser.username;
  const displayPfp = msg.pfp || (isMe ? currentUser.pfp : (dmConversations.get(currentDMUser)?.pfp || '/uploads/default-0.png'));
  msgDiv.innerHTML = `
    <img src="${displayPfp}" alt="${msg.from}">
    <div class="chat-message-content">
      <div class="chat-message-author">${isMe ? 'You' : msg.from}</div>
      <div class="chat-message-text">${escapeHtml(msg.message)}</div>
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// ============================================================================
// TYPING INDICATORS
// ============================================================================

function showTypingIndicator(username) {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.textContent = `${username} is typing...`;
    indicator.style.display = 'block';
  }
}

function hideTypingIndicator(username) {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.style.display = 'none';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  } catch (error) {
    window.location.href = '/';
  }
}

function goHome() {
  window.location.href = '/forum';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

init();