import { WebSocket } from 'uWebSockets.js';
import Database from '../models/Database';

const db = new Database();

interface UserData {
  username: string;
  pfp: string;
  rooms?: Set<string>;
  isAlive?: boolean;
}

type WebSocketWithUserData = WebSocket<UserData>;

const onlineUsers = new Map<string, WebSocketWithUserData>();
const wsClients = new Map<string, WebSocketWithUserData>();
const chatRooms = new Map<string, ChatMessage[]>();
const voiceRooms = new Map<string, Set<string>>();

interface ChatMessage {
  id: string;
  username: string;
  pfp: string;
  message: string;
  timestamp: string;
}

interface DirectMessage {
  id: string;
  from: string;
  to: string;
  pfp: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface WebSocketMessage {
  type: string;
  data: any;
}

interface UserJoinData {
  username: string;
  pfp: string;
}

interface ChatJoinData {
  communityId: string;
}

interface ChatMessageData {
  communityId: string;
  message: string;
  username: string;
  pfp: string;
}

interface VoiceJoinData {
  communityId: string;
  username: string;
}

interface VoiceLeaveData {
  communityId: string;
  username: string;
}

interface DirectMessageData {
  to: string;
  from: string;
  message: string;
  pfp: string;
}

interface TypingData {
  communityId: string;
  username: string;
}

interface CallOfferData {
  to: string;
  from: string;
  offer: any;
  callType: string;
}

interface CallAnswerData {
  to: string;
  from: string;
  answer: any;
}

interface IceCandidateData {
  to: string;
  candidate: any;
}

interface CallEndedData {
  to: string;
  from: string;
}

interface CallRejectData {
  to: string;
  from: string;
}

export function send(ws: WebSocketWithUserData, message: any): void {
  try {
    const data = JSON.stringify(message);
    const result = ws.send(data, false, false);
    if (result === 0) {
      console.warn('[UWS] Message dropped due to backpressure');
    }
  } catch (error) {
    console.error('[UWS] Error sending message:', error);
  }
}

export function broadcastToAll(message: any): void {
  onlineUsers.forEach((ws) => {
    send(ws, message);
  });
}

export function broadcastToRoom(room: string, message: any, excludeWs: WebSocketWithUserData | null = null): void {
  onlineUsers.forEach((ws) => {
    const userData = ws.getUserData();
    if (userData.rooms && userData.rooms.has(room) && ws !== excludeWs) {
      send(ws, message);
    }
  });
}

export function handleWebSocketMessage(ws: WebSocketWithUserData, message: WebSocketMessage): void {
  const { type, data } = message;
  
  try {
    switch (type) {
      case 'user:join':
        handleUserJoin(ws, data);
        break;
        
      case 'chat:join':
        handleChatJoin(ws, data);
        break;
        
      case 'chat:message':
        handleChatMessage(ws, data);
        break;
        
      case 'voice:join':
        handleVoiceJoin(ws, data);
        break;
        
      case 'voice:leave':
        handleVoiceLeave(ws, data);
        break;
        
      case 'dm:send':
        handleDirectMessage(ws, data);
        break;
        
      case 'typing:start':
        handleTypingStart(ws, data);
        break;
        
      case 'typing:stop':
        handleTypingStop(ws, data);
        break;
        
      case 'call:offer':
        handleCallOffer(ws, data);
        break;
        
      case 'call:answer':
        handleCallAnswer(ws, data);
        break;
        
      case 'call:ice-candidate':
        handleIceCandidate(ws, data);
        break;
        
      case 'call:ended':
        handleCallEnded(ws, data);
        break;
        
      case 'call:reject':
        handleCallReject(ws, data);
        break;
        
      default:
        console.log(`[UWS] Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error('[UWS] Error handling message:', error);
    send(ws, { type: 'error', data: { message: 'Failed to process message' } });
  }
}

function handleUserJoin(ws: WebSocketWithUserData, data: UserJoinData): void {
  const { username, pfp } = data;
  
  const userData = ws.getUserData();
  userData.username = username;
  userData.pfp = pfp;
  
  onlineUsers.set(username, ws);
  wsClients.set(username, ws);
  
  broadcastToAll({ 
    type: 'users:online', 
    data: Array.from(onlineUsers.keys()) 
  });
  
  console.log(`[UWS] ${username} joined - Total online: ${onlineUsers.size}`);
}

function handleChatJoin(ws: WebSocketWithUserData, data: ChatJoinData): void {
  const { communityId } = data;
  
  const userData = ws.getUserData();
  if (!userData.rooms) userData.rooms = new Set();
  userData.rooms.add(`chat:${communityId}`);
  
  if (!chatRooms.has(communityId)) {
    chatRooms.set(communityId, []);
  }
  
  send(ws, { 
    type: 'chat:history', 
    data: chatRooms.get(communityId) 
  });
  
  console.log(`[UWS] ${userData.username} joined chat: ${communityId}`);
}

function handleChatMessage(ws: WebSocketWithUserData, data: ChatMessageData): void {
  const { communityId, message, username, pfp } = data;
  
  const chatMsg: ChatMessage = {
    id: Date.now().toString(),
    username,
    pfp,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (!chatRooms.has(communityId)) {
    chatRooms.set(communityId, []);
  }
  
  const messages = chatRooms.get(communityId)!;
  messages.push(chatMsg);
  if (messages.length > 100) {
    messages.shift();
  }
  
  broadcastToRoom(`chat:${communityId}`, { 
    type: 'chat:message', 
    data: chatMsg 
  });
  
  console.log(`[CHAT] ${username} in ${communityId}: ${message.substring(0, 50)}`);
}

function handleVoiceJoin(ws: WebSocketWithUserData, data: VoiceJoinData): void {
  const { communityId, username } = data;
  
  const userData = ws.getUserData();
  if (!userData.rooms) userData.rooms = new Set();
  userData.rooms.add(`voice:${communityId}`);
  
  if (!voiceRooms.has(communityId)) {
    voiceRooms.set(communityId, new Set());
  }
  voiceRooms.get(communityId)!.add(username);
  
  broadcastToRoom(`voice:${communityId}`, { 
    type: 'voice:users', 
    data: Array.from(voiceRooms.get(communityId)!) 
  });
  
  console.log(`[VOICE] ${username} joined voice: ${communityId}`);
}

function handleVoiceLeave(ws: WebSocketWithUserData, data: VoiceLeaveData): void {
  const { communityId, username } = data;
  
  if (voiceRooms.has(communityId)) {
    voiceRooms.get(communityId)!.delete(username);
    
    broadcastToRoom(`voice:${communityId}`, { 
      type: 'voice:users', 
      data: Array.from(voiceRooms.get(communityId)!) 
    });
  }
  
  const userData = ws.getUserData();
  if (userData.rooms) {
    userData.rooms.delete(`voice:${communityId}`);
  }
  
  console.log(`[VOICE] ${username} left voice: ${communityId}`);
}

function handleDirectMessage(ws: WebSocketWithUserData, data: DirectMessageData): void {
  const { to, from, message, pfp } = data;
  
  const directMsg: DirectMessage = {
    id: Date.now().toString(),
    from,
    to,
    pfp,
    message,
    timestamp: new Date().toISOString(),
    read: false
  };
  
  db.addDirectMessage(from, to, message);
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'dm:receive', data: directMsg });
  }
  
  send(ws, { type: 'dm:sent', data: directMsg });
  
  console.log(`[DM] ${from} -> ${to}: ${message.substring(0, 30)}`);
}

function handleTypingStart(ws: WebSocketWithUserData, data: TypingData): void {
  const { communityId, username } = data;
  
  broadcastToRoom(`chat:${communityId}`, { 
    type: 'typing:start', 
    data: { username } 
  }, ws);
}

function handleTypingStop(ws: WebSocketWithUserData, data: TypingData): void {
  const { communityId, username } = data;
  
  broadcastToRoom(`chat:${communityId}`, { 
    type: 'typing:stop', 
    data: { username } 
  }, ws);
}

function handleCallOffer(ws: WebSocketWithUserData, data: CallOfferData): void {
  const { to, from, offer, callType } = data;
  
  console.log(`[WebRTC] Call offer from ${from} to ${to} (${callType})`);
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'call:offer', data });
  } else {
    send(ws, { 
      type: 'call:failed', 
      data: { message: 'User is offline' } 
    });
  }
}

function handleCallAnswer(ws: WebSocketWithUserData, data: CallAnswerData): void {
  const { to, from, answer } = data;
  
  console.log(`[WebRTC] Call answer from ${from} to ${to}`);
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'call:answer', data });
  }
}

function handleIceCandidate(ws: WebSocketWithUserData, data: IceCandidateData): void {
  const { to, candidate } = data;
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'call:ice-candidate', data });
  }
}

function handleCallEnded(ws: WebSocketWithUserData, data: CallEndedData): void {
  const { to, from } = data;
  
  console.log(`[WebRTC] Call ended between ${from} and ${to}`);
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'call:ended', data });
  }
}

function handleCallReject(ws: WebSocketWithUserData, data: CallRejectData): void {
  const { to, from } = data;
  
  console.log(`[WebRTC] Call rejected by ${from} to ${to}`);
  
  const recipientWs = wsClients.get(to);
  if (recipientWs) {
    send(recipientWs, { type: 'call:rejected', data });
  }
}

export function handleDisconnect(ws: WebSocketWithUserData): void {
  const userData = ws.getUserData();
  if (!userData.username) return;
  
  const { username } = userData;
  
  onlineUsers.delete(username);
  wsClients.delete(username);
  
  broadcastToAll({ 
    type: 'users:online', 
    data: Array.from(onlineUsers.keys()) 
  });
  
  voiceRooms.forEach((users, communityId) => {
    if (users.has(username)) {
      users.delete(username);
      broadcastToRoom(`voice:${communityId}`, { 
        type: 'voice:users', 
        data: Array.from(users) 
      });
    }
  });
  
  console.log(`[UWS] ${username} disconnected - Total online: ${onlineUsers.size}`);
}

export function getWSClients(): Map<string, WebSocketWithUserData> {
  return wsClients;
}

export function getOnlineUsersCount(): number {
  return onlineUsers.size;
}

export function getRoomUsers(roomId: string): string[] {
  const users: string[] = [];
  onlineUsers.forEach((ws, username) => {
    const userData = ws.getUserData();
    if (userData.rooms && userData.rooms.has(roomId)) {
      users.push(username);
    }
  });
  return users;
}