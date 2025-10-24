import { FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';

const db = new Database();

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.user) {
    return reply.redirect('/login');
  }
  
  if (db.isBanned(req.session.user.username)) {
    req.session.destroy();
    return reply.status(403).send({ error: 'You are banned' });
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.user || !['admin', 'owner'].includes(req.session.user.role)) {
    return reply.status(403).send({ error: 'Admin access required' });
  }
}