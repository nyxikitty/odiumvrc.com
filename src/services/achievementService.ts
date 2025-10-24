import Database from '../models/Database';

const db = new Database();

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'milestone' | 'posting' | 'level' | 'reputation' | 'streak' | 'community' | 'social' | 'special';
  xpReward: number;
}

interface UnlockedAchievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  date: string;
}

interface AchievementProgress {
  posts: number;
  level: number;
  reputation: number;
  streak: number;
  replies: number;
  achievementsUnlocked: number;
  totalAchievements: number;
  progress: {
    posts: { current: number; nextMilestone: number };
    level: { current: number; nextMilestone: number };
    reputation: { current: number; nextMilestone: number };
    streak: { current: number; nextMilestone: number };
  };
}

interface CheckAchievementData {
  level?: number;
  replyCount?: number;
  [key: string]: any;
}

interface Post {
  author: string;
  replies: Reply[];
  [key: string]: any;
}

interface Reply {
  author: string;
  [key: string]: any;
}

type AchievementAction = 'register' | 'post' | 'level' | 'reputation' | 'streak' | 'reply' | 'community';

const ACHIEVEMENTS: Record<string, Achievement> = {
  first_steps: {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Joined Odium Collective',
    icon: '👋',
    category: 'milestone',
    xpReward: 10
  },
  first_post: {
    id: 'first_post',
    name: 'First Post',
    description: 'Created your first post',
    icon: '📝',
    category: 'posting',
    xpReward: 25
  },
  prolific: {
    id: 'prolific',
    name: 'Prolific',
    description: 'Created 10 posts',
    icon: '✏️',
    category: 'posting',
    xpReward: 50
  },
  content_creator: {
    id: 'content_creator',
    name: 'Content Creator',
    description: 'Created 50 posts',
    icon: '🎨',
    category: 'posting',
    xpReward: 100
  },
  posting_legend: {
    id: 'posting_legend',
    name: 'Posting Legend',
    description: 'Created 100 posts',
    icon: '🏆',
    category: 'posting',
    xpReward: 250
  },
  level_up: {
    id: 'level_up',
    name: 'Level Up',
    description: 'Reached level 3',
    icon: '⬆️',
    category: 'level',
    xpReward: 20
  },
  veteran: {
    id: 'veteran',
    name: 'Veteran',
    description: 'Reached level 5',
    icon: '⭐',
    category: 'level',
    xpReward: 50
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    description: 'Reached level 10',
    icon: '💎',
    category: 'level',
    xpReward: 100
  },
  legendary: {
    id: 'legendary',
    name: 'Legendary',
    description: 'Reached level 20',
    icon: '👑',
    category: 'level',
    xpReward: 250
  },
  well_liked: {
    id: 'well_liked',
    name: 'Well Liked',
    description: 'Earned 100 reputation',
    icon: '👍',
    category: 'reputation',
    xpReward: 50
  },
  popular: {
    id: 'popular',
    name: 'Popular',
    description: 'Earned 500 reputation',
    icon: '🌟',
    category: 'reputation',
    xpReward: 100
  },
  celebrity: {
    id: 'celebrity',
    name: 'Celebrity',
    description: 'Earned 1000 reputation',
    icon: '🎭',
    category: 'reputation',
    xpReward: 200
  },
  dedicated: {
    id: 'dedicated',
    name: 'Dedicated',
    description: '7 day login streak',
    icon: '🔥',
    category: 'streak',
    xpReward: 50
  },
  committed: {
    id: 'committed',
    name: 'Committed',
    description: '30 day login streak',
    icon: '💪',
    category: 'streak',
    xpReward: 150
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: '100 day login streak',
    icon: '⚡',
    category: 'streak',
    xpReward: 500
  },
  community_builder: {
    id: 'community_builder',
    name: 'Community Builder',
    description: 'Created a community',
    icon: '🏗️',
    category: 'community',
    xpReward: 100
  },
  conversationalist: {
    id: 'conversationalist',
    name: 'Conversationalist',
    description: 'Posted 50 replies',
    icon: '💬',
    category: 'social',
    xpReward: 75
  },
  helpful: {
    id: 'helpful',
    name: 'Helpful',
    description: 'Received 50 upvotes on replies',
    icon: '🤝',
    category: 'social',
    xpReward: 100
  },
  early_adopter: {
    id: 'early_adopter',
    name: 'Early Adopter',
    description: 'One of the first 100 members',
    icon: '🌅',
    category: 'special',
    xpReward: 200
  },
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Posted at 3 AM',
    icon: '🦉',
    category: 'special',
    xpReward: 25
  }
};

