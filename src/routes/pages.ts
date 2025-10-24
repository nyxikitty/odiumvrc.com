import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import { requireAuth } from '../middleware/auth';

interface CommunityParams {
  communityId: string;
}

interface UsernameParams {
  username: string;
}

export default async function pageRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.session.user) {
      return reply.sendFile('forum.html');
    }
    return reply.sendFile('home.html');
  });

  fastify.get('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.session.user) {
      return reply.redirect('/forum');
    }
    return reply.sendFile('login.html');
  });

  fastify.get('/register', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.session.user) {
      return reply.redirect('/forum');
    }
    return reply.sendFile('register.html');
  });

  fastify.get('/forum', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('forum.html');
  });

  fastify.get<{ Params: CommunityParams }>(
    '/o/:communityId',
    { preHandler: requireAuth },
    async (req, reply) => {
      return reply.sendFile('forum.html');
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/profile/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      return reply.sendFile('profile.html');
    }
  );

  fastify.get('/settings', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('settings.html');
  });

  fastify.get('/messages', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('messages.html');
  });

  fastify.get('/admin', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!['admin', 'owner'].includes(req.session.user.role)) {
      return reply.redirect('/forum');
    }
    return reply.sendFile('admin.html');
  });

  fastify.get('/leaderboard', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('leaderboard.html');
  });

  fastify.get('/about', async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('about.html');
  });

  fastify.get('/rules', async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.sendFile('rules.html');
  });

  fastify.setNotFoundHandler(async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).sendFile('404.html');
  });
}