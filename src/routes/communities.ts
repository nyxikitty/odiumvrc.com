import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import { requireAuth } from '../middleware/auth';
import rateLimit from '../middleware/rateLimit';
import sanitizeHtml from 'sanitize-html';

const db = new Database();

interface CommunityIdParams {
  communityId: string;
}

interface CreateCommunityBody {
  name: string;
  description: string;
  categories?: string[];
  isPrivate?: boolean;
}

interface AddModeratorBody {
  username: string;
}

interface UpdateRulesBody {
  rules: any[];
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

export default async function communityRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const communities = db.getCommunities();
    return reply.send({ communities });
  });

  fastify.get<{ Params: CommunityIdParams }>(
    '/:communityId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const community = db.getCommunity(req.params.communityId);
      
      if (!community) {
        return reply.status(404).send({ error: 'Community not found' });
      }
      
      return reply.send({ community });
    }
  );

  fastify.post<{ Body: CreateCommunityBody }>(
    '/',
    { preHandler: [requireAuth, rateLimit(10 * 60 * 1000, 3, 'user')] },
    async (req, reply) => {
      try {
        const { name, description, categories, isPrivate } = req.body;
        
        if (!name || !description) {
          return reply.status(400).send({ error: 'Name and description required' });
        }
        
        const sanitizedName = sanitizeInput(name, 100);
        const sanitizedDescription = sanitizeInput(description, 500);
        
        if (!sanitizedName || !sanitizedDescription) {
          return reply.status(400).send({ error: 'Name and description cannot be empty' });
        }
        
        let sanitizedCategories: string[] = [];
        if (categories && Array.isArray(categories)) {
          sanitizedCategories = categories
            .slice(0, 20)
            .map(cat => sanitizeInput(String(cat), 50))
            .filter(cat => cat.length > 0);
        }
        
        const result = db.createCommunity(
          sanitizedName, 
          sanitizedDescription, 
          req.session.user.username, 
          sanitizedCategories, 
          isPrivate || false
        );
        
        if (result.error) {
          return reply.status(400).send(result);
        }
        
        console.log(`[COMMUNITY] Created: ${sanitizedName} by ${req.session.user.username}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.post<{ Params: CommunityIdParams; Body: AddModeratorBody }>(
    '/:communityId/moderators',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const { username } = req.body;
        
        if (!username) {
          return reply.status(400).send({ error: 'Username required' });
        }
        
        const sanitizedUsername = sanitizeInput(username, 50);
        
        if (!sanitizedUsername) {
          return reply.status(400).send({ error: 'Invalid username' });
        }
        
        const result = db.addCommunityModerator(
          req.params.communityId, 
          sanitizedUsername, 
          req.session.user.username
        );
        
        if (result.error) {
          return reply.status(403).send(result);
        }
        
        console.log(`[COMMUNITY] ${sanitizedUsername} added as moderator of ${req.params.communityId}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.put<{ Params: CommunityIdParams; Body: UpdateRulesBody }>(
    '/:communityId/rules',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const { rules } = req.body;
        
        if (!rules || !Array.isArray(rules)) {
          return reply.status(400).send({ error: 'Rules must be an array' });
        }
        
        const sanitizedRules = rules.slice(0, 50).map(rule => {
          if (typeof rule === 'object' && rule !== null) {
            const sanitizedRule: any = {};
            
            if (rule.title) {
              sanitizedRule.title = sanitizeInput(String(rule.title), 200);
            }
            if (rule.description) {
              sanitizedRule.description = sanitizeInput(String(rule.description), 1000);
            }
            
            // Preserve other safe properties
            Object.keys(rule).forEach(key => {
              if (!['title', 'description'].includes(key)) {
                const value = rule[key];
                if (typeof value === 'string') {
                  sanitizedRule[key] = sanitizeInput(value, 500);
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                  sanitizedRule[key] = value;
                }
              }
            });
            
            return sanitizedRule;
          } else if (typeof rule === 'string') {
            return sanitizeInput(rule, 500);
          }
          return null;
        }).filter(rule => rule !== null);
        
        const result = db.updateCommunityRules(
          req.params.communityId, 
          sanitizedRules, 
          req.session.user.username
        );
        
        if (result.error) {
          return reply.status(403).send(result);
        }
        
        console.log(`[COMMUNITY] Rules updated for ${req.params.communityId}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );
}