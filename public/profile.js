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

  buildWebRTC(to, from, data) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return this.concatArrays(
      this.concatArrays(this.buildString(to), this.buildString(from)), 
      this.buildString(dataStr)
    );
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
    return { 
      version, 
      opcode, 
      payload: buffer.slice(8, 8 + length), 
      remaining: buffer.slice(8 + length) 
    };
  }

  buildUserJoin(username, pfp) {
    return this.concatArrays(this.buildString(username), this.buildString(pfp));
  }

  userJoin(username, pfp) { 
    this.sendFrame(this.OpCode.USER_JOIN, this.buildUserJoin(username, pfp)); 
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

    this.socket.onerror = () => {
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
      case this.OpCode.CALL_OFFER:
        const offer = this.parseWebRTC(payload);
        const offerData = JSON.parse(offer.data);
        this.emit('call:offer', { 
          to: offer.to, 
          from: offer.from, 
          offer: offerData.offer, 
          callType: offerData.callType 
        });
        break;
      case this.OpCode.CALL_ANSWER:
        const answer = this.parseWebRTC(payload);
        const answerData = JSON.parse(answer.data);
        this.emit('call:answer', { 
          to: answer.to, 
          from: answer.from, 
          answer: answerData.answer 
        });
        break;
      case this.OpCode.ICE_CANDIDATE:
        const ice = this.parseWebRTC(payload);
        const iceData = JSON.parse(ice.data);
        this.emit('call:ice-candidate', { 
          to: ice.to, 
          candidate: iceData.candidate 
        });
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

  callOffer(to, from, offer, callType) { 
    this.sendFrame(
      this.OpCode.CALL_OFFER, 
      this.buildWebRTC(to, from, JSON.stringify({ offer, callType }))
    ); 
  }
  
  callAnswer(to, from, answer) { 
    this.sendFrame(
      this.OpCode.CALL_ANSWER, 
      this.buildWebRTC(to, from, JSON.stringify({ answer }))
    ); 
  }
  
  sendIceCandidate(to, from, candidate) { 
    this.sendFrame(
      this.OpCode.ICE_CANDIDATE, 
      this.buildWebRTC(to, from, JSON.stringify({ candidate }))
    ); 
  }
  
  callEnded(to, from) { 
    this.sendFrame(this.OpCode.CALL_ENDED, this.buildWebRTC(to, from, '')); 
  }
  
  callReject(to, from) { 
    this.sendFrame(this.OpCode.CALL_REJECTED, this.buildWebRTC(to, from, '')); 
  }
  
  disconnect() { 
    if (this.socket) { 
      this.sendFrame(this.OpCode.CLOSE); 
      this.socket.close(); 
      this.socket = null; 
    } 
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
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

  isConnected() { 
    return this.connected && this.socket?.readyState === WebSocket.OPEN; 
  }
}

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
    
    const handleSubmit = () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || null);
    };
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
// CURSOR ANIMATION
// ============================================================================

const cursorDot = document.querySelector('.cursor-dot');
let mouseX = 0, mouseY = 0, cursorX = 0, cursorY = 0;
let lastTrailTime = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  
  const now = Date.now();
  if (now - lastTrailTime > 30) {
    const trail = document.createElement('div');
    trail.className = 'trail-particle';
    trail.style.left = mouseX + 'px';
    trail.style.top = mouseY + 'px';
    document.body.appendChild(trail);
    setTimeout(() => trail.remove(), 1200);
    lastTrailTime = now;
  }
});

document.addEventListener('mousedown', () => cursorDot.classList.add('beat'));
document.addEventListener('mouseup', () => cursorDot.classList.remove('beat'));

function animateCursor() {
  cursorX += (mouseX - cursorX) * 0.2;
  cursorY += (mouseY - cursorY) * 0.2;
  cursorDot.style.left = cursorX + 'px';
  cursorDot.style.top = cursorY + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

// ============================================================================
// PARTICLES BACKGROUND
// ============================================================================

if (typeof tsParticles !== 'undefined') {
  tsParticles.load('tsparticles', {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: ['#e91f42', '#ff6b8a', '#ff8fa3'] },
      shape: { type: 'circle' },
      opacity: { value: 0.5, random: true, anim: { enable: true, speed: 1, opacity_min: 0.1, sync: false } },
      size: { value: 3, random: true, anim: { enable: true, speed: 2, size_min: 0.1, sync: false } },
      line_linked: { enable: true, distance: 150, color: '#e91f42', opacity: 0.2, width: 1 },
      move: { enable: true, speed: 1, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false }
    },
    interactivity: {
      detect_on: 'canvas',
      events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' }, resize: true },
      modes: { grab: { distance: 140, line_linked: { opacity: 0.5 } }, push: { particles_nb: 4 } }
    },
    retina_detect: true
  });
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

let binaryClient = null;
let socketConnected = false;
let reconnectInterval = null;

function connectWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('[BINARY] Connecting to:', wsUrl);
    binaryClient = new BinaryProtocolClient(wsUrl);
    
    binaryClient.on('ready', (clientId) => {
      console.log('[BINARY] Ready, ID:', clientId);
      socketConnected = true;
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
        reconnectInterval = null;
      }
      
      // ← ADD THIS: Join the WebSocket network so server knows about this client
      if (currentUser) {
        binaryClient.userJoin(currentUser.username, currentUser.pfp);
        console.log('[BINARY] User joined:', currentUser.username);
      }
    });
    
    binaryClient.on('call:offer', (data) => showIncomingCall(data));
    binaryClient.on('call:answer', (data) => handleCallAnswer(data));
    binaryClient.on('call:ice-candidate', (data) => handleIceCandidate(data));
    binaryClient.on('call:ended', () => {
      stopRingtone();
      endCall();
      showAlert('Call ended', 'CALL', 'fa-phone');
    });
    binaryClient.on('call:rejected', () => {
      stopRingtone();
      endCall();
      showAlert('Call rejected', 'CALL', 'fa-phone-slash');
    });
    binaryClient.on('call:error', (data) => {
      stopRingtone();
      endCall();
      showAlert(data.message || 'Call failed', 'ERROR', 'fa-exclamation-triangle');
    });
    
    binaryClient.on('disconnect', () => {
      socketConnected = false;
      if (!reconnectInterval) {
        reconnectInterval = setInterval(() => {
          console.log('[BINARY] Reconnecting...');
          connectWebSocket();
        }, 5000);
      }
    });
    
    binaryClient.on('error', (err) => {
      console.error('[BINARY] Error:', err);
      socketConnected = false;
    });
    
    binaryClient.connect();
  } catch (error) {
    console.error('[BINARY] Connection failed:', error);
    socketConnected = false;
  }
}

function sendWebSocket(type, data) {
  if (!binaryClient || !socketConnected) return;
  switch (type) {
    case 'call:offer':
      binaryClient.callOffer(data.to, data.from, data.offer, data.callType);
      break;
    case 'call:answer':
      binaryClient.callAnswer(data.to, data.from, data.answer);
      break;
    case 'call:ice-candidate':
      binaryClient.sendIceCandidate(data.to, data.from, data.candidate);
      break;
    case 'call:ended':
      binaryClient.callEnded(data.to, data.from);
      break;
    case 'call:reject':
      binaryClient.callReject(data.to, data.from);
      break;
  }
}

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let currentUser = null;
let profileUser = null;
let isOwnProfile = false;
let isEditing = false;
let userPreferences = null;

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
let ringtoneAudio = null;

// Voice Activity Detection
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
// VOICE ACTIVITY DETECTION
// ============================================================================

function setupVoiceActivityDetection() {
  console.log('[VAD] Setting up voice activity detection');
  
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
        console.log('[VAD] Local VAD setup complete');
      } catch (error) {
        console.error('[VAD] Error setting up local audio analysis:', error);
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
          console.log('[VAD] Remote VAD setup complete');
        } catch (error) {
          console.error('[VAD] Error setting up remote audio analysis:', error);
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
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  return sum / bufferLength;
}

function startLocalVAD() {
  if (localVADInterval) clearInterval(localVADInterval);
  
  const localTile = document.getElementById('local-tile');
  let wasSpeaking = false;
  
  localVADInterval = setInterval(() => {
    if (!localAnalyser || !localStream || isMuted) {
      if (wasSpeaking) {
        localTile.classList.remove('speaking');
        wasSpeaking = false;
      }
      return;
    }
    
    const level = getAudioLevel(localAnalyser);
    const isSpeaking = level > SPEAKING_THRESHOLD;
    
    if (isSpeaking && !wasSpeaking) {
      localTile.classList.add('speaking');
      wasSpeaking = true;
      console.log('[VAD] Local user speaking - level:', level);
    } else if (!isSpeaking && wasSpeaking) {
      localTile.classList.remove('speaking');
      wasSpeaking = false;
    }
  }, 100);
}

function startRemoteVAD() {
  if (remoteVADInterval) clearInterval(remoteVADInterval);
  
  const remoteTile = document.getElementById('remote-tile');
  let wasSpeaking = false;
  
  remoteVADInterval = setInterval(() => {
    if (!remoteAnalyser || !remoteStream) {
      if (wasSpeaking) {
        remoteTile.classList.remove('speaking');
        wasSpeaking = false;
      }
      return;
    }
    
    const level = getAudioLevel(remoteAnalyser);
    const isSpeaking = level > SPEAKING_THRESHOLD;
    
    if (isSpeaking && !wasSpeaking) {
      remoteTile.classList.add('speaking');
      wasSpeaking = true;
      console.log('[VAD] Remote user speaking - level:', level);
    } else if (!isSpeaking && wasSpeaking) {
      remoteTile.classList.remove('speaking');
      wasSpeaking = false;
    }
  }, 100);
}

