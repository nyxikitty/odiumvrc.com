import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export const multipartOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
};

export async function saveUploadedFile(file: MultipartFile, fieldname: string): Promise<string> {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.filename).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (!extname || !mimetype) {
    throw new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed');
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  
  let prefix = 'upload-';
  if (fieldname === 'postImage') {
    prefix = 'post-';
  } else if (fieldname === 'banner') {
    prefix = 'banner-';
  } else if (fieldname === 'pfp') {
    prefix = 'pfp-';
  }
  
  const filename = prefix + uniqueSuffix + path.extname(file.filename);
  const filepath = path.join('./public/uploads/', filename);
  
  await pipeline(file.file, fs.createWriteStream(filepath));
  
  return filename;
}

export default {
  multipartOptions,
  saveUploadedFile
};