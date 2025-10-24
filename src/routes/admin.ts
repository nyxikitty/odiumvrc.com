import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import { requireAuth, requireAdmin } from '../middleware/auth';

const db = new Database();

interface UsernameParams {
  username: string;
}

interface PostIdParams {
  postId: string;
}

interface ReportIdParams {
  reportId: string;
}

interface BanBody {
  reason?: string;
  duration?: number;
}

interface RoleBody {
  role: string;
}

interface ResolveReportBody {
  action: string;
}

interface WarningBody {
  reason: string;
}

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post('/generate-invite', { preHandler: [requireAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
    const allowedIp = '50.91.36.32';
    
    const normalizedIp = clientIp.replace('::ffff:', '');
    
    console.log(`[INVITE] Generation attempt from IP: ${normalizedIp}`);
    
    if (normalizedIp !== allowedIp) {
      console.log(`[INVITE] DENIED - IP ${normalizedIp} not authorized`);
      return reply.status(403).send({ 
        error: 'Invite key generation is restricted to authorized IP addresses only' 
      });
    }
    
    const result = db.generateInviteKey(req.session.user.username);
    console.log(`[INVITE] Generated key: ${result.key} by ${req.session.user.username}`);
    return reply.send(result);
  });

  fastify.get('/invites', { preHandler: [requireAuth, requireAdmin] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const keys = db.getInviteKeys();
    return reply.send({ keys });
  });

  fastify.post<{ Params: UsernameParams; Body: BanBody }>(
    '/ban/:username',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const { reason, duration } = req.body;
      
      const result = db.banUser(
        req.params.username,
        reason || 'No reason provided',
        req.session.user.username,
        req.session.user.role,
        duration
      );
      
      if (result.error) {
        return reply.status(403).send(result);
      }
      
      return reply.send(result);
    }
  );

  fastify.post<{ Params: UsernameParams }>(
    '/unban/:username',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const result = db.unbanUser(req.params.username);
      return reply.send(result);
    }
  );

  fastify.post<{ Params: UsernameParams; Body: RoleBody }>(
    '/role/:username',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const { role } = req.body;
      
      if (!['user', 'admin', 'owner'].includes(role)) {
        return reply.status(400).send({ error: 'Invalid role' });
      }
      
      const result = db.updateUserRole(
        req.params.username, 
        role, 
        req.session.user.role
      );
      
      if (result.error) {
        return reply.status(403).send(result);
      }
      
      return reply.send(result);
    }
  );

  fastify.post<{ Params: PostIdParams }>(
    '/pin/:postId',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const result = db.pinPost(req.params.postId, req.session.user.username);
      return reply.send(result);
    }
  );

  fastify.get<{ Querystring: { status?: string } }>(
    '/reports',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const reports = db.getReports(req.query.status);
      return reply.send({ reports });
    }
  );

  fastify.post<{ Params: ReportIdParams; Body: ResolveReportBody }>(
    '/reports/:reportId/resolve',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const result = db.resolveReport(
        req.params.reportId, 
        req.session.user.username, 
        req.body.action
      );
      return reply.send(result);
    }
  );

  fastify.post<{ Params: UsernameParams; Body: WarningBody }>(
    '/warnings/:username',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const result = db.addWarning(
        req.params.username, 
        req.body.reason, 
        req.session.user.username
      );
      return reply.send(result);
    }
  );

  fastify.get<{ Params: UsernameParams }>(
    '/warnings/:username',
    { preHandler: [requireAuth, requireAdmin] },
    async (req, reply) => {
      const warnings = db.getWarnings(req.params.username);
      return reply.send({ warnings });
    }
  );
}