function stopVoiceActivityDetection() {
  console.log('[VAD] Stopping voice activity detection');
  
  if (localVADInterval) {
    clearInterval(localVADInterval);
    localVADInterval = null;
  }
  if (remoteVADInterval) {
    clearInterval(remoteVADInterval);
    remoteVADInterval = null;
  }
  if (localAudioContext) {
    localAudioContext.close();
    localAudioContext = null;
  }
  if (remoteAudioContext) {
    remoteAudioContext.close();
    remoteAudioContext = null;
  }
  
  localAnalyser = null;
  remoteAnalyser = null;
  
  document.getElementById('local-tile')?.classList.remove('speaking');
  document.getElementById('remote-tile')?.classList.remove('speaking');
}

// ============================================================================
// WEBRTC FUNCTIONS - INCOMING CALLS
// ============================================================================

async function showIncomingCall(data) {
  console.log('[WebRTC] Showing incoming call from:', data.from);
  incomingCallData = data;
  
  // Play ringtone
  ringtoneAudio = new Audio('https://www.myinstants.com/media/sounds/deltarune-ringtone_SnkHGfF.mp3');
  ringtoneAudio.loop = true;
  ringtoneAudio.volume = 0.2;
  ringtoneAudio.play().catch(err => console.error('Ringtone failed:', err));
  
  try {
    const response = await fetch(`/api/users/${data.from}`);
    if (response.ok) {
      const userData = await response.json();
      document.getElementById('incoming-caller-avatar').src = userData.user.pfp;
    } else {
      document.getElementById('incoming-caller-avatar').src = '/uploads/default-0.png';
    }
  } catch (error) {
    console.error('Failed to fetch caller info:', error);
    document.getElementById('incoming-caller-avatar').src = '/uploads/default-0.png';
  }
  
  document.getElementById('incoming-caller-username').textContent = data.from;
  
  const callTypeText = data.callType === 'video' ? 'Video Call' : 'Voice Call';
  const callTypeIcon = data.callType === 'video' ? 'fa-video' : 'fa-phone-volume';
  document.getElementById('incoming-call-type').innerHTML = `
    <i class="fas ${callTypeIcon}"></i>
    <span>Incoming ${callTypeText}</span>
  `;
  
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
  sendWebSocket('call:reject', { 
    to: incomingCallData.from, 
    from: currentUser.username 
  });
  incomingCallData = null;
});

async function handleCallOffer(data) {
  console.log('[WebRTC] Handling offer from:', data.from);
  
  try {
    callType = data.callType;
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
    });
    
    console.log('[WebRTC] Got local stream');
    
    try {
      const response = await fetch(`/api/users/${data.from}`);
      if (response.ok) {
        const userData = await response.json();
        createCallUI(
          callType === 'video',
          data.from,
          userData.user.pfp,
          currentUser.pfp
        );
      } else {
        createCallUI(
          callType === 'video',
          data.from,
          '/uploads/default-0.png',
          currentUser.pfp
        );
      }
    } catch (error) {
      console.error('Failed to fetch caller info:', error);
      createCallUI(
        callType === 'video',
        data.from,
        '/uploads/default-0.png',
        currentUser.pfp
      );
    }
    
    setupPeerConnection(data.from);
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    console.log('[WebRTC] Remote description set');
    
    // Process any queued ICE candidates
    while (pendingIceCandidates.length > 0) {
      const candidate = pendingIceCandidates.shift();
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added queued ICE candidate');
    }
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    sendWebSocket('call:answer', {
      to: data.from,
      from: currentUser.username,
      answer: answer
    });
    
    console.log('[WebRTC] Answer sent');
  } catch (error) {
    console.error('[WebRTC] Error handling offer:', error);
    showAlert(
      'Failed to accept call: ' + error.message,
      'ERROR',
      'fa-exclamation-triangle'
    );
    endCall();
  }
}

async function handleCallAnswer(data) {
  console.log('[WebRTC] Handling answer from:', data.from);
  
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    console.log('[WebRTC] Remote description set');
    
    // Process any queued ICE candidates
    while (pendingIceCandidates.length > 0) {
      const candidate = pendingIceCandidates.shift();
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added queued ICE candidate');
    }
    
    document.getElementById('call-status').textContent = 'Connected';
    console.log('[WebRTC] Answer processed successfully');
  } catch (error) {
    console.error('[WebRTC] Error handling answer:', error);
    showAlert('Call connection failed', 'ERROR', 'fa-exclamation-triangle');
    endCall();
  }
}

async function handleIceCandidate(data) {
  console.log('[WebRTC] Received ICE candidate');
  
  try {
    if (peerConnection && peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      console.log('[WebRTC] ICE candidate added');
    } else {
      pendingIceCandidates.push(data.candidate);
      console.log('[WebRTC] ICE candidate queued (no remote description yet)');
    }
  } catch (error) {
    console.error('[WebRTC] Error adding ICE candidate:', error);
  }
}

// ============================================================================
// WEBRTC FUNCTIONS - OUTGOING CALLS
// ============================================================================

