# ODIUM COLLECTIVE

![ODIUM Logo](https://snoofz.net/public/uploads/6249af0c-484c-4f32-887e-638fc8f34aa9.png)

**The Elite Forum Experience** - A high-performance, invite-only forum platform built with Fastify and custom binary WebSocket protocols.

## 🌟 Features

### Core Functionality
- **Invite-Only Registration** - Exclusive access through invite keys with email verification
- **Real-time Communication** - WebSocket-based live chat and messaging
- **Voice & Video Calling** - WebRTC-powered calls with Discord-style UI
- **Custom Binary Protocol** - Ultra-fast messaging with magic bytes [0x42, 0x50] + OpCodes
- **Community System** - Create and moderate communities with role-based permissions
- **Direct Messaging** - Private conversations between users
- **Post Management** - Create, edit, delete posts with rich formatting
- **User Profiles** - Customizable profiles with avatars and banners

### Gamification & Social
- **XP & Leveling System** - Earn experience and level up
- **Achievement System** - Unlock achievements through various activities
- **Reputation System** - Build reputation through community engagement
- **Leaderboards** - Compete across multiple metrics (XP, reputation, posts, streak)
- **User Bookmarks** - Save favorite posts for later
- **User Blocking** - Block unwanted interactions

### Advanced Features
- **Post Drafts** - Save work in progress
- **Search Functionality** - Advanced search with filters (community, category, author)
- **Email Notifications** - Customizable email digests and alerts
- **Admin Panel** - Comprehensive moderation and user management tools
- **Rate Limiting** - Built-in security and spam prevention
- **Session Management** - Secure authentication with cookies
- **Custom Cursor & Animations** - Immersive UI with particle effects

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **TypeScript** - Type-safe development
- **Fastify** - High-performance web framework
- **uWebSockets.js** - Binary WebSocket protocol implementation
- **bcryptjs** - Password hashing
- **Nodemailer** - Email service integration

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **tsParticles** - Particle effects and animations
- **WebRTC** - Real-time voice and video communication
- **Custom Binary Protocol** - Efficient data transfer

### Storage & Security
- **File-based Database** - JSON storage in `/data` directory
- **@fastify/session** - Session management
- **@fastify/cookie** - Cookie parsing
- **sanitize-html** - XSS protection
- **dotenv** - Environment configuration

## 📦 Installation

### Prerequisites
- Node.js 20.x or higher
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd odium-collective
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3008
NODE_ENV=development
LOG_LEVEL=info

# Session Secret (change this!)
SESSION_SECRET=your-super-secret-session-key-change-this

# Email Configuration (for verification codes)
NM_HOST=smtp.gmail.com
NM_PORT=587
NM_USER=your-email@gmail.com
NM_PASS=your-app-password
NM_FROM=noreply@odiumvrc.com

# Admin Configuration
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-secure-password
```

4. **Build TypeScript**
```bash
npm run build
# or for development with watch mode
npm run dev
```

5. **Start the server**
```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:3008`

## 🚀 Usage

### First-Time Setup

1. **Create an admin account** - The first user registered becomes an admin
2. **Generate invite keys** - Use the admin panel to create invite keys for new users
3. **Customize settings** - Configure communities, categories, and moderation rules

### User Registration Flow

1. User receives an invite key
2. User navigates to `/register`
3. User enters invite key, username, email, and password
4. System sends 6-digit verification code to email
5. User verifies email and account is created
6. User is redirected to forum

### Creating Posts

1. Navigate to `/forum`
2. Click "Create Post" button
3. Fill in title, content, select community and category
4. Post or save as draft

### Voice/Video Calling

1. Navigate to a user's profile
2. Click "Call" button (voice or video)
3. Wait for recipient to accept
4. Use in-call controls to mute/unmute or end call

## 📁 Project Structure

```
odium-collective/
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/      # Authentication & validation
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic (email, etc.)
│   └── websocket/       # WebSocket server & binary protocol
├── public/              # Static files
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side JavaScript
│   └── uploads/        # User uploads (avatars, banners)
├── data/               # JSON database files
├── server.ts           # Main server entry point
├── package.json
├── tsconfig.json
└── .env
```

## 🔒 Security Features

- **Password Hashing** - bcryptjs with salt rounds
- **Session Management** - Secure HTTP-only cookies
- **Email Verification** - Required for registration
- **Rate Limiting** - Prevent spam and abuse
- **HTML Sanitization** - Prevent XSS attacks
- **Invite-Only System** - Controlled user growth
- **Role-Based Access** - Admin, moderator, and user roles
- **Report System** - Community moderation tools

## 🎨 Customization

### Theme Colors

The default theme uses a dark red/pink gradient scheme. To customize:

1. Edit CSS files in `/public/css/`
2. Update color variables:
   - Primary: `#e91f42`
   - Secondary: `#ff6b8a`
   - Accent: `#ff8fa3`

### Logo and Branding

Replace the logo URL in HTML files:
```html
<div class="logo" style="background-image: url('YOUR_LOGO_URL');"></div>
```

## 📊 Binary WebSocket Protocol

The forum uses a custom binary protocol for efficient real-time communication:

### Protocol Structure
```
[Magic Bytes: 0x42, 0x50] [OpCode: 1 byte] [Payload Length: 4 bytes] [Payload: N bytes]
```

### OpCodes
- `0x01` - Authentication
- `0x02` - Message
- `0x03` - Typing Indicator
- `0x04` - Presence Update
- `0x05` - Voice/Video Signaling
- And more...

## 🤝 Contributing

Contributions are welcome! This project is open-source and nothing should be gatekept.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register/request` - Request registration with invite key
- `POST /api/auth/register/verify` - Verify email code and create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users/:username` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/avatar` - Upload avatar
- `POST /api/users/banner` - Upload banner

### Posts
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create post
- `GET /api/posts/:id` - Get single post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/vote` - Vote on post

### Communities
- `GET /api/communities` - List communities
- `POST /api/communities` - Create community
- `GET /api/communities/:id` - Get community details
- `POST /api/communities/:id/join` - Join community

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users/:username/ban` - Ban user
- `POST /api/admin/invite-keys` - Generate invite keys
- `GET /api/admin/reports` - View reports

### Messaging
- `GET /api/messages` - Get conversations
- `POST /api/messages/:username` - Send DM
- `GET /api/messages/:username/history` - Get message history

## 🐛 Troubleshooting

### WebSocket Connection Issues
- Ensure firewall allows WebSocket connections
- Check that ports are not blocked
- Verify `trustProxy` is set correctly for your deployment

### Email Verification Not Working
- Check SMTP credentials in `.env`
- Verify email service allows less secure apps or use app passwords
- Check spam folder

### Session Issues
- Clear browser cookies
- Verify `SESSION_SECRET` is set in `.env`
- Check session expiration settings

## 📄 License

This project is open-source. Nothing should be gatekept.

## 🙏 Acknowledgments

- **tsParticles** - Amazing particle effects library
- **Fastify** - Blazing fast web framework
- **uWebSockets.js** - High-performance WebSocket implementation

## 📧 Contact

For questions or support, join the Discord community or open an issue on GitHub.

---

**Built with ❤️ by the ODIUM team**

*"The users of Odium, stand on the podium."*
