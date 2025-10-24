import path from 'path';

const dbPath = path.join(__dirname, '../../data');
const uploadsPath = path.join(__dirname, '../../public/uploads');

export default {
  dbPath,
  uploadsPath,
  usersFile: path.join(dbPath, 'users.json'),
  postsFile: path.join(dbPath, 'posts.json'),
  bansFile: path.join(dbPath, 'bans.json'),
  communitiesFile: path.join(dbPath, 'communities.json'),
  reportsFile: path.join(dbPath, 'reports.json'),
  warningsFile: path.join(dbPath, 'warnings.json'),
  draftsFile: path.join(dbPath, 'drafts.json'),
  messagesFile: path.join(dbPath, 'messages.json'),
  achievementsFile: path.join(dbPath, 'achievements.json'),
  preferencesFile: path.join(dbPath, 'preferences.json'),
  bookmarksFile: path.join(dbPath, 'bookmarks.json'),
  blocksFile: path.join(dbPath, 'blocks.json'),
  inviteKeysFile: path.join(dbPath, 'inviteKeys.json')
};