async function startVoiceCall() {
  console.log('[WebRTC] Starting voice call');
  callType = 'voice';
  await initiateCall(false);
}

async function startVideoCall() {
  console.log('[WebRTC] Starting video call');
  callType = 'video';
  await initiateCall(true);
}

async function initiateCall(isVideo) {
  try {
    pendingIceCandidates = [];
    
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });
    
    console.log('[WebRTC] Got local stream');
    
    createCallUI(isVideo, profileUser.username, profileUser.pfp, currentUser.pfp);
    setupPeerConnection(profileUser.username);
    
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: isVideo
    });
    
    await peerConnection.setLocalDescription(offer);
    
    console.log('[WebRTC] Sending offer to:', profileUser.username);
    
    sendWebSocket('call:offer', {
      to: profileUser.username,
      from: currentUser.username,
      offer: offer,
      callType: isVideo ? 'video' : 'voice'
    });
    
    document.getElementById('call-status').textContent = 'Calling...';
  } catch (error) {
    console.error('[WebRTC] Error starting call:', error);
    showAlert(
      'Failed to access camera/microphone: ' + error.message,
      'ERROR',
      'fa-exclamation-triangle'
    );
    endCall();
  }
}

function setupPeerConnection(remoteUsername) {
  console.log('[WebRTC] Setting up peer connection with:', remoteUsername);
  
  peerConnection = new RTCPeerConnection(rtcConfig);
  
  // Add local tracks to peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
    console.log('[WebRTC] Added local track:', track.kind);
  });
  
  // Handle incoming tracks
  peerConnection.ontrack = (event) => {
    console.log('[WebRTC] Received remote track:', event.track.kind);
    
    if (!remoteStream) {
      remoteStream = new MediaStream();
      document.getElementById('remote-video').srcObject = remoteStream;
      console.log('[WebRTC] Created new remote stream and attached to video');
    }
    
    remoteStream.addTrack(event.track);
    console.log('[WebRTC] Added track to remote stream');
    
    document.getElementById('call-status').textContent = 'Connected';
    
    if (event.track.kind === 'audio') {
      setTimeout(() => setupVoiceActivityDetection(), 500);
    }
  };
  
  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[WebRTC] Sending ICE candidate');
      sendWebSocket('call:ice-candidate', {
        to: remoteUsername,
        from: currentUser.username,
        candidate: event.candidate
      });
    } else {
      console.log('[WebRTC] All ICE candidates sent');
    }
  };
  
  // Handle ICE connection state changes
  peerConnection.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE connection state:', peerConnection.iceConnectionState);
    
    if (peerConnection.iceConnectionState === 'connected') {
      document.getElementById('call-status').textContent = 'Connected';
    } else if (peerConnection.iceConnectionState === 'disconnected') {
      document.getElementById('call-status').textContent = 'Reconnecting...';
    } else if (peerConnection.iceConnectionState === 'failed') {
      showAlert(
        'Connection failed. Please try again.',
        'ERROR',
        'fa-exclamation-triangle'
      );
      endCall();
    }
  };
  
  // Log connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', peerConnection.connectionState);
  };
  
  peerConnection.onsignalingstatechange = () => {
    console.log('[WebRTC] Signaling state:', peerConnection.signalingState);
  };
  
  peerConnection.onicegatheringstatechange = () => {
    console.log('[WebRTC] ICE gathering state:', peerConnection.iceGatheringState);
  };
}

function createCallUI(isVideo, remoteUsername, remotePfp, localPfp) {
  callActive = true;
  
  const callContainer = document.getElementById('call-container');
  const callGrid = document.getElementById('call-grid');
  const headerTitle = document.getElementById('call-header-title');
  const localVideo = document.getElementById('local-video');
  const localAvatar = document.getElementById('local-avatar');
  const localAvatarContainer = document.getElementById('local-avatar-container');
  const localUsername = document.getElementById('local-username');
  const localVideoIcon = document.getElementById('local-video-icon');
  const remoteVideo = document.getElementById('remote-video');
  const remoteAvatar = document.getElementById('remote-avatar');
  const remoteAvatarContainer = document.getElementById('remote-avatar-container');
  const remoteUsername_el = document.getElementById('remote-username');
  const remoteVideoIcon = document.getElementById('remote-video-icon');
  const videoBtn = document.getElementById('video-btn');
  
  remoteUsername_el.textContent = remoteUsername;
  localUsername.textContent = 'You';
  remoteAvatar.src = remotePfp;
  localAvatar.src = localPfp;
  
  if (isVideo) {
    headerTitle.innerHTML = '<i class="fas fa-video"></i> Video Call';
    callGrid.classList.remove('voice-call');
    videoBtn.classList.remove('hidden');
    localVideoIcon.classList.remove('hidden');
    remoteVideoIcon.classList.remove('hidden');
    
    localVideo.srcObject = localStream;
    localVideo.classList.remove('hidden');
    localAvatarContainer.classList.add('hidden');
  } else {
    headerTitle.innerHTML = '<i class="fas fa-phone-volume"></i> Voice Call';
    callGrid.classList.add('voice-call');
    videoBtn.classList.add('hidden');
    localVideoIcon.classList.add('hidden');
    remoteVideoIcon.classList.add('hidden');
    
    localVideo.classList.add('hidden');
    localAvatarContainer.classList.remove('hidden');
    remoteVideo.classList.add('hidden');
    remoteAvatarContainer.classList.remove('hidden');
  }
  
  callContainer.classList.add('active');
  setupVoiceActivityDetection();
}

