import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dbConfig from '../config/database';

class Database {
  private dbPath: string;
  private usersFile: string;
  private postsFile: string;
  private bansFile: string;
  private communitiesFile: string;
  private reportsFile: string;
  private warningsFile: string;
  private draftsFile: string;
  private messagesFile: string;
  private achievementsFile: string;
  private preferencesFile: string;
  private bookmarksFile: string;
  private blocksFile: string;
  private inviteKeysFile: string;
  private uploadsPath: string;

  private usersCache: any = null;
  private postsCache: any = null;
  private cacheTimestamp: Record<string, number> = {};
  private CACHE_TTL = 5000;

  constructor() {
    this.dbPath = dbConfig.dbPath;
    this.usersFile = dbConfig.usersFile;
    this.postsFile = dbConfig.postsFile;
    this.bansFile = dbConfig.bansFile;
    this.communitiesFile = dbConfig.communitiesFile;
    this.reportsFile = dbConfig.reportsFile;
    this.warningsFile = dbConfig.warningsFile;
    this.draftsFile = dbConfig.draftsFile;
    this.messagesFile = dbConfig.messagesFile;
    this.achievementsFile = dbConfig.achievementsFile;
    this.preferencesFile = dbConfig.preferencesFile;
    this.bookmarksFile = dbConfig.bookmarksFile;
    this.blocksFile = dbConfig.blocksFile;
    this.inviteKeysFile = dbConfig.inviteKeysFile;
    this.uploadsPath = dbConfig.uploadsPath;
    this.init();
  }

  private init(): void {
    if (!fs.existsSync(this.dbPath)) fs.mkdirSync(this.dbPath, { recursive: true });
    if (!fs.existsSync(this.uploadsPath)) fs.mkdirSync(this.uploadsPath, { recursive: true });
    
    if (!fs.existsSync(this.usersFile)) this.writeUsers({});
    if (!fs.existsSync(this.postsFile)) this.writePosts([]);
    if (!fs.existsSync(this.bansFile)) this.writeBans({});
    if (!fs.existsSync(this.communitiesFile)) this.writeCommunities({});
    if (!fs.existsSync(this.reportsFile)) this.writeReports([]);
    if (!fs.existsSync(this.warningsFile)) this.writeWarnings({});
    if (!fs.existsSync(this.draftsFile)) this.writeDrafts({});
    if (!fs.existsSync(this.messagesFile)) this.writeMessages({});
    if (!fs.existsSync(this.achievementsFile)) this.writeAchievements({});
    if (!fs.existsSync(this.preferencesFile)) this.writePreferences({});
    if (!fs.existsSync(this.bookmarksFile)) this.writeBookmarks({});
    if (!fs.existsSync(this.blocksFile)) this.writeBlocks({});
    if (!fs.existsSync(this.inviteKeysFile)) this.writeInviteKeys({});
  }

  private isCacheValid(key: string): boolean {
    const timestamp = this.cacheTimestamp[key];
    return Boolean(timestamp && (Date.now() - timestamp) < this.CACHE_TTL);
  }

  private invalidateCache(key: string): void {
    delete this.cacheTimestamp[key];
    if (key === 'users') this.usersCache = null;
    if (key === 'posts') this.postsCache = null;
  }

  readUsers(): any {
    if (this.usersCache && this.isCacheValid('users')) {
      return this.usersCache;
    }
    this.usersCache = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
    this.cacheTimestamp['users'] = Date.now();
    return this.usersCache;
  }

  writeUsers(data: any): void {
    fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
    this.invalidateCache('users');
  }

  readPosts(): any {
    if (this.postsCache && this.isCacheValid('posts')) {
      return this.postsCache;
    }
    this.postsCache = JSON.parse(fs.readFileSync(this.postsFile, 'utf8'));
    this.cacheTimestamp['posts'] = Date.now();
    return this.postsCache;
  }

  writePosts(data: any): void {
    fs.writeFileSync(this.postsFile, JSON.stringify(data, null, 2));
    this.invalidateCache('posts');
  }

