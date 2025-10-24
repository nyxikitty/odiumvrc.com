import { FastifySessionOptions } from '@fastify/session';

export const sessionOptions: FastifySessionOptions = {
  secret: process.env.SESSION_SECRET,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  },
  saveUninitialized: false,
  cookieName: 'odium.sid'
};