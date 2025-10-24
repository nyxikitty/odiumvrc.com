import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Database from '../models/Database';
import { requireAuth } from '../middleware/auth';
import rateLimit from '../middleware/rateLimit';
import { saveUploadedFile } from "../config/multipart";
import sanitizeHtml from 'sanitize-html';

const db = new Database();

interface PostIdParams {
  id: string;
}

interface ReplyIdParams {
  id: string;
  replyId: string;
}

interface GetPostsQuery {
  category?: string;
  community?: string;
  sort?: string;
  timeRange?: string;
}

interface SearchQuery {
  q?: string;
  community?: string;
  category?: string;
  author?: string;
}

interface CreatePostBody {
  title: string;
  content: string;
  category: string;
  nsfw?: string;
  community?: string;
  tags?: string;
}

interface VoteBody {
  voteType: string;
}

interface ReplyBody {
  content: string;
}

interface AwardBody {
  type: string;
}

interface ReportBody {
  reason: string;
  category: string;
}

// Sanitization helper function
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

export default async function postRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: GetPostsQuery }>(
    '/',
    { preHandler: requireAuth },
    async (req, reply) => {
      const posts = db.getPosts(
        req.query.category,
        req.query.community,
        req.query.sort || 'new',
        req.query.timeRange || 'all',
        req.session.user.username
      );
      
      return reply.send({ posts });
    }
  );

  fastify.get<{ Querystring: SearchQuery }>(
    '/search',
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.query.q) {
        return reply.status(400).send({ error: 'Search query required' });
      }
      
      // Sanitize search query
      const sanitizedQuery = sanitizeInput(req.query.q, 200);
      
      const results = db.searchPosts(sanitizedQuery, {
        community: req.query.community ? sanitizeInput(req.query.community, 100) : undefined,
        category: req.query.category ? sanitizeInput(req.query.category, 100) : undefined,
        author: req.query.author ? sanitizeInput(req.query.author, 100) : undefined
      });
      
      return reply.send({ results });
    }
  );

  fastify.get<{ Params: PostIdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const post = db.getPost(req.params.id);
      
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      
      db.incrementPostViews(req.params.id);
      
      return reply.send({ post });
    }
  );

  fastify.post(
    '/',
    { preHandler: [requireAuth, rateLimit(5 * 60 * 1000, 5, 'user')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await req.file();
        const body = req.body as any;
        
        const { title, content, category, nsfw, community, tags } = body;
        
        if (!title || !content || !category) {
          return reply.status(400).send({ error: 'Title, content, and category required' });
        }

        // Sanitize inputs
        const sanitizedTitle = sanitizeInput(title, 300);
        const sanitizedContent = sanitizeInput(content, 10000);
        const sanitizedCategory = sanitizeInput(category, 50);
        const sanitizedCommunity = community ? sanitizeInput(community, 100) : null;

        if (!sanitizedTitle || !sanitizedContent || !sanitizedCategory) {
          return reply.status(400).send({ error: 'Title, content, and category cannot be empty' });
        }

        let imageUrl = null;
        if (data) {
          const filename = await saveUploadedFile(data, 'postImage');
          imageUrl = '/uploads/' + filename;
        }

        // Sanitize and validate tags
        let parsedTags: string[] = [];
        if (tags) {
          try {
            const rawTags = JSON.parse(tags);
            if (Array.isArray(rawTags)) {
              parsedTags = rawTags
                .slice(0, 10) // Max 10 tags
                .map(tag => sanitizeInput(String(tag), 50))
                .filter(tag => tag.length > 0);
            }
          } catch (e) {
            return reply.status(400).send({ error: 'Invalid tags format' });
          }
        }
        
        const result = db.createPost(
          req.session.user.username,
          sanitizedTitle,
          sanitizedContent,
          sanitizedCategory,
          imageUrl,
          nsfw === 'true',
          sanitizedCommunity,
          parsedTags
        );
        
        if (result.error) {
          return reply.status(400).send(result);
        }
        
        console.log(`[POST] Created by ${req.session.user.username}: ${sanitizedTitle}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.put<{ Params: PostIdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        if (!req.body || typeof req.body !== 'object') {
          return reply.status(400).send({ error: 'Invalid request body' });
        }

        // Sanitize body fields
        const sanitizedBody: any = {};
        for (const [key, value] of Object.entries(req.body)) {
          if (typeof value === 'string') {
            const maxLength = key === 'content' ? 10000 : key === 'title' ? 300 : 500;
            sanitizedBody[key] = sanitizeInput(value, maxLength);
          } else if (typeof value === 'boolean') {
            sanitizedBody[key] = value;
          }
        }

        const isAdmin = ['admin', 'owner'].includes(req.session.user.role);
        const result = db.editPost(req.params.id, req.session.user.username, sanitizedBody, isAdmin);
        
        if (result.error) {
          return reply.status(400).send(result);
        }
        
        console.log(`[POST] Edited: ${req.params.id} by ${req.session.user.username}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.delete<{ Params: PostIdParams }>(
    '/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const isAdmin = ['admin', 'owner'].includes(req.session.user.role);
      const result = db.deletePost(req.params.id, req.session.user.username, isAdmin);
      
      if (result.error) {
        return reply.status(400).send(result);
      }
      
      console.log(`[POST] Deleted: ${req.params.id} by ${req.session.user.username}`);
      return reply.send(result);
    }
  );

  fastify.post<{ Params: PostIdParams; Body: VoteBody }>(
    '/:id/vote',
    { preHandler: requireAuth },
    async (req, reply) => {
      const { voteType } = req.body;
      
      if (!['upvote', 'downvote', 'remove'].includes(voteType)) {
        return reply.status(400).send({ error: 'Invalid vote type' });
      }
      
      const result = db.votePost(req.params.id, req.session.user.username, voteType);
      
      if (result.error) {
        return reply.status(404).send(result);
      }
      
      return reply.send(result);
    }
  );

  fastify.post<{ Params: PostIdParams; Body: ReplyBody }>(
    '/:id/replies',
    { preHandler: [requireAuth, rateLimit(2 * 60 * 1000, 10, 'user')] },
    async (req, reply) => {
      try {
        const { content } = req.body;
        
        if (!content || !content.trim()) {
          return reply.status(400).send({ error: 'Content required' });
        }
        
        // Sanitize reply content
        const sanitizedContent = sanitizeInput(content, 5000);
        
        if (!sanitizedContent) {
          return reply.status(400).send({ error: 'Content cannot be empty' });
        }
        
        const result = db.addReply(req.params.id, req.session.user.username, sanitizedContent);
        
        if (result.error) {
          return reply.status(400).send(result);
        }
        
        console.log(`[REPLY] Added to post ${req.params.id} by ${req.session.user.username}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.delete<{ Params: ReplyIdParams }>(
    '/:id/replies/:replyId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const isAdmin = ['admin', 'owner'].includes(req.session.user.role);
      const result = db.deleteReply(req.params.id, req.params.replyId, req.session.user.username, isAdmin);
      
      if (result.error) {
        return reply.status(400).send(result);
      }
      
      console.log(`[REPLY] Deleted: ${req.params.replyId} from post ${req.params.id}`);
      return reply.send(result);
    }
  );

  fastify.post<{ Params: PostIdParams; Body: AwardBody }>(
    '/:id/award',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const { type } = req.body;
        
        if (!type) {
          return reply.status(400).send({ error: 'Award type required' });
        }
        
        // Sanitize award type
        const sanitizedType = sanitizeInput(type, 50);
        
        const result = db.givePostAward(req.params.id, sanitizedType, req.session.user.username);
        
        if (result.error) {
          return reply.status(404).send(result);
        }
        
        console.log(`[AWARD] ${sanitizedType} given to post ${req.params.id} by ${req.session.user.username}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.post<{ Params: PostIdParams; Body: ReportBody }>(
    '/:id/report',
    { preHandler: requireAuth },
    async (req, reply) => {
      try {
        const { reason, category } = req.body;
        
        if (!reason || !category) {
          return reply.status(400).send({ error: 'Reason and category required' });
        }
        
        // Sanitize report inputs
        const sanitizedReason = sanitizeInput(reason, 1000);
        const sanitizedCategory = sanitizeInput(category, 100);
        
        if (!sanitizedReason || !sanitizedCategory) {
          return reply.status(400).send({ error: 'Reason and category cannot be empty' });
        }
        
        const result = db.createReport(
          req.session.user.username,
          'post',
          req.params.id,
          sanitizedReason,
          sanitizedCategory
        );
        
        console.log(`[REPORT] Post ${req.params.id} reported by ${req.session.user.username}`);
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({ error: error.message || 'Invalid input' });
      }
    }
  );

  fastify.post<{ Params: PostIdParams }>(
    '/:id/bookmark',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.bookmarkPost(req.session.user.username, req.params.id);
      return reply.send(result);
    }
  );

  fastify.delete<{ Params: PostIdParams }>(
    '/:id/bookmark',
    { preHandler: requireAuth },
    async (req, reply) => {
      const result = db.unbookmarkPost(req.session.user.username, req.params.id);
      return reply.send(result);
    }
  );
}