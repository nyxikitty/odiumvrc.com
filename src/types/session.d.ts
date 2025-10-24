import 'fastify';
import '@fastify/session';

declare module 'fastify' {
  interface Session {
    user: {
      username: string;
      role: string;
      pfp?: string;
      banner?: string;
      [key: string]: any;
    };
    verificationCode?: string;
    verificationEmail?: string;
    verificationUsername?: string;
    verificationCodeExpiry?: number;
  }
}

declare module '@fastify/session' {
  interface SessionData {
    user: {
      username: string;
      role: string;
      pfp?: string;
      banner?: string;
      [key: string]: any;
    };
    verificationCode?: string;
    verificationEmail?: string;
    verificationUsername?: string;
    verificationCodeExpiry?: number;
  }
}