  readBans(): any { return JSON.parse(fs.readFileSync(this.bansFile, 'utf8')); }
  writeBans(data: any): void { fs.writeFileSync(this.bansFile, JSON.stringify(data, null, 2)); }
  readCommunities(): any { return JSON.parse(fs.readFileSync(this.communitiesFile, 'utf8')); }
  writeCommunities(data: any): void { fs.writeFileSync(this.communitiesFile, JSON.stringify(data, null, 2)); }
  readReports(): any { return JSON.parse(fs.readFileSync(this.reportsFile, 'utf8')); }
  writeReports(data: any): void { fs.writeFileSync(this.reportsFile, JSON.stringify(data, null, 2)); }
  readWarnings(): any { return JSON.parse(fs.readFileSync(this.warningsFile, 'utf8')); }
  writeWarnings(data: any): void { fs.writeFileSync(this.warningsFile, JSON.stringify(data, null, 2)); }
  readDrafts(): any { return JSON.parse(fs.readFileSync(this.draftsFile, 'utf8')); }
  writeDrafts(data: any): void { fs.writeFileSync(this.draftsFile, JSON.stringify(data, null, 2)); }
  readMessages(): any { return JSON.parse(fs.readFileSync(this.messagesFile, 'utf8')); }
  writeMessages(data: any): void { fs.writeFileSync(this.messagesFile, JSON.stringify(data, null, 2)); }
  readAchievements(): any { return JSON.parse(fs.readFileSync(this.achievementsFile, 'utf8')); }
  writeAchievements(data: any): void { fs.writeFileSync(this.achievementsFile, JSON.stringify(data, null, 2)); }
  readPreferences(): any { return JSON.parse(fs.readFileSync(this.preferencesFile, 'utf8')); }
  writePreferences(data: any): void { fs.writeFileSync(this.preferencesFile, JSON.stringify(data, null, 2)); }
  readBookmarks(): any { return JSON.parse(fs.readFileSync(this.bookmarksFile, 'utf8')); }
  writeBookmarks(data: any): void { fs.writeFileSync(this.bookmarksFile, JSON.stringify(data, null, 2)); }
  readBlocks(): any { return JSON.parse(fs.readFileSync(this.blocksFile, 'utf8')); }
  writeBlocks(data: any): void { fs.writeFileSync(this.blocksFile, JSON.stringify(data, null, 2)); }
  readInviteKeys(): any { return JSON.parse(fs.readFileSync(this.inviteKeysFile, 'utf8')); }
  writeInviteKeys(data: any): void { fs.writeFileSync(this.inviteKeysFile, JSON.stringify(data, null, 2)); }

  generateInviteKey(generatedBy: string): any {
    const keys = this.readInviteKeys();
    const key = 'ODIUM-' + Math.random().toString(36).substring(2, 15).toUpperCase() + 
                '-' + Math.random().toString(36).substring(2, 15).toUpperCase();
    
    keys[key] = {
      key,
      generatedBy,
      generatedAt: new Date().toISOString(),
      used: false,
      usedBy: null,
      usedAt: null
    };
    
    this.writeInviteKeys(keys);
    return { success: true, key };
  }

  validateInviteKey(key: string): any {
    const keys = this.readInviteKeys();
    const inviteKey = keys[key];
    
    if (!inviteKey) return { valid: false, error: 'Invalid invite key' };
    if (inviteKey.used) return { valid: false, error: 'Invite key already used' };
    
    return { valid: true };
  }

  useInviteKey(key: string, username: string): any {
    const keys = this.readInviteKeys();
    const inviteKey = keys[key];
    
    if (!inviteKey || inviteKey.used) {
      return { error: 'Invalid or already used key' };
    }
    
    inviteKey.used = true;
    inviteKey.usedBy = username;
    inviteKey.usedAt = new Date().toISOString();
    
    this.writeInviteKeys(keys);
    return { success: true };
  }

  getInviteKeys(generatedBy: string | null = null): any {
    const keys = this.readInviteKeys();
    const keyArray = Object.values(keys);
    
    if (generatedBy) {
      return keyArray.filter((k: any) => k.generatedBy === generatedBy);
    }
    
    return keyArray;
  }

