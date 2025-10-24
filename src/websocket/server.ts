import WebSocket, { WebSocketServer } from 'ws';
import * as http from 'http';
import { 
  handleDisconnect, 
  getWSClients, 
  send, 
  broadcastToRoom, 
  broadcastToAll,
  parseStringPayload
} from './handlers';
import { setWSClients } from '../routes/messages';
import Database from '../models/Database';

const db = new Database();

const MAGIC_BYTES = Buffer.from([0x42, 0x50]);
const PROTOCOL_VERSION = 0x01;

export enum OpCode {
  PING = 0x00,
  PONG = 0x01,
  HANDSHAKE = 0x02,
  HANDSHAKE_ACK = 0x03,

  USER_JOIN = 0x10,
  USER_LEAVE = 0x11,
  USERS_ONLINE = 0x12,

  CHAT_JOIN = 0x20,
  CHAT_LEAVE = 0x21,
  CHAT_MESSAGE = 0x22,
  CHAT_HISTORY = 0x23,
  TYPING_START = 0x24,
  TYPING_STOP = 0x25,

  VOICE_JOIN = 0x30,
  VOICE_LEAVE = 0x31,
  VOICE_USERS = 0x32,

  DM_SEND = 0x40,
  DM_RECEIVE = 0x41,
  DM_SENT = 0x42,

  CALL_OFFER = 0x50,
  CALL_ANSWER = 0x51,
  ICE_CANDIDATE = 0x52,
  CALL_ENDED = 0x53,
  CALL_REJECTED = 0x54,
  CALL_FAILED = 0x55,

  ERROR = 0xFE,
  CLOSE = 0xFF
}

interface DecodedFrame {
  version: number;
  opcode: OpCode;
  payload: Buffer;
  remaining: Buffer;
}

type WebSocketExtended = WebSocket & {
  userData?: {
    username: string;
    pfp: string;
  };
  rooms?: Set<string>;
  isAlive?: boolean;
  binaryBuffer?: Buffer;
  clientId?: string;
}

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
const onlineUsers = new Map<string, WebSocketExtended>();
const wsClients = new Map<string, WebSocketExtended>();
const chatRooms = new Map<string, any[]>();
const voiceRooms = new Map<string, Set<string>>();

function encodeFrame(opcode: OpCode, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.allocUnsafe(8);
  MAGIC_BYTES.copy(header, 0);
  header.writeUInt8(PROTOCOL_VERSION, 2);
  header.writeUInt8(opcode, 3);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function decodeFrame(buffer: Buffer): DecodedFrame | null {
  if (buffer.length < 8) return null;

  if (buffer[0] !== MAGIC_BYTES[0] || buffer[1] !== MAGIC_BYTES[1]) {
    throw new Error('Invalid magic bytes');
  }

  const version = buffer.readUInt8(2);
  const opcode = buffer.readUInt8(3) as OpCode;
  const length = buffer.readUInt32BE(4);

  if (buffer.length < 8 + length) return null;

  const payload = buffer.slice(8, 8 + length);
  const remaining = buffer.slice(8 + length);

  return { version, opcode, payload, remaining };
}

function sendFrame(ws: WebSocketExtended, opcode: OpCode, payload: Buffer = Buffer.alloc(0)): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;

  const frame = encodeFrame(opcode, payload);

  try {
    ws.send(frame, { binary: true });
    return true;
  } catch (error) {
    console.error('[BINARY] Error sending frame:', error);
    return false;
  }
}

function buildUserJoinPayload(username: string, pfp: string): Buffer {
  const usernameLen = Buffer.byteLength(username);
  const pfpLen = Buffer.byteLength(pfp);
  const buffer = Buffer.allocUnsafe(2 + usernameLen + 2 + pfpLen);

  let offset = 0;
  buffer.writeUInt16BE(usernameLen, offset);
  offset += 2;
  buffer.write(username, offset);
  offset += usernameLen;
  buffer.writeUInt16BE(pfpLen, offset);
  offset += 2;
  buffer.write(pfp, offset);

  return buffer;
}

function parseUserJoinPayload(payload: Buffer): { username: string; pfp: string } {
  let offset = 0;
  const usernameLen = payload.readUInt16BE(offset);
  offset += 2;
  const username = payload.toString('utf8', offset, offset + usernameLen);
  offset += usernameLen;
  const pfpLen = payload.readUInt16BE(offset);
  offset += 2;
  const pfp = payload.toString('utf8', offset, offset + pfpLen);

  return { username, pfp };
}

