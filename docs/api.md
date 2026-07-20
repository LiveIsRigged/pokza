# Architecture & API Design

Complete technical architecture for Pokza. No single point of failure. Designed for scale.

---

## Tech Stack Overview

```
Frontend                Backend               Data Layer
├── React Native        ├── Node.js/Express   ├── PostgreSQL (Supabase)
├── Expo               ├── TypeScript        ├── Redis (cache)
├── React Query        ├── GraphQL (v2)      ├── S3 (media storage)
└── Zustand            ├── REST (v1)         └── Elasticsearch (search)
                       └── WebSockets
                           
Infra                  Third-party
├── Vercel (web)       ├── Stripe (payments)
├── Railway (backend)  ├── Sendgrid (email)
├── AWS (storage)      ├── Twilio (SMS)
└── Datadog (monitoring) ├── Auth0/Supabase (auth)
                       └── Sentry (errors)
```

---

## 1. Frontend Architecture

### React Native (Mobile: iOS + Android)

**Framework:** Expo (managed React Native)
- One codebase for iOS/Android
- Over-the-air updates without App Store review
- Hosted builds (no Mac required for building iOS)

**Advantages:**
- Fast iteration (reload in seconds)
- Native feel without writing Swift/Kotlin
- Shared code with web (if using React)

**Structure:**
```
pokza-app/
├── src/
│   ├── screens/          (Route-level components)
│   │   ├── FeedScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── CreateHandScreen.tsx
│   ├── components/       (Reusable UI)
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── HandReplayer.tsx
│   ├── hooks/            (Custom React hooks)
│   │   ├── useHand.ts
│   │   ├── useAuth.ts
│   │   └── useFeed.ts
│   ├── types/            (TypeScript types)
│   ├── utils/            (Helpers)
│   └── services/         (API calls)
│       └── api.ts
└── app.json              (Expo config)
```

**State Management:** Zustand (lightweight alternative to Redux)
- Simpler than Redux
- Good for moderate app complexity
- Smaller bundle size

**Data Fetching:** React Query
- Caching, revalidation, background sync
- Handles stale data automatically
- Built-in pagination support

**Navigation:** React Navigation
- Native-feeling navigation (swipe back on iOS)
- Tab navigator (feed, search, create, profile)
- Stack navigator (nested screens)
- Deep linking support (pokza://hands/abc123)

### Web (React + Next.js)

**Framework:** Next.js (React framework)
- Server-side rendering for SEO (hands should appear in Google)
- API routes (proxy to backend)
- Incremental static generation (fast builds)

**Structure:**
```
pokza-web/
├── pages/
│   ├── index.tsx         (Feed)
│   ├── [username].tsx    (Profile)
│   ├── hands/[id].tsx    (Hand detail)
│   └── api/              (Optional API proxy)
├── components/           (Shared with mobile via monorepo)
└── public/               (Static files)
```

**Styling:** Tailwind CSS (or CSS Modules from design system)

**Deployment:** Vercel (Next.js native, automatic deployments)

---

### Design System

**Source of truth:** Figma + component library

**Tokens:** Design system tokens (colors, spacing, typography)
- Defined in JSON
- Auto-generated to CSS/TypeScript
- Shared between web/mobile

**Components:**
```
Button, Card, Input, Modal, Tabs, Badge, Avatar, 
Chip, TextArea, DatePicker, Dropdown, Switch, etc.
```

**Mobile vs Web:**
- 95% component code is identical
- Platform-specific tweaks (iOS swipe vs Android back button)
- Shared design system ensures consistency

---

## 2. Backend Architecture

### Node.js + Express (REST) + GraphQL

**Why Node.js?**
- JavaScript shared with frontend
- Fast development iteration
- Scalable async/event-driven

**Why both REST + GraphQL?**
- **REST:** Simple CRUD operations, mobile app prefers simple HTTP
- **GraphQL:** Complex queries (feed with nested comments, user stats), web dashboard
- Coexist: GraphQL wraps REST endpoints, or separate resolvers

**URL Structure:**
```
REST API:
GET    /api/v1/hands/{id}
POST   /api/v1/hands
GET    /api/v1/users/{id}/profile
POST   /api/v1/users/{id}/follow
GET    /api/v1/feed
GET    /api/v1/search
POST   /api/v1/coaching/sessions

GraphQL:
POST   /graphql
(query { hand(id: "abc") { title, actions { type, amount } } })
```

**Folder Structure:**
```
backend/
├── src/
│   ├── routes/           (Express routes)
│   │   ├── hands.ts
│   │   ├── users.ts
│   │   ├── coaching.ts
│   │   └── posts.ts
│   ├── controllers/      (Route handlers)
│   │   └── handController.ts
│   ├── services/         (Business logic)
│   │   ├── handService.ts
│   │   ├── authService.ts
│   │   └── coachingService.ts
│   ├── middleware/       (Auth, validation, errors)
│   │   ├── authenticate.ts
│   │   ├── validateRequest.ts
│   │   └── errorHandler.ts
│   ├── graphql/          (GraphQL resolvers + schema)
│   ├── db/               (Database queries)
│   │   └── queries.ts
│   ├── webhooks/         (Stripe, Sendgrid, etc.)
│   ├── jobs/             (Background tasks)
│   │   ├── updateStats.ts
│   │   └── sendNotifications.ts
│   └── utils/
├── migrations/           (Database migrations)
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

**Key Dependencies:**
- Express: HTTP framework
- TypeScript: Type safety
- Zod: Runtime validation
- Knex: Query builder
- Redis: Caching
- Bull: Job queue
- Socket.io: WebSockets
- Passport: Authentication strategies

---

## 3. API Design

### REST API (v1)

**Authentication:** Bearer token (JWT from Supabase)

**Request/Response Pattern:**
```
Request:
POST /api/v1/hands
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "gameType": "cash",
  "stakes": "2/5",
  "smallBlind": 200,
  "bigBlind": 500,
  "heroPosition": "CO",
  "heroCards": ["As", "Kd"],
  "actions": [...]
}

