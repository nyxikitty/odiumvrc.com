import { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitData {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitData>();

type IdentifierType = 'global' | 'ip' | 'user';

function rateLimit(windowMs: number, maxRequests: number, identifier: IdentifierType = 'global') {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const key = identifier === 'ip' ? req.ip : 
                identifier === 'user' ? (req.session.user?.username || req.ip) :
                identifier;
    
    const now = Date.now();
    const userLimit = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };
    
    if (now > userLimit.resetTime) {
      userLimit.count = 0;
      userLimit.resetTime = now + windowMs;
    }
    
    userLimit.count++;
    rateLimitStore.set(key, userLimit);
    
    if (userLimit.count > maxRequests) {
      const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
      return reply.status(429).send({ 
        error: 'Too many requests. Please slow down.',
        retryAfter: retryAfter
      });
    }
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export default rateLimit;