function buildChatMessagePayload(username: string, pfp: string, message: string, timestamp: string): Buffer {
  const usernameLen = Buffer.byteLength(username);
  const pfpLen = Buffer.byteLength(pfp);
  const messageLen = Buffer.byteLength(message);
  const timestampLen = Buffer.byteLength(timestamp);

  const buffer = Buffer.allocUnsafe(8 + usernameLen + pfpLen + messageLen + timestampLen);

  let offset = 0;
  buffer.writeUInt16BE(usernameLen, offset);
  offset += 2;
  buffer.write(username, offset);
  offset += usernameLen;

  buffer.writeUInt16BE(pfpLen, offset);
  offset += 2;
  buffer.write(pfp, offset);
  offset += pfpLen;

  buffer.writeUInt16BE(messageLen, offset);
  offset += 2;
  buffer.write(message, offset);
  offset += messageLen;

  buffer.writeUInt16BE(timestampLen, offset);
  offset += 2;
  buffer.write(timestamp, offset);

  return buffer;
}

function parseChatMessagePayload(payload: Buffer): { username: string; pfp: string; message: string; timestamp: string } {
  let offset = 0;

  const usernameLen = payload.readUInt16BE(offset);
  offset += 2;
  const username = payload.toString('utf8', offset, offset + usernameLen);
  offset += usernameLen;

  const pfpLen = payload.readUInt16BE(offset);
  offset += 2;
  const pfp = payload.toString('utf8', offset, offset + pfpLen);
  offset += pfpLen;

  const messageLen = payload.readUInt16BE(offset);
  offset += 2;
  const message = payload.toString('utf8', offset, offset + messageLen);
  offset += messageLen;

  const timestampLen = payload.readUInt16BE(offset);
  offset += 2;
  const timestamp = payload.toString('utf8', offset, offset + timestampLen);

  return { username, pfp, message, timestamp };
}

function buildStringPayload(str: string): Buffer {
  const strLen = Buffer.byteLength(str);
  const buffer = Buffer.allocUnsafe(2 + strLen);
  buffer.writeUInt16BE(strLen, 0);
  buffer.write(str, 2);
  return buffer;
}

function buildUsersListPayload(users: string[]): Buffer {
  const count = users.length;
  let totalLen = 2; 

  const userBuffers: Buffer[] = [];
  for (const user of users) {
    const userLen = Buffer.byteLength(user);
    const userBuf = Buffer.allocUnsafe(2 + userLen);
    userBuf.writeUInt16BE(userLen, 0);
    userBuf.write(user, 2);
    userBuffers.push(userBuf);
    totalLen += 2 + userLen;
  }

  const buffer = Buffer.allocUnsafe(totalLen);
  buffer.writeUInt16BE(count, 0);

  let offset = 2;
  for (const userBuf of userBuffers) {
    userBuf.copy(buffer, offset);
    offset += userBuf.length;
  }

  return buffer;
}

function parseUsersListPayload(payload: Buffer): string[] {
  const count = payload.readUInt16BE(0);
  const users: string[] = [];

  let offset = 2;
  for (let i = 0; i < count; i++) {
    const len = payload.readUInt16BE(offset);
    offset += 2;
    const user = payload.toString('utf8', offset, offset + len);
    offset += len;
    users.push(user);
  }

  return users;
}

function handleBinaryMessage(ws: WebSocketExtended, data: Buffer): void {
  if (!ws.binaryBuffer) {
    ws.binaryBuffer = Buffer.alloc(0);
  }

  ws.binaryBuffer = Buffer.concat([ws.binaryBuffer, data]);

  while (ws.binaryBuffer.length >= 8) {
    try {
      const frame = decodeFrame(ws.binaryBuffer);
      if (!frame) break;

      ws.binaryBuffer = frame.remaining;
      processFrame(ws, frame);
    } catch (err) {
      const error = err as Error;
      console.error(`[BINARY] Frame decode error: ${error.message}`);
      sendFrame(ws, OpCode.ERROR, buildStringPayload(error.message));
      ws.close();
      return;
    }
  }
}

