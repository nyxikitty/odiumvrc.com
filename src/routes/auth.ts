import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import emailService from '../services/emailService';

const db = new Database();

const pendingRegistrations: Record<string, any> = {};
const verificationCodes: Record<string, string> = {};

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface RegisterRequestBody {
  username: string;
  password: string;
  email: string;
  inviteKey: string;
}

interface VerifyBody {
  email: string;
  code: string;
}

interface LoginBody {
  username: string;
  password: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RegisterRequestBody }>(
    '/register/request',
    async (req, reply) => {
      const { username, password, email, inviteKey } = req.body;
      
      if (!username || !password || !email || !inviteKey) {
        return reply.status(400).send({ error: 'All fields including invite key are required' });
      }

      if (username.length < 3 || username.length > 20) {
        return reply.status(400).send({ error: 'Username must be 3-20 characters' });
      }

      if (password.length < 6) {
        return reply.status(400).send({ error: 'Password must be at least 6 characters' });
      }

      const users = db.readUsers();
      if (users[username]) {
        return reply.status(400).send({ error: 'Username already exists' });
      }

      const keyValidation = db.validateInviteKey(inviteKey);
      if (!keyValidation.valid) {
        return reply.status(400).send({ error: keyValidation.error });
      }

      const code = generateVerificationCode();
      
      pendingRegistrations[email] = { 
        username, 
        password, 
        email, 
        inviteKey,
        timestamp: Date.now() 
      };
      verificationCodes[email] = code;
      
      setTimeout(() => {
        delete pendingRegistrations[email];
        delete verificationCodes[email];
      }, 10 * 60 * 1000);
      
      try {
        await emailService.sendVerificationEmail(email, username, code);
        console.log(`[AUTH] Verification code sent to ${email}`);
        return reply.send({ success: true, message: 'Verification code sent' });
      } catch (error) {
        console.error('[AUTH] Failed to send verification email:', error);
        return reply.status(500).send({ error: 'Failed to send email' });
      }
    }
  );

  fastify.post<{ Body: VerifyBody }>(
    '/register/verify',
    async (req, reply) => {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return reply.status(400).send({ error: 'Email and code required' });
      }

      const storedCode = verificationCodes[email];
      const pendingReg = pendingRegistrations[email];
      
      if (!storedCode || !pendingReg) {
        return reply.status(400).send({ error: 'No pending registration or code expired' });
      }

      if (storedCode !== code) {
        return reply.status(400).send({ error: 'Invalid verification code' });
      }

      const keyValidation = db.validateInviteKey(pendingReg.inviteKey);
      if (!keyValidation.valid) {
        delete pendingRegistrations[email];
        delete verificationCodes[email];
        return reply.status(400).send({ error: 'Invite key is no longer valid' });
      }

      const result = db.createUser(pendingReg.username, pendingReg.password, pendingReg.email);
      if (result.error) {
        return reply.status(400).send(result);
      }

      db.useInviteKey(pendingReg.inviteKey, pendingReg.username);

      delete pendingRegistrations[email];
      delete verificationCodes[email];

      req.session.user = result.user;
      
      console.log(`[AUTH] User registered: ${pendingReg.username}`);
      return reply.send(result);
    }
  );

  fastify.post<{ Body: LoginBody }>(
    '/login',
    async (req, reply) => {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return reply.status(400).send({ error: 'All fields required' });
      }

      const result = db.authenticateUser(username, password);
      
      if (result.error) {
        console.log(`[AUTH] Failed login attempt for: ${username}`);
        return reply.status(401).send(result);
      }

      req.session.user = result.user;
      console.log(`[AUTH] User logged in: ${username}`);
      return reply.send(result);
    }
  );

  fastify.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const username = req.session.user?.username;
    
    req.session.destroy((err?: Error) => {
      if (err) {
        console.error('[AUTH] Logout error:', err);
        return reply.status(500).send({ error: 'Failed to logout' });
      }
      console.log(`[AUTH] User logged out: ${username}`);
      return reply.send({ success: true });
    });
  });

  fastify.get('/me', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.session.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return reply.send({ user: req.session.user });
  });
}