  createUser(username: string, password: string, email: string): any {
    const users = this.readUsers();
    if (users[username]) return { error: 'Username already exists' };

    users[username] = {
      id: Date.now().toString(),
      username,
      password: bcrypt.hashSync(password, 10),
      email,
      pfp: `/uploads/default-${Math.floor(Math.random() * 5)}.png`,
      banner: null,
      bio: '',
      location: '',
      website: '',
      joinDate: new Date().toISOString(),
      role: 'user',
      posts: 0,
      reputation: 0,
      xp: 0,
      level: 1,
      verified: true,
      streak: 0,
      lastLogin: new Date().toISOString(),
      flair: null
    };

    this.writeUsers(users);
    this.checkAchievements(username, 'register');
    const { password: _, ...userWithoutPassword } = users[username];
    return { success: true, user: userWithoutPassword };
  }

  authenticateUser(username: string, password: string): any {
    const users = this.readUsers();
    const user = users[username];
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return { error: 'Invalid credentials' };
    }

    if (this.isBanned(username)) {
      const banInfo = this.getBanInfo(username);
      return { error: `You are banned. Reason: ${banInfo.reason}` };
    }

    const now = new Date();
    const lastLogin = new Date(user.lastLogin);
    const daysSinceLogin = Math.floor((now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLogin === 1) {
      user.streak++;
      this.addXP(username, 10);
    } else if (daysSinceLogin > 1) {
      user.streak = 1;
    }
    
    user.lastLogin = now.toISOString();
    this.writeUsers(users);

    const { password: _, ...userWithoutPassword } = user;
    return { success: true, user: userWithoutPassword };
  }

  addXP(username: string, amount: number): void {
    const users = this.readUsers();
    const user = users[username];
    if (!user) return;

    user.xp += amount;
    const newLevel = Math.floor(user.xp / 100) + 1;
    
    if (newLevel > user.level) {
      user.level = newLevel;
      this.checkAchievements(username, 'level', newLevel);
    }

    this.writeUsers(users);
  }