// ============================================================================
// WEBRTC CONTROLS
// ============================================================================

function toggleMute() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMuted = !audioTrack.enabled;
    
    const muteBtn = document.getElementById('mute-btn');
    const localMuteIcon = document.getElementById('local-mute-icon');
    
    if (isMuted) {
      muteBtn.classList.add('active');
      muteBtn.querySelector('i').className = 'fas fa-microphone-slash';
      muteBtn.querySelector('.control-label').textContent = 'Unmute';
      localMuteIcon.classList.add('muted');
      localMuteIcon.querySelector('i').className = 'fas fa-microphone-slash';
    } else {
      muteBtn.classList.remove('active');
      muteBtn.querySelector('i').className = 'fas fa-microphone';
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
    const localVideo = document.getElementById('local-video');
    const localAvatarContainer = document.getElementById('local-avatar-container');
    const localVideoIcon = document.getElementById('local-video-icon');
    
    if (isVideoOff) {
      videoBtn.classList.add('active');
      videoBtn.querySelector('i').className = 'fas fa-video-slash';
      videoBtn.querySelector('.control-label').textContent = 'Turn On Camera';
      localVideo.classList.add('hidden');
      localAvatarContainer.classList.remove('hidden');
      localVideoIcon.classList.add('video-off');
      localVideoIcon.querySelector('i').className = 'fas fa-video-slash';
    } else {
      videoBtn.classList.remove('active');
      videoBtn.querySelector('i').className = 'fas fa-video';
      videoBtn.querySelector('.control-label').textContent = 'Turn Off Camera';
      localVideo.classList.remove('hidden');
      localAvatarContainer.classList.add('hidden');
      localVideoIcon.classList.remove('video-off');
      localVideoIcon.querySelector('i').className = 'fas fa-video';
    }
  }
}

function endCall() {
  console.log('[WebRTC] Ending call');
  
  stopRingtone();
  stopVoiceActivityDetection();
  
  if (localStream) {
    localStream.getTracks().forEach(track => {
      track.stop();
      console.log('[WebRTC] Stopped local track:', track.kind);
    });
    localStream = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  document.getElementById('call-container').classList.remove('active');
  document.getElementById('incoming-call-modal').classList.remove('active');
  document.getElementById('local-video').srcObject = null;
  document.getElementById('remote-video').srcObject = null;
  
  if (callActive && profileUser) {
    sendWebSocket('call:ended', {
      to: profileUser.username,
      from: currentUser.username
    });
  }
  
  callActive = false;
  callType = null;
  isMuted = false;
  isVideoOff = false;
  remoteStream = null;
  pendingIceCandidates = [];
  incomingCallData = null;
  
  const muteBtn = document.getElementById('mute-btn');
  muteBtn.classList.remove('active');
  muteBtn.querySelector('i').className = 'fas fa-microphone';
  
  const videoBtn = document.getElementById('video-btn');
  videoBtn.classList.remove('active');
  videoBtn.querySelector('i').className = 'fas fa-video';
  
  document.getElementById('call-grid').classList.remove('voice-call');
}

document.getElementById('mute-btn')?.addEventListener('click', toggleMute);
document.getElementById('video-btn')?.addEventListener('click', toggleVideo);
document.getElementById('hangup-btn')?.addEventListener('click', endCall);

// ============================================================================
// PROFILE FUNCTIONS
// ============================================================================

async function init() {
  const username = window.location.pathname.split('/').pop();
  
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/';
      return;
    }
    
    const data = await response.json();
    currentUser = data.user;
    
    connectWebSocket();
    
    const profileResponse = await fetch(`/api/users/${username}`);
    if (!profileResponse.ok) {
      showAlert('User not found', 'ERROR', 'fa-exclamation-circle');
      setTimeout(() => window.location.href = '/forum', 2000);
      return;
    }
    
    const profileData = await profileResponse.json();
    profileUser = profileData.user;
    isOwnProfile = currentUser.username === profileUser.username;
    
    renderProfile();
  } catch (error) {
    console.error('Failed to load profile:', error);
    showAlert('Failed to load profile', 'ERROR', 'fa-exclamation-triangle');
    setTimeout(() => window.location.href = '/forum', 2000);
  }
}