Response:
201 Created
{
  "id": "hand-123",
  "createdAt": "2026-07-19T10:30:00Z",
  "status": "draft"
}

Errors:
400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "details": { "stakes": "Invalid stakes format" }
}
```

**Pagination:**
```
GET /api/v1/feed?limit=50&offset=0&cursor=post-123

Response:
{
  "data": [...],
  "pagination": {
    "cursor": "post-456",
    "hasMore": true
  }
}
```

**Filtering:**
```
GET /api/v1/hands?gameType=cash&position=CO&limit=50
GET /api/v1/coaches?specialization=preflop&minRating=4.5
```

### GraphQL API (v2, for complex queries)

**Schema:**
```
type Hand {
  id: ID!
  creator: User!
  gameType: String!
  stakes: String!
  actions: [Action!]!
  board: Board
  seats: [Seat!]!
  createdAt: DateTime!
}

type User {
  id: ID!
  username: String!
  profile: Profile!
  stats: HandStats!
  hands: [Hand!]!
  follows: [User!]!
}

type Query {
  hand(id: ID!): Hand
  user(id: ID!): User
  feed(first: 50, after: String): [Post!]!
  search(query: String!): [Hand!]!
  coachDirector(specialization: String): [Coach!]!
}

type Mutation {
  createHand(input: CreateHandInput!): Hand!
  publishPost(handId: ID!, title: String!): Post!
  likePost(postId: ID!): Post!
  bookCoachingSession(coachId: ID!, date: DateTime!): CoachingSession!
}