  getUser(username: string): any {
    const users = this.readUsers();
    
    if (username === '[removed]') {
      return {
        username: '[removed]',
        pfp: `/uploads/default-0.png`,
        banner: null,
        bio: '[This account has been banned]',
        joinDate: new Date().toISOString(),
        role: 'user',
        posts: 0,
        reputation: 0
      };
    }
    
    const user = users[username];
    if (!user) return null;
    
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  updateUser(username: string, updates: any): any {
    const users = this.readUsers();
    if (!users[username]) return { error: 'User not found' };
    
    const allowedFields = ['pfp', 'banner', 'bio', 'location', 'website', 'email', 'flair'];
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        users[username][key] = updates[key];
      }
    });

    this.writeUsers(users);
    const { password, ...userWithoutPassword } = users[username];
    return { success: true, user: userWithoutPassword };
  }

  updateUserRole(username: string, role: string, changerRole: string): any {
    const users = this.readUsers();
    if (!users[username]) return { error: 'User not found' };
    
    const targetUser = users[username];
    
    if (targetUser.role === 'admin' && changerRole !== 'owner') {
      return { error: 'Only the owner can modify administrator roles' };
    }
    
    if (role === 'admin' && changerRole !== 'owner') {
      return { error: 'Only the owner can promote users to administrator' };
    }
    
    if (targetUser.role === 'owner') {
      return { error: 'The owner role cannot be changed' };
    }
    
    if (role === 'owner' && changerRole !== 'owner') {
      return { error: 'Only the owner can assign owner role' };
    }
    
    users[username].role = role;
    this.writeUsers(users);
    return { success: true };
  }

  checkAchievements(username: string, type: string, value: any = null): any {
    const achievements = this.readAchievements();
    if (!achievements[username]) {
      achievements[username] = [];
    }

    const userAchievements = achievements[username];
    const newAchievements = [];

    switch (type) {
      case 'register':
        if (!userAchievements.find((a: any) => a.id === 'first_steps')) {
          newAchievements.push({ id: 'first_steps', name: 'First Steps', desc: 'Joined Odium', date: new Date().toISOString() });
        }
        break;
      case 'post':
        const users = this.readUsers();
        if (users[username].posts === 1 && !userAchievements.find((a: any) => a.id === 'first_post')) {
          newAchievements.push({ id: 'first_post', name: 'First Post', desc: 'Created your first post', date: new Date().toISOString() });
        }
        if (users[username].posts === 10 && !userAchievements.find((a: any) => a.id === 'prolific')) {
          newAchievements.push({ id: 'prolific', name: 'Prolific', desc: 'Created 10 posts', date: new Date().toISOString() });
        }
        break;
      case 'level':
        if (value === 5 && !userAchievements.find((a: any) => a.id === 'veteran')) {
          newAchievements.push({ id: 'veteran', name: 'Veteran', desc: 'Reached level 5', date: new Date().toISOString() });
        }
        break;
    }

    achievements[username].push(...newAchievements);
    this.writeAchievements(achievements);
    return newAchievements;
  }

  getAchievements(username: string): any {
    const achievements = this.readAchievements();
    return achievements[username] || [];
  }

  getUserPreferences(username: string): any {
    const prefs = this.readPreferences();
    return prefs[username] || {
      theme: 'dark',
      fontSize: 'medium',
      viewMode: 'card',
      notifications: true,
      emailNotifications: true,
      emailOnReply: true,
      emailTrendingDigest: true,
      emailWeeklySummary: true
    };
  }

  updateUserPreferences(username: string, preferences: any): any {
    const prefs = this.readPreferences();
    prefs[username] = { ...this.getUserPreferences(username), ...preferences };
    this.writePreferences(prefs);
    return prefs[username];
  }

  bookmarkPost(username: string, postId: string): any {
    const bookmarks = this.readBookmarks();
    if (!bookmarks[username]) bookmarks[username] = [];
    
    if (!bookmarks[username].includes(postId)) {
      bookmarks[username].push(postId);
    }
    
    this.writeBookmarks(bookmarks);
    return { success: true };
  }

  unbookmarkPost(username: string, postId: string): any {
    const bookmarks = this.readBookmarks();
    if (!bookmarks[username]) return { success: true };
    
    bookmarks[username] = bookmarks[username].filter((id: string) => id !== postId);
    this.writeBookmarks(bookmarks);
    return { success: true };
  }

  getBookmarks(username: string): any {
    const bookmarks = this.readBookmarks();
    return bookmarks[username] || [];
  }

  blockUser(blocker: string, blocked: string): any {
    const blocks = this.readBlocks();
    if (!blocks[blocker]) blocks[blocker] = [];
    
    if (!blocks[blocker].includes(blocked)) {
      blocks[blocker].push(blocked);
    }
    
    this.writeBlocks(blocks);
    return { success: true };
  }

  unblockUser(blocker: string, blocked: string): any {
    const blocks = this.readBlocks();
    if (!blocks[blocker]) return { success: true };
    
    blocks[blocker] = blocks[blocker].filter((u: string) => u !== blocked);
    this.writeBlocks(blocks);
    return { success: true };
  }

  getBlockedUsers(username: string): any {
    const blocks = this.readBlocks();
    return blocks[username] || [];
  }

  saveDraft(username: string, draft: any): any {
    const drafts = this.readDrafts();
    if (!drafts[username]) drafts[username] = [];
    
    draft.id = Date.now().toString();
    draft.savedAt = new Date().toISOString();
    drafts[username].push(draft);
    
    this.writeDrafts(drafts);
    return { success: true, draft };
  }

  getDrafts(username: string): any {
    const drafts = this.readDrafts();
    return drafts[username] || [];
  }

  deleteDraft(username: string, draftId: string): any {
    const drafts = this.readDrafts();
    if (!drafts[username]) return { success: true };
    
    drafts[username] = drafts[username].filter((d: any) => d.id !== draftId);
    this.writeDrafts(drafts);
    return { success: true };
  }

  addDirectMessage(from: string, to: string, message: string): any {
    const messages = this.readMessages();
    const conversationId = [from, to].sort().join('_');
    
    if (!messages[conversationId]) {
      messages[conversationId] = [];
    }
    
    const msg = {
      id: Date.now().toString(),
      from,
      to,
      message,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    messages[conversationId].push(msg);
    this.writeMessages(messages);
    return msg;
  }

  getDirectMessages(user1: string, user2: string): any {
    const messages = this.readMessages();
    const conversationId = [user1, user2].sort().join('_');
    return messages[conversationId] || [];
  }

  markMessagesRead(from: string, to: string): void {
    const messages = this.readMessages();
    const conversationId = [from, to].sort().join('_');
    
    if (messages[conversationId]) {
      messages[conversationId].forEach((msg: any) => {
        if (msg.to === to && msg.from === from) {
          msg.read = true;
        }
      });
      this.writeMessages(messages);
    }
  }

  createCommunity(name: string, description: string, creator: string, categories: string[] = [], isPrivate: boolean = false): any {
    const communities = this.readCommunities();
    const communityId = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (communities[communityId]) {
      return { error: 'Community already exists' };
    }

    if (communityId.length < 3 || communityId.length > 21) {
      return { error: 'Community name must be 3-21 characters' };
    }

    communities[communityId] = {
      id: communityId,
      name: name,
      description: description,
      creator: creator,
      categories: categories.length > 0 ? categories : ['general'],
      createdAt: new Date().toISOString(),
      members: [creator],
      moderators: [creator],
      posts: 0,
      isPrivate: isPrivate,
      rules: [],
      banner: null,
      theme: null
    };

    this.writeCommunities(communities);
    return { success: true, community: communities[communityId] };
  }

  getCommunities(): any {
    const communities = this.readCommunities();
    return Object.values(communities);
  }

  getCommunity(communityId: string): any {
    const communities = this.readCommunities();
    return communities[communityId] || null;
  }

  addCommunityModerator(communityId: string, username: string, addedBy: string): any {
    const communities = this.readCommunities();
    const community = communities[communityId];
    
    if (!community) return { error: 'Community not found' };
    if (community.creator !== addedBy && !community.moderators.includes(addedBy)) {
      return { error: 'Only creator and moderators can add moderators' };
    }
    
    if (!community.moderators.includes(username)) {
      community.moderators.push(username);
      this.writeCommunities(communities);
    }
    
    return { success: true };
  }

  updateCommunityRules(communityId: string, rules: any[], updatedBy: string): any {
    const communities = this.readCommunities();
    const community = communities[communityId];
    
    if (!community) return { error: 'Community not found' };
    if (!community.moderators.includes(updatedBy) && community.creator !== updatedBy) {
      return { error: 'Only moderators can update rules' };
    }
    
    community.rules = rules;
    this.writeCommunities(communities);
    return { success: true };
  }

  createReport(reporter: string, type: string, targetId: string, reason: string, category: string): any {
    const reports = this.readReports();
    
    const report = {
      id: Date.now().toString(),
      reporter,
      type,
      targetId,
      reason,
      category,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedBy: null,
      resolvedAt: null
    };
    
    reports.push(report);
    this.writeReports(reports);
    return { success: true, report };
  }

  getReports(status: string | null = null): any {
    const reports = this.readReports();
    if (status) {
      return reports.filter((r: any) => r.status === status);
    }
    return reports;
  }

  resolveReport(reportId: string, resolvedBy: string, action: string): any {
    const reports = this.readReports();
    const report = reports.find((r: any) => r.id === reportId);
    
    if (!report) return { error: 'Report not found' };
    
    report.status = 'resolved';
    report.resolvedBy = resolvedBy;
    report.resolvedAt = new Date().toISOString();
    report.action = action;
    
    this.writeReports(reports);
    return { success: true };
  }

  addWarning(username: string, reason: string, issuedBy: string): any {
    const warnings = this.readWarnings();
    if (!warnings[username]) warnings[username] = [];
    
    warnings[username].push({
      id: Date.now().toString(),
      reason,
      issuedBy,
      issuedAt: new Date().toISOString()
    });
    
    this.writeWarnings(warnings);
    return { success: true };
  }

  getWarnings(username: string): any {
    const warnings = this.readWarnings();
    return warnings[username] || [];
  }

  createPost(username: string, title: string, content: string, category: string, imageUrl: string | null = null, nsfw: boolean = false, community: string | null = null, tags: string[] = []): any {
    const users = this.readUsers();
    const posts = this.readPosts();
    const communities = this.readCommunities();
    
    if (!users[username]) return { error: 'User not found' };
    if (community && !communities[community]) return { error: 'Community not found' };

    const post = {
      id: Date.now().toString(),
      author: username,
      authorPfp: users[username].pfp,
      title,
      content,
      category,
      community: community || null,
      image: imageUrl,
      nsfw: nsfw || false,
      timestamp: new Date().toISOString(),
      editedAt: null,
      upvotes: 0,
      downvotes: 0,
      views: 0,
      replies: [],
      upvotedBy: [],
      downvotedBy: [],
      pinned: false,
      locked: false,
      tags: tags || [],
      awards: []
    };

    posts.unshift(post);
    users[username].posts++;
    
    if (community && communities[community]) {
      communities[community].posts++;
      this.writeCommunities(communities);
    }
    
    this.writePosts(posts);
    this.writeUsers(users);
    this.addXP(username, 5);
    this.checkAchievements(username, 'post');
    
    return { success: true, post };
  }

  editPost(postId: string, username: string, updates: any, isAdmin: boolean = false): any {
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post) return { error: 'Post not found' };
    if (post.author !== username && !isAdmin) return { error: 'Unauthorized' };

    if (updates.title) post.title = updates.title;
    if (updates.content) post.content = updates.content;
    if (updates.category) post.category = updates.category;
    post.editedAt = new Date().toISOString();
    
    this.writePosts(posts);
    return { success: true, post };
  }

  getPosts(category: string | null = null, community: string | null = null, sort: string = 'new', timeRange: string = 'all', username: string | null = null): any {
    const posts = this.readPosts();
    let filteredPosts = posts;

    if (username) {
      const blockedUsers = this.getBlockedUsers(username);
      filteredPosts = filteredPosts.filter((p: any) => !blockedUsers.includes(p.author));
    }
    
    if (community) {
      filteredPosts = filteredPosts.filter((p: any) => p.community === community);
      if (category && category !== 'all') {
        filteredPosts = filteredPosts.filter((p: any) => p.category === category);
      }
    } else if (category && category !== 'all') {
      filteredPosts = filteredPosts.filter((p: any) => p.category === category && !p.community);
    } else if (!community) {
      filteredPosts = filteredPosts.filter((p: any) => !p.community);
    }

    if (timeRange !== 'all') {
      const now = new Date();
      const ranges: any = {
        'today': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000
      };
      
      if (ranges[timeRange]) {
        filteredPosts = filteredPosts.filter((p: any) => {
          return (now.getTime() - new Date(p.timestamp).getTime()) < ranges[timeRange];
        });
      }
    }

    switch (sort) {
      case 'hot':
        filteredPosts.sort((a: any, b: any) => {
          const aScore = (a.upvotes - a.downvotes) / Math.pow((Date.now() - new Date(a.timestamp).getTime()) / 3600000 + 2, 1.5);
          const bScore = (b.upvotes - b.downvotes) / Math.pow((Date.now() - new Date(b.timestamp).getTime()) / 3600000 + 2, 1.5);
          return bScore - aScore;
        });
        break;
      case 'top':
        filteredPosts.sort((a: any, b: any) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        break;
      case 'controversial':
        filteredPosts.sort((a: any, b: any) => {
          const aControversy = Math.min(a.upvotes, a.downvotes);
          const bControversy = Math.min(b.upvotes, b.downvotes);
          return bControversy - aControversy;
        });
        break;
      default:
        filteredPosts.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    
    return filteredPosts.sort((a: any, b: any) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
  }

  searchPosts(query: string, filters: any = {}): any {
    const posts = this.readPosts();
    const lowerQuery = query.toLowerCase();
    
    let results = posts.filter((p: any) => {
      return p.title.toLowerCase().includes(lowerQuery) ||
             p.content.toLowerCase().includes(lowerQuery) ||
             p.author.toLowerCase().includes(lowerQuery) ||
             (p.tags && p.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery)));
    });

    if (filters.community) {
      results = results.filter((p: any) => p.community === filters.community);
    }
    
    if (filters.category) {
      results = results.filter((p: any) => p.category === filters.category);
    }
    
    if (filters.author) {
      results = results.filter((p: any) => p.author === filters.author);
    }

    return results;
  }

  incrementPostViews(postId: string): void {
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (post) {
      post.views = (post.views || 0) + 1;
      this.writePosts(posts);
    }
  }

  givePostAward(postId: string, awardType: string, givenBy: string): any {
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post) return { error: 'Post not found' };
    
    if (!post.awards) post.awards = [];
    post.awards.push({
      type: awardType,
      givenBy,
      timestamp: new Date().toISOString()
    });
    
    this.writePosts(posts);
    this.addXP(post.author, 20);
    return { success: true };
  }

  getPost(postId: string): any {
    const posts = this.readPosts();
    return posts.find((p: any) => p.id === postId);
  }

  votePost(postId: string, username: string, voteType: string): any {
    const posts = this.readPosts();
    const users = this.readUsers();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post) return { error: 'Post not found' };

    const upvoteIndex = post.upvotedBy.indexOf(username);
    const downvoteIndex = post.downvotedBy.indexOf(username);
    
    const postAuthor = users[post.author];
    if (!postAuthor) return { error: 'Post author not found' };

    if (upvoteIndex > -1) {
      post.upvotes--;
      post.upvotedBy.splice(upvoteIndex, 1);
      postAuthor.reputation = Math.max(0, postAuthor.reputation - 1);
    }
    if (downvoteIndex > -1) {
      post.downvotes--;
      post.downvotedBy.splice(downvoteIndex, 1);
      postAuthor.reputation = Math.max(0, postAuthor.reputation + 1);
    }

    if (voteType === 'upvote') {
      post.upvotes++;
      post.upvotedBy.push(username);
      postAuthor.reputation = (postAuthor.reputation || 0) + 1;
    } else if (voteType === 'downvote') {
      post.downvotes++;
      post.downvotedBy.push(username);
      postAuthor.reputation = Math.max(0, (postAuthor.reputation || 0) - 1);
    }

    this.writePosts(posts);
    this.writeUsers(users);
    return { success: true, post };
  }

  addReply(postId: string, username: string, content: string): any {
    const users = this.readUsers();
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post || !users[username]) return { error: 'Post or user not found' };

    const reply = {
      id: Date.now().toString(),
      author: username,
      authorPfp: users[username].pfp,
      content,
      timestamp: new Date().toISOString(),
      upvotes: 0,
      upvotedBy: []
    };

    if (!post.replies) post.replies = [];
    post.replies.push(reply);
    this.writePosts(posts);
    
    return { success: true, reply };
  }

  deleteReply(postId: string, replyId: string, username: string, isAdmin: boolean = false): any {
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post) return { error: 'Post not found' };
    
    const replyIndex = post.replies.findIndex((r: any) => r.id === replyId);
    if (replyIndex === -1) return { error: 'Reply not found' };
    
    const reply = post.replies[replyIndex];
    if (reply.author !== username && !isAdmin) {
      return { error: 'Unauthorized' };
    }

    post.replies.splice(replyIndex, 1);
    this.writePosts(posts);
    
    return { success: true };
  }

  pinPost(postId: string, adminUsername: string): any {
    const posts = this.readPosts();
    const post = posts.find((p: any) => p.id === postId);
    
    if (!post) return { error: 'Post not found' };
    
    post.pinned = !post.pinned;
    this.writePosts(posts);
    
    return { success: true, pinned: post.pinned };
  }

  deletePost(postId: string, username: string, isAdmin: boolean = false): any {
    const posts = this.readPosts();
    const postIndex = posts.findIndex((p: any) => p.id === postId);
    
    if (postIndex === -1) return { error: 'Post not found' };
    
    const post = posts[postIndex];
    if (post.author !== username && !isAdmin) {
      return { error: 'Unauthorized' };
    }

    if (post.image && post.image.startsWith('/uploads/post-')) {
      const imagePath = path.join(__dirname, '../../public', post.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    posts.splice(postIndex, 1);
    this.writePosts(posts);
    
    const users = this.readUsers();
    if (users[post.author]) {
      users[post.author].posts = Math.max(0, users[post.author].posts - 1);
      this.writeUsers(users);
    }
    
    if (post.community) {
      const communities = this.readCommunities();
      if (communities[post.community]) {
        communities[post.community].posts = Math.max(0, communities[post.community].posts - 1);
        this.writeCommunities(communities);
      }
    }
    
    return { success: true };
  }

  banUser(username: string, reason: string, bannedBy: string, bannerRole: string, duration: number | null = null): any {
    const bans = this.readBans();
    const users = this.readUsers();
    const posts = this.readPosts();
    
    if (users[username]?.role === 'admin' && bannerRole !== 'owner') {
      return { error: 'Only the owner can ban administrators' };
    }
    
    if (users[username]?.role === 'owner') {
      return { error: 'The owner cannot be banned' };
    }
    
    bans[username] = {
      reason,
      bannedBy,
      bannedAt: new Date().toISOString(),
      expiresAt: duration ? new Date(Date.now() + duration).toISOString() : null,
      permanent: !duration
    };
    this.writeBans(bans);
    
    if (users[username]) {
      users[username] = {
        ...users[username],
        username: '[removed]',
        email: '[removed]',
        pfp: `/uploads/default-0.png`,
        banner: null,
        bio: '[This account has been banned]'
      };
      this.writeUsers(users);
    }
    
    posts.forEach((post: any) => {
      if (post.author === username) {
        post.author = '[removed]';
        post.authorPfp = `/uploads/default-0.png`;
        post.title = '[Removed]';
        post.content = '[This content has been removed]';
      }
      
      if (post.replies) {
        post.replies.forEach((reply: any) => {
          if (reply.author === username) {
            reply.author = '[removed]';
            reply.content = '[This content has been removed]';
          }
        });
      }
    });
    
    this.writePosts(posts);
    return { success: true };
  }

  isBanned(username: string): boolean {
    const bans = this.readBans();
    const ban = bans[username];
    
    if (!ban) return false;
    
    if (ban.expiresAt && new Date(ban.expiresAt) < new Date()) {
      delete bans[username];
      this.writeBans(bans);
      return false;
    }
    
    return true;
  }

  getBanInfo(username: string): any {
    const bans = this.readBans();
    return bans[username] || null;
  }

  unbanUser(username: string): any {
    const bans = this.readBans();
    delete bans[username];
    this.writeBans(bans);
    return { success: true };
  }

  getLeaderboard(type: string = 'xp', limit: number = 10): any {
    const users = this.readUsers();
    const userArray = Object.values(users).map((u: any) => {
      const { password, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });
    
    switch (type) {
      case 'xp':
        return userArray.sort((a: any, b: any) => (b.xp || 0) - (a.xp || 0)).slice(0, limit);
      case 'reputation':
        return userArray.sort((a: any, b: any) => (b.reputation || 0) - (a.reputation || 0)).slice(0, limit);
      case 'posts':
        return userArray.sort((a: any, b: any) => (b.posts || 0) - (a.posts || 0)).slice(0, limit);
      case 'streak':
        return userArray.sort((a: any, b: any) => (b.streak || 0) - (a.streak || 0)).slice(0, limit);
      default:
        return userArray.slice(0, limit);
    }
  }
}

export default Database;