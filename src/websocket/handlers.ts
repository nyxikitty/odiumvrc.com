import WebSocket from 'ws';
import Database from '../models/Database';

const db = new Database();

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
  ERROR = 0xfe,
  CLOSE = 0xff
}

type WebSocketExtended = WebSocket & {
  userData?: {
    username: string;
    pfp: string;
  };
  rooms?: Set<string>;
  isAlive?: boolean;
}

const onlineUsers = new Map<string, WebSocketExtended>();
const wsClients = new Map<string, WebSocketExtended>();
const chatRooms = new Map<string, ChatMessage[]>();
const voiceRooms = new Map<string, Set<string>>();

interface ChatMessage {
  id: string;
  username: string;
  pfp: string;
  message: string;
  timestamp: string;
}

export function buildStringPayload(str: string): Buffer {
  const strLen = Buffer.byteLength(str);
  const buffer = Buffer.allocUnsafe(2 + strLen);
  buffer.writeUInt16BE(strLen, 0);
  buffer.write(str, 2);
  return buffer;
}

export function parseStringPayload(payload: Buffer, offset: number = 0): { value: string; nextOffset: number } {
  const len = payload.readUInt16BE(offset);
  const value = payload.toString('utf8', offset + 2, offset + 2 + len);
  return { value, nextOffset: offset + 2 + len };
}

export function buildUsersListPayload(users: string[]): Buffer {
  const count = users.length;
  const userBuffers: Buffer[] = [];
  let totalLen = 2;

  for (const user of users) {
    const userBuf = buildStringPayload(user);
    userBuffers.push(userBuf);
    totalLen += userBuf.length;
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

export function parseUsersListPayload(payload: Buffer): string[] {
  const count = payload.readUInt16BE(0);
  const users: string[] = [];

  let offset = 2;
  for (let i = 0; i < count; i++) {
    const result = parseStringPayload(payload, offset);
    users.push(result.value);
    offset = result.nextOffset;
  }

  return users;
}

export function buildUserJoinPayload(username: string, pfp: string): Buffer {
  const usernameBuf = buildStringPayload(username);
  const pfpBuf = buildStringPayload(pfp);
  return Buffer.concat([usernameBuf, pfpBuf]);
}

export function parseUserJoinPayload(payload: Buffer): { username: string; pfp: string } {
  const usernameResult = parseStringPayload(payload, 0);
  const pfpResult = parseStringPayload(payload, usernameResult.nextOffset);

  return {
    username: usernameResult.value,
    pfp: pfpResult.value
  };
}

export function buildChatMessagePayload(
  username: string,
  pfp: string,
  message: string,
  timestamp: string
): Buffer {
  return Buffer.concat([
    buildStringPayload(username),
    buildStringPayload(pfp),
    buildStringPayload(message),
    buildStringPayload(timestamp)
  ]);
}

export function parseChatMessagePayload(payload: Buffer): {
  username: string;
  pfp: string;
  message: string;
  timestamp: string;
} {
  let offset = 0;
  const usernameResult = parseStringPayload(payload, offset);
  offset = usernameResult.nextOffset;

  const pfpResult = parseStringPayload(payload, offset);
  offset = pfpResult.nextOffset;

  const messageResult = parseStringPayload(payload, offset);
  offset = messageResult.nextOffset;

  const timestampResult = parseStringPayload(payload, offset);

  return {
    username: usernameResult.value,
    pfp: pfpResult.value,
    message: messageResult.value,
    timestamp: timestampResult.value
  };
}

export function buildChatHistoryPayload(messages: ChatMessage[]): Buffer {
  const count = messages.length;
  const msgBuffers: Buffer[] = [];
  let totalLen = 2; 

  for (const msg of messages) {
    const idBuf = buildStringPayload(msg.id);
    const msgBuf = buildChatMessagePayload(msg.username, msg.pfp, msg.message, msg.timestamp);
    const combined = Buffer.concat([idBuf, msgBuf]);
    msgBuffers.push(combined);
    totalLen += combined.length;
  }

  const buffer = Buffer.allocUnsafe(totalLen);
  buffer.writeUInt16BE(count, 0);

  let offset = 2;
  for (const msgBuf of msgBuffers) {
    msgBuf.copy(buffer, offset);
    offset += msgBuf.length;
  }

  return buffer;
}

export function buildDirectMessagePayload(
  to: string,
  from: string,
  pfp: string,
  message: string
): Buffer {
  return Buffer.concat([
    buildStringPayload(to),
    buildStringPayload(from),
    buildStringPayload(pfp),
    buildStringPayload(message)
  ]);
}

export function parseDirectMessagePayload(payload: Buffer): {
  to: string;
  from: string;
  pfp: string;
  message: string;
} {
  let offset = 0;

  const toResult = parseStringPayload(payload, offset);
  offset = toResult.nextOffset;

  const fromResult = parseStringPayload(payload, offset);
  offset = fromResult.nextOffset;

  const pfpResult = parseStringPayload(payload, offset);
  offset = pfpResult.nextOffset;

  const messageResult = parseStringPayload(payload, offset);

  return {
    to: toResult.value,
    from: fromResult.value,
    pfp: pfpResult.value,
    message: messageResult.value
  };
}

export function buildWebRTCPayload(to: string, from: string, data: string): Buffer {
  return Buffer.concat([
    buildStringPayload(to),
    buildStringPayload(from),
    buildStringPayload(data)
  ]);
}

export function parseWebRTCPayload(payload: Buffer): {
  to: string;
  from: string;
  data: string;
} {
  let offset = 0;

  const toResult = parseStringPayload(payload, offset);
  offset = toResult.nextOffset;

  const fromResult = parseStringPayload(payload, offset);
  offset = fromResult.nextOffset;

  const dataResult = parseStringPayload(payload, offset);

  return {
    to: toResult.value,
    from: fromResult.value,
    data: dataResult.value
  };
}

const MAGIC_BYTES = Buffer.from([0x42, 0x50]);
const PROTOCOL_VERSION = 0x01;

function encodeFrame(opcode: OpCode, payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.allocUnsafe(8);
  MAGIC_BYTES.copy(header, 0);
  header.writeUInt8(PROTOCOL_VERSION, 2);
  header.writeUInt8(opcode, 3);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

export function send(ws: WebSocketExtended, opcode: OpCode, payload: Buffer = Buffer.alloc(0)): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const frame = encodeFrame(opcode, payload);
      ws.send(frame, { binary: true });
    } catch (error) {
      console.error('[BINARY] Error sending message:', error);
    }
  }
}

