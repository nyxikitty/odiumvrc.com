import 'dotenv/config';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySession from '@fastify/session';
import fastifyCookie from '@fastify/cookie';
import path from 'path';

import { sessionOptions } from './src/config/session';
import emailService from './src/services/emailService';
import wsServer from './src/websocket/server';
import authRoutes from './src/routes/auth';
import userRoutes from './src/routes/users';
import postRoutes from './src/routes/posts';
import communityRoutes from './src/routes/communities';
import adminRoutes from './src/routes/admin';
import messageRoutes from './src/routes/messages';
import pageRoutes from './src/routes/pages';
import { requireAuth } from './src/middleware/auth';
import Database from './src/models/Database';

declare module 'fastify' {
  interface Session {
    user: {
      username: string;
      pfp?: string;
      role?: string;
      [key: string]: any;
    };
  }
}

interface SearchQuery {
  q?: string;
  community?: string;
  category?: string;
  author?: string;
}

type LeaderboardType = 'xp' | 'reputation' | 'posts' | 'streak';

const app: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  },
  trustProxy: true,
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  requestIdHeader: 'x-request-id'
});

const PORT: number = parseInt(process.env.PORT || '3008', 10);
const db = new Database();

async function setupServer() {
  await app.register(fastifyCookie);
  
  await app.register(fastifySession, sessionOptions);
  
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/'
  });

  wsServer.init(app.server);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(postRoutes, { prefix: '/api/posts' });
  await app.register(communityRoutes, { prefix: '/api/communities' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(messageRoutes, { prefix: '/api/messages' });

  app.get('/api/preferences', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const prefs = db.getUserPreferences(req.session.user.username);
    return reply.send({ preferences: prefs });
  });

  app.put('/api/preferences', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const prefs = db.updateUserPreferences(req.session.user.username, req.body);
    return reply.send({ preferences: prefs });
  });

  app.get('/api/drafts', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const drafts = db.getDrafts(req.session.user.username);
    return reply.send({ drafts });
  });

  app.post('/api/drafts', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const result = db.saveDraft(req.session.user.username, req.body);
    return reply.send(result);
  });

  app.delete<{ Params: { draftId: string } }>(
    '/api/drafts/:draftId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.deleteDraft(req.session.user.username, req.params.draftId);
      return reply.send(result);
    }
  );

  app.get<{ Params: { username: string } }>(
    '/api/achievements/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      const achievements = db.getAchievements(req.params.username);
      return reply.send({ achievements });
    }
  );

  app.get('/api/bookmarks', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const bookmarks = db.getBookmarks(req.session.user.username);
    const posts = db.readPosts();
    const bookmarkedPosts = bookmarks
      .map((id: string) => posts.find((p: any) => p.id === id))
      .filter((p: any) => p !== undefined);
    return reply.send({ bookmarks: bookmarkedPosts });
  });

  app.get<{ Params: { type: string } }>(
    '/api/leaderboard/:type',
    { preHandler: requireAuth },
    async (req, reply) => {
      const validTypes: LeaderboardType[] = ['xp', 'reputation', 'posts', 'streak'];
      
      if (!validTypes.includes(req.params.type as LeaderboardType)) {
        return reply.status(400).send({ error: 'Invalid leaderboard type' });
      }
      
      const leaderboard = db.getLeaderboard(req.params.type, 10);
      return reply.send({ leaderboard });
    }
  );

  app.get<{ Querystring: SearchQuery }>(
    '/api/search',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.query.q) {
        return reply.status(400).send({ error: 'Search query required' });
      }
      
      const results = db.searchPosts(req.query.q, {
        community: req.query.community,
        category: req.query.category,
        author: req.query.author
      });
      
      return reply.send({ results });
    }
  );

  app.get('/api/health', async (req: FastifyRequest, reply: FastifyReply) => {
    const stats = wsServer.getStats();
    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      websocket: {
        connected: stats.connected,
        onlineUsers: stats.onlineUsers,
        chatRooms: stats.chatRooms,
        voiceRooms: stats.voiceRooms
      },
      memory: stats.memoryUsage,
      timestamp: new Date().toISOString()
    });
  });

  await app.register(pageRoutes);

  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal server error'
    });
  });

  return app;
}

async function start() {
  try {
    await setupServer();
    
    emailService.initEmailSchedulers();
    
    await app.listen({ port: PORT, host: '0.0.0.0' });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       ODIUM COLLECTIVE - BINARY PROTOCOL SERVER');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`WebRTC enabled: Voice & Video Calls`);
    console.log(`Custom Binary Protocol: Ultra-fast messaging`);
    console.log(`Database: ${path.resolve('./data')}`);
    console.log('');
    console.log('   FEATURES ENABLED:');
    console.log('   • Custom Binary WebSocket Protocol (NO JSON!)');
    console.log('   • WebRTC Voice & Video Calling');
    console.log('   • Invite-Only Registration System');
    console.log('   • Live Chat & Voice Rooms');
    console.log('   • Direct Messaging');
    console.log('   • Email Notifications & Digests');
    console.log('   • XP/Leveling & Achievement System');
    console.log('   • User Bookmarks & Blocking');
    console.log('   • Post Drafts & Editing');
    console.log('   • Community System with Moderation');
    console.log('   • Full Admin Controls & Reports');
    console.log('   • Rate Limiting & Security');
    console.log('');
    console.log('   Performance: Fastify + Binary WebSockets (Ultra-Fast)');
    console.log('   Protocol: Magic Bytes [0x42, 0x50] + OpCodes');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`[SERVER] ${signal} received, shutting down gracefully...`);
  
  wsServer.shutdown();
  
  await app.close();
  console.log('[SERVER] Fastify server closed');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error): void => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>): void => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

start();

export { app };