function renderProfile() {
  document.getElementById('profile-username').textContent = profileUser.username;
  document.getElementById('profile-role').textContent = profileUser.role;
  document.getElementById('profile-avatar').src = profileUser.pfp;
  document.getElementById('stat-posts').textContent = profileUser.posts || 0;
  document.getElementById('stat-reputation').textContent = profileUser.reputation || 0;
  document.getElementById('stat-level').textContent = profileUser.level || 1;
  document.getElementById('stat-joined').textContent = new Date(profileUser.joinDate)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  
  const bannerImg = document.getElementById('banner-img');
  if (profileUser.banner) {
    bannerImg.src = profileUser.banner;
    bannerImg.style.display = 'block';
  }
  
  const actionsContainer = document.getElementById('profile-actions');
  actionsContainer.innerHTML = '';
  
  if (isOwnProfile) {
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn primary';
    editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit Profile';
    editBtn.onclick = toggleEdit;
    actionsContainer.appendChild(editBtn);
    
    document.getElementById('avatar-upload-btn').style.display = 'flex';
    document.getElementById('banner-upload-btn').style.display = 'flex';
  } else {
    const messageBtn = document.createElement('button');
    messageBtn.className = 'action-btn primary';
    messageBtn.innerHTML = '<i class="fas fa-envelope"></i> Message';
    messageBtn.onclick = openDMModal;
    actionsContainer.appendChild(messageBtn);
    
    const voiceBtn = document.createElement('button');
    voiceBtn.className = 'action-btn';
    voiceBtn.innerHTML = '<i class="fas fa-phone"></i> Voice Call';
    voiceBtn.onclick = startVoiceCall;
    actionsContainer.appendChild(voiceBtn);
    
    const videoBtn = document.createElement('button');
    videoBtn.className = 'action-btn';
    videoBtn.innerHTML = '<i class="fas fa-video"></i> Video Call';
    videoBtn.onclick = startVideoCall;
    actionsContainer.appendChild(videoBtn);
    
    checkBlockStatus().then(isBlocked => {
      if (isBlocked) {
        const unblockBtn = document.createElement('button');
        unblockBtn.className = 'action-btn';
        unblockBtn.innerHTML = '<i class="fas fa-user-check"></i> Unblock';
        unblockBtn.onclick = unblockUser;
        actionsContainer.appendChild(unblockBtn);
      } else {
        const blockBtn = document.createElement('button');
        blockBtn.className = 'action-btn danger';
        blockBtn.innerHTML = '<i class="fas fa-ban"></i> Block';
        blockBtn.onclick = blockUser;
        actionsContainer.appendChild(blockBtn);
      }
    });
  }
  
  if ((currentUser.role === 'admin' || currentUser.role === 'owner') && !isOwnProfile) {
    const adminBtn = document.createElement('button');
    adminBtn.className = 'action-btn';
    adminBtn.innerHTML = '<i class="fas fa-shield-alt"></i> Admin';
    adminBtn.onclick = () => document.getElementById('admin-panel').classList.toggle('show');
    actionsContainer.appendChild(adminBtn);
    renderAdminPanel();
  }
  
  renderDetails();
}

function renderDetails() {
  const container = document.getElementById('profile-details');
  
  const fields = [
    { label: 'Bio', key: 'bio', type: 'textarea', public: true },
    { label: 'Email', key: 'email', type: 'email', public: false },
    { label: 'Location', key: 'location', type: 'text', public: true },
    { label: 'Website', key: 'website', type: 'url', public: true }
  ];
  
  let html = '';
  
  fields.forEach(field => {
    if (!field.public && !isOwnProfile) return;
    
    const value = profileUser[field.key] || '';
    
    if (isEditing && isOwnProfile) {
      if (field.type === 'textarea') {
        html += `
          <div class="detail-row">
            <div class="detail-label">${field.label}</div>
            <div class="detail-value">
              <textarea id="edit-${field.key}" placeholder="Enter ${field.label.toLowerCase()}...">${value}</textarea>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="detail-row">
            <div class="detail-label">${field.label}</div>
            <div class="detail-value">
              <input type="${field.type}" id="edit-${field.key}" value="${value}" placeholder="Enter ${field.label.toLowerCase()}...">
            </div>
          </div>
        `;
      }
    } else {
      html += `
        <div class="detail-row">
          <div class="detail-label">${field.label}</div>
          <div class="detail-value">${value || 'Not set'}</div>
        </div>
      `;
    }
  });
  
  if (isEditing && isOwnProfile) {
    html += '<button class="save-changes-btn" onclick="saveChanges()">SAVE CHANGES</button>';
  }
  
  container.innerHTML = html;
  
  if (isOwnProfile) {
    loadEmailPreferences();
  }
}