export async function checkAchievements(
  username: string,
  action: AchievementAction,
  data: CheckAchievementData = {}
): Promise<UnlockedAchievement[]> {
  const users = db.readUsers();
  const user = users[username];
  
  if (!user) return [];

  const currentAchievements = db.getAchievements(username);
  const newAchievements: UnlockedAchievement[] = [];

  const hasAchievement = (achievementId: string): boolean => {
    return currentAchievements.some((a: UnlockedAchievement) => a.id === achievementId);
  };

  const awardAchievement = (achievementId: string): void => {
    if (!hasAchievement(achievementId)) {
      const achievement = ACHIEVEMENTS[achievementId];
      const newAchievement: UnlockedAchievement = {
        id: achievement.id,
        name: achievement.name,
        desc: achievement.description,
        icon: achievement.icon,
        date: new Date().toISOString()
      };
      
      currentAchievements.push(newAchievement);
      newAchievements.push(newAchievement);
      
      if (achievement.xpReward) {
        db.addXP(username, achievement.xpReward);
      }
      
      console.log(`[ACHIEVEMENT] ${username} unlocked: ${achievement.name}`);
    }
  };

  switch (action) {
    case 'register':
      awardAchievement('first_steps');
      
      const totalUsers = Object.keys(users).length;
      if (totalUsers <= 100) {
        awardAchievement('early_adopter');
      }
      break;

    case 'post':
      if (user.posts === 1) awardAchievement('first_post');
      if (user.posts === 10) awardAchievement('prolific');
      if (user.posts === 50) awardAchievement('content_creator');
      if (user.posts === 100) awardAchievement('posting_legend');
      
      const hour = new Date().getHours();
      if (hour === 3) {
        awardAchievement('night_owl');
      }
      break;

    case 'level':
      const level = data.level || user.level;
      if (level >= 3) awardAchievement('level_up');
      if (level >= 5) awardAchievement('veteran');
      if (level >= 10) awardAchievement('elite');
      if (level >= 20) awardAchievement('legendary');
      break;

    case 'reputation':
      const reputation = user.reputation || 0;
      if (reputation >= 100) awardAchievement('well_liked');
      if (reputation >= 500) awardAchievement('popular');
      if (reputation >= 1000) awardAchievement('celebrity');
      break;

    case 'streak':
      const streak = user.streak || 0;
      if (streak >= 7) awardAchievement('dedicated');
      if (streak >= 30) awardAchievement('committed');
      if (streak >= 100) awardAchievement('unstoppable');
      break;

    case 'reply':
      const replyCount = data.replyCount || 0;
      if (replyCount >= 50) awardAchievement('conversationalist');
      break;

    case 'community':
      awardAchievement('community_builder');
      break;
  }

  if (newAchievements.length > 0) {
    const achievements = db.readAchievements();
    achievements[username] = currentAchievements;
    db.writeAchievements(achievements);
  }

  return newAchievements;
}

export function getAllAchievements(): Achievement[] {
  return Object.values(ACHIEVEMENTS);
}

export function getAchievementDetails(achievementId: string): Achievement | null {
  return ACHIEVEMENTS[achievementId] || null;
}

export function getAchievementProgress(username: string): AchievementProgress | null {
  const users = db.readUsers();
  const user = users[username];
  
  if (!user) return null;

  const currentAchievements = db.getAchievements(username);
  const posts = db.readPosts() as Post[];
  
  let replyCount = 0;
  posts.forEach((post: Post) => {
    if (post.replies) {
      replyCount += post.replies.filter((r: Reply) => r.author === username).length;
    }
  });

  return {
    posts: user.posts || 0,
    level: user.level || 1,
    reputation: user.reputation || 0,
    streak: user.streak || 0,
    replies: replyCount,
    achievementsUnlocked: currentAchievements.length,
    totalAchievements: Object.keys(ACHIEVEMENTS).length,
    progress: {
      posts: {
        current: user.posts || 0,
        nextMilestone: user.posts < 10 ? 10 : user.posts < 50 ? 50 : 100
      },
      level: {
        current: user.level || 1,
        nextMilestone: user.level < 5 ? 5 : user.level < 10 ? 10 : 20
      },
      reputation: {
        current: user.reputation || 0,
        nextMilestone: user.reputation < 100 ? 100 : user.reputation < 500 ? 500 : 1000
      },
      streak: {
        current: user.streak || 0,
        nextMilestone: user.streak < 7 ? 7 : user.streak < 30 ? 30 : 100
      }
    }
  };
}

export { ACHIEVEMENTS };