type Subscription {
  postCommented(postId: ID!): Comment!
  coachingSessionUpdate(sessionId: ID!): CoachingSession!
}
```

**Advantages:**
- Single request fetches all nested data (no N+1)
- Client specifies exactly what fields to return
- Subscriptions for real-time updates

---

## 4. Authentication

### Supabase Auth

**Why Supabase?**
- Managed PostgreSQL auth (no separate auth service)
- Built-in email verification, password reset
- OAuth providers (Google, GitHub, etc.)
- JWT tokens stored in local storage (mobile) / cookies (web)
- RLS integration (automatically filter by user)

**Flow:**

1. **Sign Up:**
   ```
   POST /auth/v1/signup
   { email, password }
   
   → Supabase sends verification email
   → User clicks link, email verified
   → Session created
   ```

2. **Login:**
   ```
   POST /auth/v1/login
   { email, password }
   
   → Returns JWT token (valid 1 hour)
   → Returns refresh token (valid 7 days)
   → Mobile: Store in secure storage
   → Web: Store in httpOnly cookie
   ```

3. **Refresh Token:**
   ```
   POST /auth/v1/refresh
   { refreshToken }
   
   → Returns new JWT
   → No need to re-login
   ```

4. **Logout:**
   ```
   POST /auth/v1/logout
   
   → Invalidate refresh token
   → Clear local storage/cookies
   ```

### Custom Auth Middleware

**On every request:**

1. Extract JWT from Authorization header (REST) or WebSocket connection
2. Verify JWT signature (Supabase public key)
3. Extract user_id from JWT claims
4. Attach to request context
5. If expired, block request (client must refresh)

**Permissions:**

- **Public endpoints:** No auth required
  - GET /api/v1/posts (public posts only)
  - GET /api/v1/coaches (public directory)
  
- **Authenticated endpoints:** JWT required
  - POST /api/v1/hands
  - POST /api/v1/comments
  - POST /api/v1/follow
  
- **Owner-only endpoints:** Verify user owns resource
  - PUT /api/v1/hands/{id} (only creator)
  - DELETE /api/v1/posts/{id} (only creator)

### OAuth (Optional, Year 2)

**Sign up with Google/GitHub:**

1. User taps "Sign up with Google"
2. Opens Google OAuth dialog
3. Google redirects to Pokza with code
4. Backend exchanges code for Google ID token
5. Supabase creates/links Pokza account
6. Return JWT to app

---

## 5. Storage

### Images & Videos (AWS S3)

**Structure:**
```
pokza-prod/
├── avatars/
│   └── {userId}/avatar.jpg
├── covers/
│   └── {userId}/cover.jpg
├── hand-recordings/
│   └── {sessionId}/recording.mp4
└── sponsor-media/
    └── {campaignId}/banner.jpg
```

**Upload Flow:**

1. **Presigned URL** (secure temporary upload):
   ```
   POST /api/v1/upload/presign
   { fileName: "avatar.jpg", contentType: "image/jpeg" }
   
   Response:
   { url: "https://s3.amazonaws.com/..." }
   ```

2. **Client uploads directly to S3** (no backend overhead)
   ```
   PUT {presignedUrl} [binary file data]
   ```

3. **Backend notifies:** File uploaded, start processing
   ```
   POST /api/v1/upload/complete
   { key: "avatars/user-123/avatar.jpg" }
   
   → Trigger: resize image, create thumbnails
   → Update user profile.avatar_url
   ```

**Image Processing (via Lambda function):**
- Resize to multiple sizes (200px, 400px, 800px)
- Convert to WebP (60% smaller than JPEG)
- Optimize compression
- Cache on CDN (CloudFront)

**CDN:**
- All S3 URLs go through CloudFront
- Edge caching (geographic distribution)
- Custom domain: media.pokza.com

### Backups

**Database backups:**
- Supabase automatic daily backups (7 days retention)
- Weekly snapshots to S3 (long-term retention)

**S3 versioning:**
- All objects versioned (can restore deleted files)
- Lifecycle: after 90 days, move to Glacier (cheaper)

---

## 6. Notifications

### Push Notifications (Mobile)

**Flow:**

1. **User subscribes:**
   ```
   On app launch, Expo requests push token from Apple/Google
   POST /api/v1/devices/register
   { token: "ExponentPushToken[...]", platform: "iOS" }
   ```

2. **Server sends notification:**
   ```
   Background job: User A likes User B's post
   POST /expo-push-service
   {
     to: "ExponentPushToken[...]",
     title: "Alex liked your hand",
     body: "Hero 3bet vs aggressive opponent",
     sound: "default"
   }
   ```

3. **Phone receives, displays banner**

**Types:**
- Likes: "@Alice liked your hand"
- Comments: "@Bob replied: Great line!"
- Follows: "@Coach Sarah started following you"
- Mentions: "@YourName mentioned you in a comment"
- Coaching: "Your session with @Coach starts in 30 min"

### Email Notifications

**Via Sendgrid:**

```
Trigger: New comment on your post
Template: "comment-notification"
To: user@example.com
Subject: "@Bob commented: Great analysis!"
```

**Batch notifications:**
- Don't spam (max 1 email per 6 hours)
- Daily digest (5pm local time)
- User can toggle on/off per notification type

### In-App Notifications

**Real-time via WebSockets:**
```
User B is viewing your post
User B likes your post → instant toast notification
Comment appears → add to comments list in real-time
```

---

## 7. Messaging (Real-Time)

### WebSockets (Socket.io)

**Why WebSockets?**
- Real-time (no polling)
- Bidirectional
- Lightweight

**Connection:**
```
Mobile app connects:
GET /socket.io/?token={jwt}&userID={userId}