function processFrame(ws: WebSocketExtended, frame: DecodedFrame): void {
  const { opcode, payload } = frame;

  try {
    switch (opcode) {
      case OpCode.PING:
        sendFrame(ws, OpCode.PONG, payload);
        break;

      case OpCode.PONG:
        ws.isAlive = true;
        break;

      case OpCode.HANDSHAKE_ACK:
        console.log(`[BINARY] Handshake ACK from ${ws.clientId}`);
        break;

      case OpCode.USER_JOIN:
        handleUserJoin(ws, payload);
        break;

      case OpCode.CHAT_JOIN:
        handleChatJoin(ws, payload);
        break;

      case OpCode.CHAT_MESSAGE:
        handleChatMessage(ws, payload);
        break;

      case OpCode.VOICE_JOIN:
        handleVoiceJoin(ws, payload);
        break;

      case OpCode.VOICE_LEAVE:
        handleVoiceLeave(ws, payload);
        break;

      case OpCode.DM_SEND:
        handleDirectMessage(ws, payload);
        break;

      case OpCode.TYPING_START:
        handleTypingStart(ws, payload);
        break;

      case OpCode.TYPING_STOP:
        handleTypingStop(ws, payload);
        break;

      case OpCode.CALL_OFFER:
        handleCallOffer(ws, payload);
        break;

      case OpCode.CALL_ANSWER:
        handleCallAnswer(ws, payload);
        break;

      case OpCode.ICE_CANDIDATE:
        handleIceCandidate(ws, payload);
        break;

      case OpCode.CALL_ENDED:
        handleCallEnded(ws, payload);
        break;

      case OpCode.CALL_REJECTED:
        handleCallRejected(ws, payload);
        break;

      case OpCode.CLOSE:
        ws.close();
        break;

      default:
        console.warn(`[BINARY] Unknown opcode: ${opcode}`);
    }
  } catch (error) {
    console.error('[BINARY] Error processing frame:', error);
    sendFrame(ws, OpCode.ERROR, buildStringPayload('Failed to process message'));
  }
}

function handleUserJoin(ws: WebSocketExtended, payload: Buffer): void {
  const { username, pfp } = parseUserJoinPayload(payload);

  ws.userData = { username, pfp };
  onlineUsers.set(username, ws);
  wsClients.set(username, ws);

  const users = Array.from(onlineUsers.keys());
  const usersPayload = buildUsersListPayload(users);

  onlineUsers.forEach((client) => {
    sendFrame(client, OpCode.USERS_ONLINE, usersPayload);
  });

  console.log(`[BINARY] ${username} joined - Total online: ${onlineUsers.size}`);
}

function handleChatMessage(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdLen = payload.readUInt16BE(0);
  const communityId = payload.toString('utf8', 2, 2 + communityIdLen);

  const messagePayload = payload.slice(2 + communityIdLen);
  const { username, pfp, message, timestamp } = parseChatMessagePayload(messagePayload);

  const chatMsg = {
    id: Date.now().toString(),
    username,
    pfp,
    message,
    timestamp
  };

  if (!chatRooms.has(communityId)) {
    chatRooms.set(communityId, []);
  }

  const messages = chatRooms.get(communityId)!;
  messages.push(chatMsg);
  if (messages.length > 100) messages.shift();

  const broadcastPayload = Buffer.concat([
    buildStringPayload(communityId),
    buildChatMessagePayload(username, pfp, message, timestamp)
  ]);

  onlineUsers.forEach((client) => {
    if (client.rooms && client.rooms.has(`chat:${communityId}`)) {
      sendFrame(client, OpCode.CHAT_MESSAGE, broadcastPayload);
    }
  });

  console.log(`[CHAT] ${username} in ${communityId}: ${message.substring(0, 50)}`);
}

function handleDirectMessage(ws: WebSocketExtended, payload: Buffer): void {

  let offset = 0;

  const toLen = payload.readUInt16BE(offset);
  offset += 2;
  const to = payload.toString('utf8', offset, offset + toLen);
  offset += toLen;

  const fromLen = payload.readUInt16BE(offset);
  offset += 2;
  const from = payload.toString('utf8', offset, offset + fromLen);
  offset += fromLen;

  const pfpLen = payload.readUInt16BE(offset);
  offset += 2;
  const pfp = payload.toString('utf8', offset, offset + pfpLen);
  offset += pfpLen;

  const msgLen = payload.readUInt16BE(offset);
  offset += 2;
  const message = payload.toString('utf8', offset, offset + msgLen);

  db.addDirectMessage(from, to, message);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.DM_RECEIVE, payload);
  }

  sendFrame(ws, OpCode.DM_SENT, payload);

  console.log(`[DM] ${from} -> ${to}: ${message.substring(0, 30)}`);
}