export function broadcastToAll(opcode: OpCode, payload: Buffer): void {
  onlineUsers.forEach((ws) => {
    send(ws, opcode, payload);
  });
}

export function broadcastToRoom(
  room: string,
  opcode: OpCode,
  payload: Buffer,
  excludeWs: WebSocketExtended | null = null
): void {
  onlineUsers.forEach((ws) => {
    if (ws.rooms && ws.rooms.has(room) && ws !== excludeWs) {
      send(ws, opcode, payload);
    }
  });
}

export function handleDisconnect(ws: WebSocketExtended): void {
  if (!ws.userData) return;

  const { username } = ws.userData;

  onlineUsers.delete(username);
  wsClients.delete(username);

  const users = Array.from(onlineUsers.keys());
  const usersPayload = buildUsersListPayload(users);
  broadcastToAll(OpCode.USERS_ONLINE, usersPayload);

  voiceRooms.forEach((users, communityId) => {
    if (users.has(username)) {
      users.delete(username);

      const voiceUsers = Array.from(users);
      const voicePayload = Buffer.concat([
        buildStringPayload(communityId),
        buildUsersListPayload(voiceUsers)
      ]);

      broadcastToRoom(`voice:${communityId}`, OpCode.VOICE_USERS, voicePayload);
    }
  });

  console.log(`[BINARY] ${username} disconnected - Total online: ${onlineUsers.size}`);
}

export function getWSClients(): Map<string, WebSocketExtended> {
  return wsClients;
}

export function getOnlineUsersCount(): number {
  return onlineUsers.size;
}

export function getRoomUsers(roomId: string): string[] {
  const users: string[] = [];
  onlineUsers.forEach((ws, username) => {
    if (ws.rooms && ws.rooms.has(roomId)) {
      users.push(username);
    }
  });
  return users;
}

export function getOnlineUsers(): Map<string, WebSocketExtended> {
  return onlineUsers;
}

export function getChatRooms(): Map<string, ChatMessage[]> {
  return chatRooms;
}

export function getVoiceRooms(): Map<string, Set<string>> {
  return voiceRooms;
}