async function loadEmailPreferences() {
  try {
    const response = await fetch('/api/preferences');
    if (response.ok) {
      const data = await response.json();
      userPreferences = data.preferences;
      renderEmailPreferences();
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

function renderEmailPreferences() {
  if (!isOwnProfile || !userPreferences) return;
  
  const container = document.getElementById('profile-details');
  const existing = container.querySelector('#email-preferences-section');
  if (existing) existing.remove();
  
  const html = `
    <div id="email-preferences-section" style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid rgba(233, 31, 66, 0.2);">
      <div style="color: #ff6b8a; font-size: 1.2rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
        <i class="fas fa-envelope"></i>
        Email Notification Preferences
      </div>
      
      <div class="detail-row" style="border-bottom: 1px solid rgba(233, 31, 66, 0.1); padding: 1rem 0;">
        <div class="detail-label">Email Notifications</div>
        <div class="detail-value">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="pref-emailNotifications" ${userPreferences.emailNotifications ? 'checked' : ''} 
                   onchange="updatePreference('emailNotifications', this.checked)"
                   style="width: 20px; height: 20px; cursor: pointer;">
            <span style="color: rgba(255, 255, 255, 0.85);">Enable all email notifications</span>
          </label>
        </div>
      </div>

      <div class="detail-row" style="border-bottom: 1px solid rgba(233, 31, 66, 0.1); padding: 1rem 0;">
        <div class="detail-label">Reply Notifications</div>
        <div class="detail-value">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="pref-emailOnReply" ${userPreferences.emailOnReply ? 'checked' : ''} 
                   onchange="updatePreference('emailOnReply', this.checked)"
                   style="width: 20px; height: 20px; cursor: pointer;"
                   ${!userPreferences.emailNotifications ? 'disabled' : ''}>
            <span style="color: rgba(255, 255, 255, 0.85);">Notify me when someone replies to my posts</span>
          </label>
        </div>
      </div>

      <div class="detail-row" style="border-bottom: 1px solid rgba(233, 31, 66, 0.1); padding: 1rem 0;">
        <div class="detail-label">Daily Digest</div>
        <div class="detail-value">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="pref-emailTrendingDigest" ${userPreferences.emailTrendingDigest ? 'checked' : ''} 
                   onchange="updatePreference('emailTrendingDigest', this.checked)"
                   style="width: 20px; height: 20px; cursor: pointer;"
                   ${!userPreferences.emailNotifications ? 'disabled' : ''}>
            <span style="color: rgba(255, 255, 255, 0.85);">Send me daily trending posts (9 AM)</span>
          </label>
        </div>
      </div>

      <div class="detail-row" style="border-bottom: none; padding: 1rem 0;">
        <div class="detail-label">Weekly Summary</div>
        <div class="detail-value">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="pref-emailWeeklySummary" ${userPreferences.emailWeeklySummary ? 'checked' : ''} 
                   onchange="updatePreference('emailWeeklySummary', this.checked)"
                   style="width: 20px; height: 20px; cursor: pointer;"
                   ${!userPreferences.emailNotifications ? 'disabled' : ''}>
            <span style="color: rgba(255, 255, 255, 0.85);">Send me weekly activity summary (Sundays at 10 AM)</span>
          </label>
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML += html;
}

async function updatePreference(key, value) {
  try {
    const updates = { [key]: value };
    
    if (key === 'emailNotifications' && !value) {
      updates.emailOnReply = false;
      updates.emailTrendingDigest = false;
      updates.emailWeeklySummary = false;
    }
    
    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (response.ok) {
      const data = await response.json();
      userPreferences = data.preferences;
      renderEmailPreferences();
      showAlert('Preferences updated successfully!', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to update preferences', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

function toggleEdit() {
  isEditing = !isEditing;
  renderProfile();
}

async function saveChanges() {
  const updates = {
    bio: document.getElementById('edit-bio').value,
    email: document.getElementById('edit-email').value,
    location: document.getElementById('edit-location').value,
    website: document.getElementById('edit-website').value
  };
  
  try {
    const response = await fetch(`/api/users/${profileUser.username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (response.ok) {
      const data = await response.json();
      profileUser = data.user;
      isEditing = false;
      renderProfile();
      showAlert('Profile updated successfully!', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to update profile', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

// Avatar upload
document.getElementById('avatar-upload-btn').onclick = () => 
  document.getElementById('avatar-input').click();

document.getElementById('avatar-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('pfp', file);
  
  try {
    const response = await fetch(`/api/users/${currentUser.username}/pfp`, {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      profileUser.pfp = data.pfp;
      document.getElementById('profile-avatar').src = data.pfp;
      showAlert('Profile picture updated!', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to upload profile picture', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Upload failed. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
};

// Banner upload
document.getElementById('banner-upload-btn').onclick = () => 
  document.getElementById('banner-input').click();

document.getElementById('banner-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('banner', file);
  
  try {
    const response = await fetch(`/api/users/${currentUser.username}/banner`, {
      method: 'POST',
      body: formData
    });
    
    if (response.ok) {
      const data = await response.json();
      profileUser.banner = data.banner;
      const bannerImg = document.getElementById('banner-img');
      bannerImg.src = data.banner;
      bannerImg.style.display = 'block';
      showAlert('Banner updated!', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to upload banner', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Upload failed. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
};

// ============================================================================
// DIRECT MESSAGING
// ============================================================================

function openDMModal() {
  document.getElementById('dm-modal').classList.add('open');
}

document.getElementById('cancel-dm').onclick = () => {
  document.getElementById('dm-modal').classList.remove('open');
  document.getElementById('dm-message').value = '';
};

document.getElementById('confirm-dm').onclick = async () => {
  const message = document.getElementById('dm-message').value.trim();
  
  if (!message) {
    showAlert('Please enter a message', 'VALIDATION ERROR', 'fa-exclamation-triangle');
    return;
  }
  
  try {
    const response = await fetch(`/api/messages/${profileUser.username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    if (response.ok) {
      showAlert(
        'Message sent! Check your messages in the forum.',
        'SUCCESS',
        'fa-check-circle'
      );
      document.getElementById('dm-modal').classList.remove('open');
      document.getElementById('dm-message').value = '';
    } else {
      showAlert('Failed to send message', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
};

// ============================================================================
// BLOCKING
// ============================================================================

async function checkBlockStatus() {
  try {
    const response = await fetch('/api/blocked');
    if (response.ok) {
      const data = await response.json();
      return data.blocked.includes(profileUser.username);
    }
  } catch (error) {
    console.error('Failed to check block status:', error);
  }
  return false;
}

async function blockUser() {
  const confirmed = await showConfirm(
    `Are you sure you want to block ${profileUser.username}?`,
    'BLOCK USER'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/block/${profileUser.username}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      showAlert(`${profileUser.username} has been blocked`, 'SUCCESS', 'fa-check-circle');
      renderProfile();
    } else {
      showAlert('Failed to block user', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

async function unblockUser() {
  const confirmed = await showConfirm(
    `Are you sure you want to unblock ${profileUser.username}?`,
    'UNBLOCK USER'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/block/${profileUser.username}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showAlert(`${profileUser.username} has been unblocked`, 'SUCCESS', 'fa-check-circle');
      renderProfile();
    } else {
      showAlert('Failed to unblock user', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

// ============================================================================
// ADMIN PANEL
// ============================================================================

function renderAdminPanel() {
  const container = document.getElementById('admin-actions');
  container.innerHTML = `
    <button class="action-btn danger" onclick="openBanModal()">
      <i class="fas fa-ban"></i>
      Ban User
    </button>
    <button class="action-btn" onclick="unbanUser()">
      <i class="fas fa-check"></i>
      Unban User
    </button>
    <button class="action-btn" onclick="toggleRole()">
      <i class="fas fa-star"></i>
      Toggle Admin
    </button>
    <button class="action-btn" onclick="addWarning()">
      <i class="fas fa-exclamation-triangle"></i>
      Add Warning
    </button>
  `;
}

function openBanModal() {
  document.getElementById('ban-modal').classList.add('open');
}

document.getElementById('cancel-ban').onclick = () => {
  document.getElementById('ban-modal').classList.remove('open');
  document.getElementById('ban-reason').value = '';
};

document.getElementById('confirm-ban').onclick = async () => {
  const reason = document.getElementById('ban-reason').value || 'No reason provided';
  
  try {
    const response = await fetch(`/api/admin/ban/${profileUser.username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    
    if (response.ok) {
      showAlert('User banned successfully', 'SUCCESS', 'fa-check-circle');
      document.getElementById('ban-modal').classList.remove('open');
      setTimeout(() => window.location.href = '/forum', 1500);
    } else {
      showAlert('Failed to ban user', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
};

async function unbanUser() {
  try {
    const response = await fetch(`/api/admin/unban/${profileUser.username}`, {
      method: 'POST'
    });
    
    if (response.ok) {
      showAlert('User unbanned successfully', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to unban user', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

async function toggleRole() {
  const newRole = profileUser.role === 'admin' ? 'user' : 'admin';
  const confirmed = await showConfirm(
    `Change ${profileUser.username}'s role to ${newRole}?`,
    'CHANGE ROLE'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/admin/role/${profileUser.username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    
    if (response.ok) {
      profileUser.role = newRole;
      document.getElementById('profile-role').textContent = newRole;
      showAlert(`User role changed to ${newRole}`, 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to change role', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

async function addWarning() {
  const reason = await showPrompt(
    'Enter warning reason:',
    'ADD WARNING',
    'Enter reason for warning...'
  );
  
  if (!reason) return;
  
  try {
    const response = await fetch(`/api/warnings/${profileUser.username}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    
    if (response.ok) {
      showAlert('Warning added successfully', 'SUCCESS', 'fa-check-circle');
    } else {
      showAlert('Failed to add warning', 'ERROR', 'fa-exclamation-circle');
    }
  } catch (error) {
    showAlert('Network error. Please try again.', 'ERROR', 'fa-exclamation-triangle');
  }
}

// ============================================================================
// MODAL CLICK HANDLERS
// ============================================================================

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
});

// ============================================================================
// INITIALIZE APPLICATION
// ============================================================================

init();