function handleChatJoin(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdResult = parseStringPayload(payload, 0);
  const communityId = communityIdResult.value; 

  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(`chat:${communityId}`);

  if (!chatRooms.has(communityId)) {
    chatRooms.set(communityId, []);
  }

  console.log(`[BINARY] ${ws.userData?.username} joined chat: ${communityId}`);
}

function handleVoiceJoin(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdResult = parseStringPayload(payload, 0);
  const communityId = communityIdResult.value; 
  const username = ws.userData?.username || 'unknown';

  if (!ws.rooms) ws.rooms = new Set();
  ws.rooms.add(`voice:${communityId}`);

  if (!voiceRooms.has(communityId)) {
    voiceRooms.set(communityId, new Set());
  }
  voiceRooms.get(communityId)!.add(username);

  const users = Array.from(voiceRooms.get(communityId)!);
  const voicePayload = Buffer.concat([
    buildStringPayload(communityId),
    buildUsersListPayload(users)
  ]);

  onlineUsers.forEach((client) => {
    if (client.rooms && client.rooms.has(`voice:${communityId}`)) {
      sendFrame(client, OpCode.VOICE_USERS, voicePayload);
    }
  });

  console.log(`[VOICE] ${username} joined voice: ${communityId}`);
}

function handleVoiceLeave(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdResult = parseStringPayload(payload, 0);
  const communityId = communityIdResult.value; 
  const username = ws.userData?.username || 'unknown';

  if (voiceRooms.has(communityId)) {
    voiceRooms.get(communityId)!.delete(username);

    const users = Array.from(voiceRooms.get(communityId)!);
    const voicePayload = Buffer.concat([
      buildStringPayload(communityId),
      buildUsersListPayload(users)
    ]);

    onlineUsers.forEach((client) => {
      if (client.rooms && client.rooms.has(`voice:${communityId}`)) {
        sendFrame(client, OpCode.VOICE_USERS, voicePayload);
      }
    });
  }

  if (ws.rooms) {
    ws.rooms.delete(`voice:${communityId}`);
  }

  console.log(`[VOICE] ${username} left voice: ${communityId}`);
}

function handleTypingStart(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdResult = parseStringPayload(payload, 0);
  const communityId = communityIdResult.value; 
  const username = ws.userData?.username || 'unknown';

  const typingPayload = Buffer.concat([
    buildStringPayload(communityId),
    buildStringPayload(username)
  ]);

  onlineUsers.forEach((client) => {
    if (client.rooms && client.rooms.has(`chat:${communityId}`) && client !== ws) {
      sendFrame(client, OpCode.TYPING_START, typingPayload);
    }
  });
}

function handleTypingStop(ws: WebSocketExtended, payload: Buffer): void {
  const communityIdResult = parseStringPayload(payload, 0);
  const communityId = communityIdResult.value; 
  const username = ws.userData?.username || 'unknown';

  const typingPayload = Buffer.concat([
    buildStringPayload(communityId),
    buildStringPayload(username)
  ]);

  onlineUsers.forEach((client) => {
    if (client.rooms && client.rooms.has(`chat:${communityId}`) && client !== ws) {
      sendFrame(client, OpCode.TYPING_STOP, typingPayload);
    }
  });
}

function handleCallOffer(ws: WebSocketExtended, payload: Buffer): void {
  const toResult = parseStringPayload(payload, 0);  
  const to = toResult.value;

  console.log(`[WebRTC] Call offer from ${ws.userData?.username} to ${to}`);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.CALL_OFFER, payload);
    console.log(`[WebRTC] Call offer forwarded successfully`);
  } else {
    console.log(`[WebRTC] Recipient ${to} not found or offline`);
    sendFrame(ws, OpCode.CALL_FAILED, buildStringPayload('User is offline'));
  }
}

function handleCallAnswer(ws: WebSocketExtended, payload: Buffer): void {
  const toResult = parseStringPayload(payload, 0);
  const to = toResult.value;

  console.log(`[WebRTC] Call answer from ${ws.userData?.username} to ${to}`);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.CALL_ANSWER, payload);
    console.log(`[WebRTC] Call answer forwarded successfully`);
  } else {
    console.log(`[WebRTC] Recipient ${to} not found or offline`);
    sendFrame(ws, OpCode.CALL_FAILED, buildStringPayload('Recipient offline'));
  }
}

