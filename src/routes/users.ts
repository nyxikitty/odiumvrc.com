import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { saveUploadedFile } from "../config/multipart";
import fastifyMultipart from '@fastify/multipart';
import sanitizeHtml from 'sanitize-html';

const db = new Database();

interface UsernameParams {
  username: string;
}

interface DraftParams {
  username: string;
  draftId: string;
}

interface LeaderboardParams {
  type: string;
}

export default async function userRoutes(fastify: FastifyInstance) {
  // Register multipart plugin
  await fastify.register(fastifyMultipart);

  fastify.get('/stats', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const users = db.readUsers();
    return reply.send({ totalUsers: Object.keys(users).length });
  });

  fastify.get<{ Params: UsernameParams }>(
    '/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      const user = db.getUser(req.params.username);
      
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      
      if (req.session.user.username !== req.params.username) {
        const { email, ...userWithoutEmail } = user;
        return reply.send({ user: userWithoutEmail });
      }
      
      return reply.send({ user });
    }
  );

  fastify.put<{ Params: UsernameParams }>(
    '/:username',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      if (!req.body || typeof req.body !== 'object') {
        return reply.status(400).send({ error: 'Invalid request body' });
      }
      
      if (Object.keys(req.body).length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }
      
      const sanitizedBody: any = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (typeof value === 'string') {
          const cleaned = sanitizeHtml(value, {
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
          
          if (safe.length > 5000) {
            return reply.status(400).send({ 
              error: `Field '${key}' exceeds maximum length of 5000 characters` 
            });
          }
          
          sanitizedBody[key] = safe;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          sanitizedBody[key] = value;
        } else if (value === null) {
          sanitizedBody[key] = null;
        } else {
          return reply.status(400).send({ 
            error: `Field '${key}' has invalid type` 
          });
        }
      }
      
      const result = db.updateUser(req.params.username, sanitizedBody);
      
      if (result.error) {
        return reply.status(400).send(result);
      }
      
      req.session.user = result.user;
      
      console.log(`[USER] Profile updated: ${req.params.username}`);
      return reply.send(result);
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/:username/pfp',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const data = await req.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      
      const filename = await saveUploadedFile(data, 'pfp');
      const pfpPath = '/uploads/' + filename;
      
      db.updateUser(req.params.username, { pfp: pfpPath });
      req.session.user.pfp = pfpPath;
      
      console.log(`[USER] Profile picture updated: ${req.params.username}`);
      return reply.send({ success: true, pfp: pfpPath });
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/:username/banner',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const data = await req.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      
      const filename = await saveUploadedFile(data, 'banner');
      const bannerPath = '/uploads/' + filename;
      
      db.updateUser(req.params.username, { banner: bannerPath });
      req.session.user.banner = bannerPath;
      
      console.log(`[USER] Banner updated: ${req.params.username}`);
      return reply.send({ success: true, banner: bannerPath });
    }
  );

  fastify.get('/preferences', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const prefs = db.getUserPreferences(req.session.user.username);
    return reply.send({ preferences: prefs });
  });

  fastify.put('/preferences', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const prefs = db.updateUserPreferences(req.session.user.username, req.body);
    console.log(`[USER] Preferences updated: ${req.session.user.username}`);
    return reply.send({ preferences: prefs });
  });

  fastify.get<{ Params: UsernameParams }>(
    '/:username/preferences',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const prefs = db.getUserPreferences(req.params.username);
      return reply.send({ preferences: prefs });
    }
  );

  fastify.put<{ Params: UsernameParams }>(
    '/:username/preferences',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const prefs = db.updateUserPreferences(req.params.username, req.body);
      console.log(`[USER] Preferences updated: ${req.params.username}`);
      return reply.send({ preferences: prefs });
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/:username/achievements',
    { preHandler: requireAuth },
    async (req, reply) => {
      const achievements = db.getAchievements(req.params.username);
      return reply.send({ achievements });
    }
  );

  fastify.get('/bookmarks', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const bookmarks = db.getBookmarks(req.session.user.username);
    const posts = db.readPosts();
    
    const bookmarkedPosts = bookmarks
      .map((id: string) => posts.find((p: any) => p.id === id))
      .filter((p: any) => p !== undefined);
    
    return reply.send({ bookmarks: bookmarkedPosts });
  });

  fastify.get<{ Params: UsernameParams }>(
    '/:username/bookmarks',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const bookmarks = db.getBookmarks(req.params.username);
      const posts = db.readPosts();
      
      const bookmarkedPosts = bookmarks
        .map((id: string) => posts.find((p: any) => p.id === id))
        .filter((p: any) => p !== undefined);
      
      return reply.send({ bookmarks: bookmarkedPosts });
    }
  );

  fastify.get('/drafts', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const drafts = db.getDrafts(req.session.user.username);
    return reply.send({ drafts });
  });

  fastify.post('/drafts', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const result = db.saveDraft(req.session.user.username, req.body);
    return reply.send(result);
  });

  fastify.delete<{ Params: { draftId: string } }>(
    '/drafts/:draftId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.deleteDraft(req.session.user.username, req.params.draftId);
      return reply.send(result);
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/:username/drafts',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const drafts = db.getDrafts(req.params.username);
      return reply.send({ drafts });
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/:username/drafts',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const result = db.saveDraft(req.params.username, req.body);
      return reply.send(result);
    }
  );

  fastify.delete<{ Params: DraftParams }>(
    '/:username/drafts/:draftId',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const result = db.deleteDraft(req.params.username, req.params.draftId);
      return reply.send(result);
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/:username/block',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.blockUser(req.session.user.username, req.params.username);
      console.log(`[USER] ${req.session.user.username} blocked ${req.params.username}`);
      return reply.send(result);
    }
  );

  fastify.delete<{ Params: UsernameParams }>(
    '/:username/block',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.unblockUser(req.session.user.username, req.params.username);
      console.log(`[USER] ${req.session.user.username} unblocked ${req.params.username}`);
      return reply.send(result);
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/:username/blocked',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const blocked = db.getBlockedUsers(req.params.username);
      return reply.send({ blocked });
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/:username/invites',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (req.params.username !== req.session.user.username) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      
      const keys = db.getInviteKeys(req.params.username);
      return reply.send({ keys });
    }
  );

  fastify.get<{ Params: LeaderboardParams }>(
    '/leaderboard/:type',
    { preHandler: requireAuth },
    async (req, reply) => {
      const validTypes = ['xp', 'reputation', 'posts', 'streak'];
      
      if (!validTypes.includes(req.params.type)) {
        return reply.status(400).send({ error: 'Invalid leaderboard type' });
      }
      
      const leaderboard = db.getLeaderboard(req.params.type, 10);
      return reply.send({ leaderboard });
    }
  );
}