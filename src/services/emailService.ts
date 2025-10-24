import transporter from '../config/email';
import Database from '../models/Database';

const db = new Database();

function createVerificationEmail(username: string, code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; }
    .container { max-width: 600px; margin: 60px auto; background: linear-gradient(135deg, #1a1a2e 0%, #16161f 100%); border: 1px solid rgba(233, 31, 66, 0.3); border-radius: 16px; overflow: hidden; }
    .header { padding: 40px 40px 20px; text-align: center; background: linear-gradient(180deg, rgba(233, 31, 66, 0.05) 0%, transparent 100%); }
    .brand { font-size: 48px; font-weight: 900; letter-spacing: 0.15em; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px; }
    .content { padding: 20px 40px 40px; text-align: center; }
    .title { font-size: 24px; color: #ffffff; font-weight: 600; margin-bottom: 12px; }
    .subtitle { font-size: 16px; color: #999; margin-bottom: 32px; }
    .code-box { background: rgba(233, 31, 66, 0.08); border: 2px dashed rgba(233, 31, 66, 0.4); border-radius: 12px; padding: 24px; margin: 24px 0; }
    .code { font-size: 44px; font-weight: 700; color: #e91f42; letter-spacing: 0.3em; font-family: 'Courier New', monospace; }
    .expiry { color: #ffb366; font-size: 14px; margin-top: 24px; }
    .footer { padding: 24px 40px; background: rgba(0, 0, 0, 0.3); text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">ODIUM</div>
    </div>
    <div class="content">
      <div class="title">Welcome, ${username}!</div>
      <div class="subtitle">Enter this code to verify your account</div>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <div class="expiry">⏱ Code expires in 10 minutes</div>
    </div>
    <div class="footer">
      Odium Collective · Elite Community
    </div>
  </div>
</body>
</html>`;
}

async function sendVerificationEmail(email: string, username: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    await transporter.sendMail({
      from: '"Odium Collective" <email-verification@snoofz.net>',
      to: email,
      subject: 'Verify Your Odium Account',
      html: createVerificationEmail(username, code)
    });
    
    console.log(`[EMAIL] Verification code sent to ${email}`);
    return { success: true };
  } catch (error: any) {
    console.error('[EMAIL] Failed to send verification:', error);
    return { success: false, error: error.message };
  }
}

async function sendReplyNotification(
  postAuthor: string,
  replier: string,
  postTitle: string,
  replyContent: string,
  postId: string
): Promise<void> {
  const user = db.getUser(postAuthor);
  if (!user || !user.email) return;
  
  const prefs = db.getUserPreferences(postAuthor);
  if (!prefs.emailNotifications || !prefs.emailOnReply) return;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; }
    .container { max-width: 600px; margin: 60px auto; background: linear-gradient(135deg, #1a1a2e 0%, #16161f 100%); border: 1px solid rgba(233, 31, 66, 0.3); border-radius: 16px; overflow: hidden; }
    .header { padding: 40px 40px 20px; text-align: center; background: linear-gradient(180deg, rgba(233, 31, 66, 0.05) 0%, transparent 100%); }
    .brand { font-size: 32px; font-weight: 900; letter-spacing: 0.15em; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 16px; }
    .content { padding: 20px 40px 40px; }
    .title { font-size: 22px; color: #ffffff; font-weight: 600; margin-bottom: 16px; }
    .description { font-size: 15px; color: #999; margin-bottom: 24px; line-height: 1.5; }
    .post-title { color: #ff6b8a; font-weight: 600; }
    .reply-box { background: rgba(233, 31, 66, 0.08); border-left: 3px solid #e91f42; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .reply-author { color: #ff6b8a; font-weight: 600; font-size: 14px; margin-bottom: 12px; }
    .reply-text { color: #ccc; font-size: 15px; line-height: 1.6; }
    .button-wrapper { text-align: center; margin: 32px 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(233, 31, 66, 0.3); }
    .footer { padding: 24px 40px; background: rgba(0, 0, 0, 0.3); text-align: center; color: #666; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">ODIUM</div>
    </div>
    <div class="content">
      <div class="title">💬 New Reply on Your Post</div>
      <div class="description">
        <strong style="color: #ff6b8a;">${replier}</strong> replied to your post "<span class="post-title">${postTitle}</span>"
      </div>
      <div class="reply-box">
        <div class="reply-author">${replier} wrote:</div>
        <div class="reply-text">${replyContent.substring(0, 200)}${replyContent.length > 200 ? '...' : ''}</div>
      </div>
      <div class="button-wrapper">
        <a href="https://odiumvrc.com/forum?post=${postId}" class="button">View Reply</a>
      </div>
    </div>
    <div class="footer">
      You're receiving this because you have email notifications enabled<br>
      Update your preferences in account settings
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: '"Odium Collective" <email-verification@snoofz.net>',
      to: user.email,
      subject: `${replier} replied to your post`,
      html: emailHtml
    });
    console.log(`[EMAIL] Reply notification sent to ${postAuthor}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send reply notification:', error);
  }
}

async function sendTrendingDigest(): Promise<void> {
  const users = db.readUsers();
  const posts = db.readPosts();
  
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const trendingPosts = posts
    .filter((p: any) => new Date(p.timestamp) > yesterday)
    .sort((a: any, b: any) => (b.upvotes - b.downvotes + b.replies.length * 2) - (a.upvotes - a.downvotes + a.replies.length * 2))
    .slice(0, 5);

  if (trendingPosts.length === 0) return;

  for (const username in users) {
    const user = users[username];
    const prefs = db.getUserPreferences(username);
    
    if (!prefs.emailNotifications || !prefs.emailTrendingDigest || !user.email) continue;

    const postsHtml = trendingPosts.map((p: any) => `
      <div style="background: rgba(233, 31, 66, 0.08); border-left: 3px solid #e91f42; border-radius: 8px; padding: 20px; margin: 16px 0;">
        <div style="color: #ff6b8a; font-weight: 600; font-size: 16px; margin-bottom: 10px;">${p.title}</div>
        <div style="color: #ccc; font-size: 14px; line-height: 1.5; margin-bottom: 12px;">${p.content.substring(0, 150)}${p.content.length > 150 ? '...' : ''}</div>
        <div style="color: #666; font-size: 13px;">
          <span style="color: #e91f42; font-weight: 600;">${p.upvotes - p.downvotes}</span> points · 
          <span style="color: #ff6b8a; font-weight: 600;">${p.replies.length}</span> replies · 
          by <span style="color: #999;">${p.author}</span>
        </div>
      </div>
    `).join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; }
    .container { max-width: 600px; margin: 60px auto; background: linear-gradient(135deg, #1a1a2e 0%, #16161f 100%); border: 1px solid rgba(233, 31, 66, 0.3); border-radius: 16px; overflow: hidden; }
    .header { padding: 40px 40px 20px; text-align: center; background: linear-gradient(180deg, rgba(233, 31, 66, 0.05) 0%, transparent 100%); }
    .brand { font-size: 32px; font-weight: 900; letter-spacing: 0.15em; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 16px; }
    .content { padding: 20px 40px 40px; }
    .title { font-size: 22px; color: #ffffff; font-weight: 600; margin-bottom: 8px; }
    .subtitle { font-size: 15px; color: #999; margin-bottom: 28px; }
    .button-wrapper { text-align: center; margin: 32px 0 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(233, 31, 66, 0.3); }
    .footer { padding: 24px 40px; background: rgba(0, 0, 0, 0.3); text-align: center; color: #666; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">ODIUM</div>
    </div>
    <div class="content">
      <div class="title">🔥 Today's Trending Posts</div>
      <div class="subtitle">Check out what's hot in the collective</div>
      ${postsHtml}
      <div class="button-wrapper">
        <a href="https://odiumvrc.com/forum" class="button">Browse All Posts</a>
      </div>
    </div>
    <div class="footer">
      Daily trending digest · Odium Collective<br>
      Update your email preferences in account settings
    </div>
  </div>
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: '"Odium Collective" <email-verification@snoofz.net>',
        to: user.email,
        subject: 'Today\'s Trending Posts on Odium',
        html: emailHtml
      });
      console.log(`[EMAIL] Trending digest sent to ${username}`);
    } catch (error) {
      console.error(`[EMAIL] Failed to send digest to ${username}:`, error);
    }
  }
}

async function sendWeeklySummary(): Promise<void> {
  const users = db.readUsers();
  const posts = db.readPosts();
  
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekPosts = posts.filter((p: any) => new Date(p.timestamp) > weekAgo);
  
  const totalPosts = weekPosts.length;
  const totalReplies = weekPosts.reduce((sum: number, p: any) => sum + p.replies.length, 0);
  const topPost = weekPosts.sort((a: any, b: any) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes))[0];

  for (const username in users) {
    const user = users[username];
    const prefs = db.getUserPreferences(username);
    
    if (!prefs.emailNotifications || !prefs.emailWeeklySummary || !user.email) continue;

    const userPosts = weekPosts.filter((p: any) => p.author === username);
    const userReplies = weekPosts.reduce((sum: number, p: any) => 
      sum + p.replies.filter((r: any) => r.author === username).length, 0);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; }
    .container { max-width: 600px; margin: 60px auto; background: linear-gradient(135deg, #1a1a2e 0%, #16161f 100%); border: 1px solid rgba(233, 31, 66, 0.3); border-radius: 16px; overflow: hidden; }
    .header { padding: 40px 40px 20px; text-align: center; background: linear-gradient(180deg, rgba(233, 31, 66, 0.05) 0%, transparent 100%); }
    .brand { font-size: 32px; font-weight: 900; letter-spacing: 0.15em; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 16px; }
    .content { padding: 20px 40px 40px; }
    .title { font-size: 22px; color: #ffffff; font-weight: 600; margin-bottom: 8px; }
    .subtitle { font-size: 15px; color: #999; margin-bottom: 32px; }
    .section-title { font-size: 16px; color: #ff6b8a; font-weight: 600; margin: 28px 0 16px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .stat-box { background: rgba(233, 31, 66, 0.08); border-radius: 10px; padding: 24px; text-align: center; }
    .stat-number { font-size: 36px; font-weight: 700; color: #e91f42; margin-bottom: 8px; }
    .stat-label { color: #999; font-size: 13px; font-weight: 500; }
    .top-post { background: rgba(233, 31, 66, 0.08); border-left: 3px solid #e91f42; border-radius: 8px; padding: 20px; margin: 16px 0; }
    .post-title { color: #ff6b8a; font-weight: 600; font-size: 16px; margin-bottom: 10px; }
    .post-content { color: #ccc; font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
    .post-meta { color: #666; font-size: 13px; }
    .button-wrapper { text-align: center; margin: 32px 0 16px; }
    .button { display: inline-block; background: linear-gradient(135deg, #e91f42 0%, #ff6b8a 100%); color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(233, 31, 66, 0.3); }
    .footer { padding: 24px 40px; background: rgba(0, 0, 0, 0.3); text-align: center; color: #666; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">ODIUM</div>
    </div>
    <div class="content">
      <div class="title">📊 Your Weekly Summary</div>
      <div class="subtitle">Here's what happened this week on Odium</div>
      
      <div class="section-title">Community Stats</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-number">${totalPosts}</div>
          <div class="stat-label">New Posts</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${totalReplies}</div>
          <div class="stat-label">Total Replies</div>
        </div>
      </div>

      <div class="section-title">Your Activity</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-number">${userPosts.length}</div>
          <div class="stat-label">Posts Created</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${userReplies}</div>
          <div class="stat-label">Replies Made</div>
        </div>
      </div>

      ${topPost ? `
      <div class="section-title">Top Post This Week</div>
      <div class="top-post">
        <div class="post-title">${topPost.title}</div>
        <div class="post-content">${topPost.content.substring(0, 100)}${topPost.content.length > 100 ? '...' : ''}</div>
        <div class="post-meta">
          <span style="color: #e91f42; font-weight: 600;">${topPost.upvotes - topPost.downvotes}</span> points · 
          by <span style="color: #999;">${topPost.author}</span>
        </div>
      </div>
      ` : ''}

      <div class="button-wrapper">
        <a href="https://odiumvrc.com/forum" class="button">Visit Odium</a>
      </div>
    </div>
    <div class="footer">
      Weekly summary · Odium Collective<br>
      Update your email preferences in account settings
    </div>
  </div>
</body>
</html>`;

    try {
      await transporter.sendMail({
        from: '"Odium Collective" <email-verification@snoofz.net>',
        to: user.email,
        subject: 'Your Weekly Odium Summary',
        html: emailHtml
      });
      console.log(`[EMAIL] Weekly summary sent to ${username}`);
    } catch (error) {
      console.error(`[EMAIL] Failed to send summary to ${username}:`, error);
    }
  }
}

export function initEmailSchedulers(): void {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      console.log('[EMAIL] Sending daily trending digest...');
      sendTrendingDigest();
    }
  }, 60000);

  setInterval(() => {
    const now = new Date();
    if (now.getDay() === 0 && now.getHours() === 10 && now.getMinutes() === 0) {
      console.log('[EMAIL] Sending weekly summary...');
      sendWeeklySummary();
    }
  }, 60000);

  console.log('[EMAIL] Schedulers initialized');
}

export default {
  sendVerificationEmail,
  sendReplyNotification,
  sendTrendingDigest,
  sendWeeklySummary,
  initEmailSchedulers
};