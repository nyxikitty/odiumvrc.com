import nodemailer from 'nodemailer';

const emailConfig = {
  host: process.env.NM_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.NM_USER,
    pass: process.env.NM_PASS,
  },
};

const transporter = nodemailer.createTransport(emailConfig);

transporter.verify((error: Error | null, success: boolean) => {
  if (error) {
    console.error('[EMAIL] Configuration error:', error);
  } else {
    console.log('[EMAIL] Server is ready to send emails');
  }
});

export default transporter;