Server validates JWT, establishes WebSocket connection
```

**Events:**

**Feed Updates (live):**
```
Client: socket.on('hand:published')
Server emits: { handId, creatorId, title, timestamp }
→ Append to feed in real-time
```

**Comments (live):**
```
Client: socket.on('post:commented', { postId, comment })
Server emits: { commentId, userId, content, timestamp }
→ Add to comments list instantly
```

**Notifications (live):**
```
Server emits: { type: 'like', postId, userId }
→ Show toast: "@Alice liked your hand"
→ Increment like count
```

**Presence (optional, v2):**
```
Server emits: { userIds: [user-1, user-2, user-3] }
→ Show "3 people viewing this hand"
```

**Rooms:**
```
Join room by post:
socket.join(`post:${postId}`)

When new comment:
io.to(`post:${postId}`).emit('comment', {...})
→ All viewers see comment instantly
```

### Message Delivery

**Guarantee: At-least-once delivery**

1. Client sends message
2. Server acknowledges (socket.emit('ack'))
3. If no ACK in 5 seconds, client retries
4. If client loses connection, messages queued until reconnect
5. On reconnect, flush queue

---

## 8. Deployment

### CI/CD Pipeline

**Repository:** GitHub

**Branches:**
- `main`: Production code (protected)
- `develop`: Staging code
- `feature/*`: Feature branches (PRs to develop)

**Workflow (on PR to develop):**

```
1. Run tests
   - Unit tests (Jest, React Testing Library)
   - Integration tests (database, API)
   - e2e tests (Playwright, mobile app)
   
2. Lint & type-check
   - ESLint (code style)
   - TypeScript (type safety)
   - Prettier (formatting)
   
3. Security scan
   - Dependency audit (npm audit, Dependabot)
   - SAST (static code analysis, Snyk)
   - Container scan (if Docker)
   
4. Deploy to staging
   - Run migrations
   - Deploy app
   - Smoke tests
   - Send notification to Slack
```

**Workflow (on PR to main):**

```
1. Same checks as above
2. Code review required (2 approvals)
3. Deploy to production
   - Canary release (10% traffic)
   - Monitor for errors
   - Gradual rollout (50% → 100%)
   - Blue-green deployment (zero downtime)
```

### Production Deployment

**Backend (Railway):**

```
1. Git push to main
2. GitHub Actions: Build Docker image
3. Push to Docker registry
4. Railway: Pull image, restart container
5. Run migrations (via hook)
6. Smoke tests pass
7. Notify Slack: "v1.2.3 deployed to production"
```

**Frontend Web (Vercel):**

```
1. Git push to main
2. Vercel: Detect Next.js app
3. Build & optimize
4. Deploy to CDN
5. DNS updated (instant propagation)
6. Instant rollback if errors
```

**Mobile App (Expo):**

```
1. Tag release: v1.2.3
2. GitHub Actions: Build iOS + Android
3. Expo EAS: Upload builds
4. Release notes generated
5. Manual review in App Store/Play Store (1-3 days)
6. Users auto-update when available
```

### Infrastructure

**Backend:**
- Railway: Managed Node.js hosting
  - Auto-scaling (based on CPU/memory)
  - Load balancing across instances
  - Automatic rollbacks on error
  
**Database:**
- Supabase: Managed PostgreSQL
  - Daily backups
  - Automatic failover
  - Geo-distributed replicas (optional, year 2+)

**Cache:**
- Redis (Supabase or standalone)
  - Session storage
  - Feed cache
  - Rate limit counters
  - Real-time data

**Search:**
- Elasticsearch (optional, year 2)
  - Full-text search on hands
  - Aggregations (stats, leaderboards)
  - Fuzzy matching

**CDN:**
- Vercel (web assets)
- CloudFront (S3 images)
  - Edge caching
  - Automatic gzip
  - DDoS protection

**Monitoring & Logging:**
- Datadog: Centralized logs + metrics
  - API latency monitoring
  - Error rate tracking
  - Database query performance
  - Custom dashboards

- Sentry: Error tracking
  - JavaScript errors
  - React Native crashes
  - Stack traces
  - Release tracking

- UptimeRobot: Uptime monitoring
  - Alerts if API down
  - Status page

---

## 9. Scalability

### Bottlenecks & Solutions

#### 1. Database Connection Pooling

**Problem:** 1000s of concurrent requests → database connection exhaustion

**Solution:**
- PgBouncer (connection pool)
- Max 100 connections to PostgreSQL
- Queue requests if pool full
- Supabase: Built-in pooling (1000 connections)

#### 2. Cache Layer (Redis)

**Hot data cached:**
- User profiles (10 sec TTL)
- Feed posts (5 min TTL)
- Coach directory (1 hour TTL)
- Leaderboards (1 hour TTL)

**Cache invalidation:**
- On write: invalidate related keys
- TTL-based: data refreshes automatically
- Event-based: subscribe to cache updates

#### 3. Query Optimization

**Slow queries identified via Datadog**

**Fixes:**
- Add indexes
- Denormalize (counts, stats)
- Use materialized views
- Archive old data (hands > 2 years)

#### 4. Read Replicas (Year 2+)

**Setup:**
- Primary database (writes)
- 2+ read replicas (reads)
- Route reads to replicas
- Replication lag: <100ms

**Benefit:** Database reads scale independently from writes

#### 5. Horizontal Scaling (Backend)

**Initial:** 1 instance
**After 10K MAU:** 2 instances (load balanced)
**After 100K MAU:** 4+ instances

**Stateless design:**
- No sessions stored in-memory (use Redis)
- No file uploads to local disk (use S3)
- Can spin up/down instances instantly

#### 6. Load Balancing

**Railway:** Automatic load balancing
- Sticky sessions (user requests go to same instance)
- Health checks (remove unhealthy instances)
- Auto-scaling based on CPU/memory

**CDN:** Vercel/CloudFront
- Distribute static files globally
- Cache images at edges
- Reduce server load

#### 7. Rate Limiting

**Per-user rate limits:**
- 100 requests/minute (standard)
- 1000 requests/minute (verified coaches)
- 10,000 requests/minute (internal)

**Implement via:**
- Redis counters
- Express middleware
- Return 429 Too Many Requests if exceeded

#### 8. Background Jobs (Bull Queue)

**Offload from request handler:**
```
Sync user stats (nightly, 2 AM UTC)
Send digest emails (5 PM local time per user)
Update leaderboards (hourly)
Archive hands (daily)
Clean up old sessions (weekly)
```

**Implementation:**
- Bull (job queue library)
- Redis (job storage)
- Multiple workers (can scale independently)

#### 9. Database Archival

**Problem:** hands table grows 1M rows/month → queries slow

**Solution (year 2+):**
- Keep last 1 year of hands in primary database
- Archive older hands to S3 (cold storage)
- Elasticsearch index for full-text search
- If user queries old hand, fetch from S3

#### 10. Image Optimization

**Problem:** Users upload 10MB images → storage & bandwidth costs

**Solution:**
- Limit upload size (5MB max)
- Resize on Lambda (auto 200px, 400px, 800px versions)
- Serve WebP (60% smaller)
- Lazy load images in feed

---

## 10. Disaster Recovery

### Backup Strategy

**Database:**
- Supabase: Daily automatic backups (7 days)
- Weekly manual snapshot to S3 (long-term, 1 year)

**S3:**
- Versioning enabled (restore deleted files)
- Cross-region replication (data survives region failure)

### Incident Response

**RTO (Recovery Time Objective):** < 1 hour
**RPO (Recovery Point Objective):** < 1 hour (15 min backups)

**Scenarios:**

**1. Database corruption**
→ Restore from backup (1 hour to data loss point)
→ Notify affected users
→ Run integrity checks

**2. Accidental code deploy (bad deployment)**
→ Instant rollback in Vercel/Railway
→ Revert to last known-good commit
→ Run tests to verify

**3. Data loss (deleted users/posts)**
→ Query backup database
→ Restore specific rows
→ Audit logs show who deleted

**4. Service outage (API down)**
→ Health checks trigger alert
→ On-call engineer notified (PagerDuty)
→ Restart services / scale up
→ Switch to cached data if needed

### Monitoring & Alerting

**Metrics to track:**
- API response time (target: < 200ms p95)
- Error rate (target: < 0.1%)
- Database connection pool usage
- Redis memory usage
- Disk usage
- Uptime (target: 99.9%)

**Alerts if:**
- Error rate > 1%
- Response time > 1 second
- Database CPU > 80%
- Disk usage > 85%
- Service down for 5 minutes

---

## 11. Security

### Network Security

**HTTPS only:**
- All traffic encrypted in transit
- HSTS headers (force HTTPS)
- Certificate pinning (mobile app)

**CORS:**
- Allow pokza.com, www.pokza.com, app.pokza.com
- Preflight checks on complex requests
- No credentials allowed cross-domain

### Data Security

**Encryption at rest:**
- Database encrypted (Supabase default)
- S3 objects encrypted
- Backups encrypted

**Secrets management:**
- Environment variables stored in Railway secrets
- Never commit `.env` files
- Rotate API keys quarterly

**RLS (Row Level Security):**
- Enforced at database level
- Users can only see own data (or public data)
- No data leaks via accidental SQL mistakes

### Authentication & Authorization

**JWT tokens:**
- Expires in 1 hour (short-lived)
- Refresh tokens last 7 days
- Signed with Supabase secret key

**Permissions:**
- Users can only create posts as themselves
- Users can only edit own comments
- Coaches verified before listed in directory
- Moderators can remove posts/comments

### Input Validation

**Every request validated:**
- Schema validation (Zod)
- Type checking (TypeScript)
- SQL injection prevented (parameterized queries)
- XSS prevented (React escapes by default)

### Third-party Security

**Stripe:**
- PCI compliant (no credit cards stored)
- Payment data handled by Stripe, not Pokza

**Sendgrid:**
- Unsubscribe links on all emails
- No sensitive data in email body

---

## 12. Performance

### Optimization Targets

**Mobile:**
- App size: < 50MB (Android), < 60MB (iOS)
- Cold start: < 2 seconds
- List scroll fps: 60fps

**Web:**
- First contentful paint: < 2 seconds
- Time to interactive: < 4 seconds
- Lighthouse score: > 90

**API:**
- Feed load: < 200ms
- Hand replay: < 100ms
- Coaching booking: < 500ms

### Optimization Tactics

**Frontend:**
- Code splitting (load only necessary code per page)
- Image lazy loading (scroll into view before loading)
- Memoization (React.memo for expensive components)
- Virtual lists (only render visible items)

**Backend:**
- Database indexing (optimize queries)
- Query caching (Redis)
- Batch operations (reduce round-trips)
- Compression (gzip responses)

**Network:**
- CDN (serve static files from edge)
- HTTP/2 (faster multiplexing)
- Preload critical resources

---

## Summary

**Architecture is:**
- ✅ **Scalable:** Stateless backend, database replicas, caching
- ✅ **Resilient:** Automatic backups, instant rollback, load balancing
- ✅ **Secure:** Encrypted, validated, RLS at DB level
- ✅ **Fast:** CDN, caching, optimized queries
- ✅ **Maintainable:** TypeScript, clear separation of concerns, monitoring

**Ready to handle:**
- 100K+ concurrent users
- 1M+ hands per month
- 99.9% uptime SLA
- Sub-500ms API latency (p95)