function handleIceCandidate(ws: WebSocketExtended, payload: Buffer): void {
  const toResult = parseStringPayload(payload, 0);
  const to = toResult.value;

  console.log(`[WebRTC] ICE candidate from ${ws.userData?.username} to ${to}`);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.ICE_CANDIDATE, payload);
    console.log(`[WebRTC] ICE candidate forwarded successfully`);
  } else {
    console.log(`[WebRTC] ICE candidate failed - ${to} offline`);
  }
}

function handleCallEnded(ws: WebSocketExtended, payload: Buffer): void {
  let offset = 0;
  const toLen = payload.readUInt16BE(offset);
  offset += 2;
  const to = payload.toString('utf8', offset, offset + toLen);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.CALL_ENDED, payload);
  }
}

function handleCallRejected(ws: WebSocketExtended, payload: Buffer): void {
  let offset = 0;
  const toLen = payload.readUInt16BE(offset);
  offset += 2;
  const to = payload.toString('utf8', offset, offset + toLen);

  const recipientWs = wsClients.get(to);
  if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
    sendFrame(recipientWs, OpCode.CALL_REJECTED, payload);
  }
}

function handleClientDisconnect(ws: WebSocketExtended): void {
  if (!ws.userData) return;

  const { username } = ws.userData;

  onlineUsers.delete(username);
  wsClients.delete(username);

  const users = Array.from(onlineUsers.keys());
  const usersPayload = buildUsersListPayload(users);

  onlineUsers.forEach((client) => {
    sendFrame(client, OpCode.USERS_ONLINE, usersPayload);
  });

  voiceRooms.forEach((users, communityId) => {
    if (users.has(username)) {
      users.delete(username);

      const voiceUsers = Array.from(users);
      const voicePayload = Buffer.concat([
        buildStringPayload(communityId),
        buildUsersListPayload(voiceUsers)
      ]);

      onlineUsers.forEach((client) => {
        if (client.rooms && client.rooms.has(`voice:${communityId}`)) {
          sendFrame(client, OpCode.VOICE_USERS, voicePayload);
        }
      });
    }
  });

  console.log(`[BINARY] ${username} disconnected - Total online: ${onlineUsers.size}`);
}

function startHeartbeat(): void {
  heartbeatInterval = setInterval(() => {
    if (!wss) return;

    wss.clients.forEach((ws: WebSocket) => {
      const client = ws as WebSocketExtended;
      if (client.isAlive === false) {
        console.log(`[WS] Terminating dead connection: ${client.userData?.username}`);
        return client.terminate();
      }

      client.isAlive = false;
      sendFrame(client, OpCode.PING, Buffer.alloc(0));
    });
  }, 30000);

  console.log('[BINARY] Heartbeat started');
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('[BINARY] Heartbeat stopped');
  }
}

function init(server: http.Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const client = ws as WebSocketExtended;
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress;

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    client.clientId = clientId;
    client.isAlive = true;
    client.binaryBuffer = Buffer.alloc(0);

    console.log(`[BINARY] New connection from ${clientIp} - ID: ${clientId}`);

    sendFrame(client, OpCode.HANDSHAKE, buildStringPayload(clientId));

    client.on('message', (data: Buffer | string) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      handleBinaryMessage(client, buffer);
    });

    client.on('close', () => {
      handleClientDisconnect(client);
    });

    client.on('error', (error: Error) => {
      console.error('[BINARY] WebSocket error:', error);
    });
  });

  wss.on('close', () => {
    stopHeartbeat();
    console.log('[BINARY] WebSocket server closed');
  });

  console.log('[BINARY] Custom Binary Protocol WebSocket server initialized');
  setWSClients(wsClients);
  startHeartbeat();
}

function shutdown(): void {
  console.log('[BINARY] Shutting down WebSocket server...');

  stopHeartbeat();

  if (wss) {
    wss.clients.forEach((client: WebSocket) => {
      client.close(1000, 'Server shutting down');
    });

    wss.close(() => {
      console.log('[BINARY] WebSocket server shut down complete');
    });
  }
}

function getStats(): any {
  return {
    connected: wsClients.size,
    onlineUsers: onlineUsers.size,
    chatRooms: chatRooms.size,
    voiceRooms: voiceRooms.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  };
}

export default {
  init,
  shutdown,
  getStats,
  getWSClients: () => wsClients,
  OpCode
};