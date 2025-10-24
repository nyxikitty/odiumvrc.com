import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import { requireAuth } from '../middleware/auth';
import WebSocket from 'ws';
import sanitizeHtml from 'sanitize-html';

const db = new Database();

type WebSocketExtended = WebSocket & {
  userData?: {
    username: string;
    pfp: string;
  };
  rooms?: Set<string>;
  isAlive?: boolean;
}

let wsClients = new Map<string, WebSocketExtended>();

interface UsernameParams {
  username: string;
}

interface SendMessageBody {
  message: string;
}

function sanitizeInput(input: string, maxLength: number = 5000): string {
  if (!input || typeof input !== 'string') return '';
  
  const cleaned = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    allowedSchemes: []
  });
  
  let safe = cleaned
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .trim();
  
  if (safe.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
  }
  
  return safe;
}

function sendWS(ws: WebSocketExtended, message: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[DM] Error sending WebSocket message:', error);
    }
  }
}

export default async function messageRoutes(fastify: FastifyInstance) {
  fastify.get('/conversations', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const messages = db.readMessages();
      const username = req.session.user.username;
      const conversations = new Map<string, any>();
      
      Object.keys(messages).forEach(conversationId => {
        const parts = conversationId.split('_');
        
        if (parts.includes(username)) {
          const otherUser = parts[0] === username ? parts[1] : parts[0];
          const convMessages = messages[conversationId];
          
          if (convMessages.length > 0) {
            const lastMsg = convMessages[convMessages.length - 1];
            const user = db.getUser(otherUser);
            
            const unreadCount = convMessages.filter((msg: any) => 
              msg.to === username && !msg.read
            ).length;
            
            conversations.set(otherUser, {
              username: otherUser,
              pfp: user ? user.pfp : '/uploads/default-0.png',
              lastMessage: lastMsg.message.substring(0, 30) + (lastMsg.message.length > 30 ? '...' : ''),
              timestamp: lastMsg.timestamp,
              unread: unreadCount
            });
          }
        }
      });
      
      const conversationList = Array.from(conversations.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return reply.send({ conversations: conversationList });
    } catch (error) {
      console.error('[DM] Error loading conversations:', error);
      return reply.status(500).send({ error: 'Failed to load conversations', conversations: [] });
    }
  });

  fastify.get<{ Params: UsernameParams }>(
    '/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const messages = db.getDirectMessages(
          req.session.user.username, 
          req.params.username
        );
        
        console.log(`[DM] Loaded ${messages.length} messages between ${req.session.user.username} and ${req.params.username}`);
        return reply.send({ messages });
      } catch (error) {
        console.error('[DM] Error loading messages:', error);
        return reply.status(500).send({ error: 'Failed to load messages', messages: [] });
      }
    }
  );

  fastify.post<{ Params: UsernameParams; Body: SendMessageBody }>(
    '/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const { message } = req.body;
        
        if (!message || !message.trim()) {
          return reply.status(400).send({ error: 'Message content required' });
        }
        
        // Sanitize message content
        const sanitizedMessage = sanitizeInput(message, 2000);
        
        if (!sanitizedMessage) {
          return reply.status(400).send({ error: 'Message cannot be empty' });
        }
        
        const recipient = db.getUser(req.params.username);
        if (!recipient) {
          return reply.status(404).send({ error: 'User not found' });
        }
        
        const blockedUsers = db.getBlockedUsers(req.params.username);
        if (blockedUsers.includes(req.session.user.username)) {
          return reply.status(403).send({ error: 'You cannot message this user' });
        }
        
        const msg = db.addDirectMessage(
          req.session.user.username, 
          req.params.username, 
          sanitizedMessage
        );
        
        const recipientWs = wsClients.get(req.params.username);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          sendWS(recipientWs, { 
            type: 'dm:receive', 
            data: {
              id: msg.id,
              from: req.session.user.username,
              to: req.params.username,
              message: msg.message,
              pfp: req.session.user.pfp,
              timestamp: msg.timestamp,
              read: false
            }
          });
        }
        
        console.log(`[DM] Message sent from ${req.session.user.username} to ${req.params.username}`);
        return reply.send({ success: true, message: msg });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/:username/read',
    { preHandler: requireAuth },
    async (req, reply) => {
      db.markMessagesRead(req.params.username, req.session.user.username);
      
      console.log(`[DM] Messages marked as read: ${req.params.username} -> ${req.session.user.username}`);
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: UsernameParams }>(
    '/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const messages = db.readMessages();
        const conversationId = [req.session.user.username, req.params.username].sort().join('_');
        
        if (messages[conversationId]) {
          delete messages[conversationId];
          db.writeMessages(messages);
          console.log(`[DM] Conversation deleted: ${conversationId}`);
        }
        
        return reply.send({ success: true });
      } catch (error) {
        console.error('[DM] Error deleting conversation:', error);
        return reply.status(500).send({ error: 'Failed to delete conversation' });
      }
    }
  );
}

export function setWSClients(clients: Map<string, WebSocketExtended>): void {
  wsClients = clients;
}