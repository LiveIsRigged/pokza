# Product Requirements Document (PRD)

**Last updated:** 2026-07-19  
**Version:** V0 (Lean MVP - Revised per STRATEGIC_PLAN.md)  
**Status:** In Development

---

## 1. Overview

Pokza is a social platform for poker players to share, analyze, and learn from poker hands. The MVP focuses on one core use case: allowing players to quickly create, share, and discuss poker hands in a beautiful, fast interface.

**Mission:** Become Strava for poker. Track your poker journey, learn from others, build community.

**Target User:** Poker players (serious amateurs to semi-pros) who want to improve through hand analysis and community feedback.

**Market:** ~50M casual poker players globally, ~2M serious players who pay for training. Binked validates demand (50K users, profitable).

---

## 2. Product Principles (from PRODUCT_PRINCIPLES.md)

Every feature must align with these core principles:

1. **Simplicity** — Poker is complex enough. UI is intuitive, fast, minimal.
2. **Confidentiality** — Players control hand visibility. Private by default, public by choice.
3. **Community** — Value comes from peer feedback, not algorithms.
4. **Sharing** — Make it insanely easy to share hands (1-2 clicks).
5. **Pedagogy** — Platform teaches players through community wisdom.
6. **Premium Design** — Beautiful, intentional, premium aesthetic (vs. Binked's dated UI).

**Decision Framework:** When adding features, ask:
- Does it serve one of these 6 principles?
- Does it reduce clicks to core action (create hand)?
- Does it increase time-on-app or community engagement?
- Is it premium, not clunky?

If "no" to 2+ questions → don't build.

---

## 3. V0 MVP Specification (Lean)

**Scope:** 6 features only (revised from original 25).

### 3.1 Core Features

#### Feature 1: Hand Creation
- **Description:** Users fill out simple form to record a poker hand.
- **User flow:** New user → Signup → Create first hand → Publish → Done.
- **Form fields:**
  - Game type (dropdown: 6max, HU, full ring, tournament)
  - Stakes (text: "2/4" for cash, "50+10" for tournament)
  - Hero position (dropdown: SB, BTN, CO, HJ, LJ, UTG)
  - Hero cards (text input: "As Kh" format)
  - Board (text input: "Jh 9d 3c / 2s / Kh" format)
  - Result (radio: Win, Loss, Fold)
  - Optional title (text)
  - Optional description (textarea)
- **NOT included in V0:** Showdown cards, action tracking, all-in logic, complex betting sequences
- **Success criteria:** User creates and publishes hand in < 90 seconds

#### Feature 2: Hand Replay (Static)
- **Description:** Beautiful visualization of hand: hero cards + board + result.
- **Display:**
  - Hero cards (large, centered)
  - Board (flop / turn / river)
  - Result badge (Win/Loss/Fold with color)
  - Profit/loss display (if provided)
- **NOT included in V0:** Play/pause buttons, action animations, villain cards
- **Success criteria:** Page loads in < 200ms, cards are visible and readable

#### Feature 3: Feed
- **Description:** Chronological list of all public hands shared by followed players + global feed.
- **Tabs:** Home (following), Explore (all public hands)
- **Display per hand:** Game type, stakes, hero position, result, creator name, timestamp, like/comment counts
- **Interaction:** Infinite scroll, tap to view detail
- **NOT included in V0:** Recommendation algorithm, trending, search, filters
- **Success criteria:** Load 50 hands, scroll smooth (<60fps), pagination works

#### Feature 4: User Profiles
- **Description:** Public profile showing user's hands and basic stats.
- **Display:** Username, avatar (optional), bio (optional), hands posted count, followers count, following count, grid of user's hands
- **Interaction:** Click to view user's hands, follow/unfollow button
- **NOT included in V0:** Detailed stats, analytics, opponent DB
- **Success criteria:** Profile loads < 200ms, hands grid displays correctly

#### Feature 5: Follow + Like
- **Description:** Social graph: follow users and like hands.
- **Follow:** Click "Follow" on profile → appears in home feed
- **Like:** Heart icon on hand → increments like count
- **NOT included in V0:** Unfollow confirmation, like animations, like notifications
- **Success criteria:** Follow/unfollow instant, like count updates correctly

#### Feature 6: Comments
- **Description:** Users can comment on hands (text only).
- **Interaction:** Text input, submit button, list of comments below hand
- **Display:** Commenter name, timestamp, comment text
- **NOT included in V0:** Nested replies, emoji reactions, mentions, edits
- **Success criteria:** Comments persist, load in < 200ms, delete own comment works

### 3.2 Technical Specification

#### Tech Stack
- **Frontend:** Next.js 14 (app router), React 18, Tailwind CSS
- **Mobile:** Responsive web (no native app in V0)
- **Backend:** Node.js 18+ Express.js, TypeScript
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (email/password)
- **Storage:** Cloudinary (images only)
- **Deployment:** Vercel (frontend), Railway (backend)
- **Monitoring:** Sentry (free tier)

#### Database Schema (V0 minimal)
```
users
├─ id (UUID, PK)
├─ email (string, UNIQUE)
├─ display_name (string)
├─ avatar_url (string, nullable)
├─ created_at (timestamp)

hands
├─ id (UUID, PK)
├─ user_id (FK → users)
├─ game_type (enum: 6max, hu, full_ring, tournament)
├─ stakes (string: "2/4" or "50+10")
├─ hero_position (enum: SB, BTN, CO, HJ, LJ, UTG)
├─ hero_cards (string: "AsKh")
├─ board (string: "Jh9d3c/2s/Kh")
├─ result (enum: win, loss, fold)
├─ title (string, nullable)
├─ description (text, nullable)
├─ visibility (enum: public, private) -- default public
├─ created_at (timestamp)
├─ updated_at (timestamp)

posts
├─ id (UUID, PK)
├─ hand_id (FK → hands)
├─ is_published (boolean)
├─ published_at (timestamp, nullable)

follows
├─ follower_id (FK → users, PK part 1)
├─ following_id (FK → users, PK part 2)
├─ created_at (timestamp)
├─ UNIQUE(follower_id, following_id)

likes
├─ hand_id (FK → hands, PK part 1)
├─ user_id (FK → users, PK part 2)
├─ created_at (timestamp)
├─ UNIQUE(hand_id, user_id)

comments
├─ id (UUID, PK)
├─ hand_id (FK → hands)
├─ user_id (FK → users)
├─ content (text)
├─ created_at (timestamp)
├─ updated_at (timestamp)
```

#### API Endpoints (V0 minimal)

**Auth:**
- POST /auth/signup (email, password) → JWT
- POST /auth/login (email, password) → JWT
- POST /auth/logout
- GET /auth/me → Current user

**Hands:**
- POST /api/hands (create)
- GET /api/hands/{id} (view single)
- GET /api/feed (list public hands, paginated)
- GET /api/users/{id}/hands (user's hands)

**Users:**
- GET /api/users/{id} (public profile)
- PATCH /api/users/me (update own profile)
- POST /api/users/{id}/follow (follow)
- DELETE /api/users/{id}/follow (unfollow)
- GET /api/users/{id}/followers (list)

**Engagement:**
- POST /api/hands/{id}/like (like)
- DELETE /api/hands/{id}/like (unlike)
- POST /api/hands/{id}/comments (comment)
- DELETE /api/comments/{id} (delete comment)

### 3.3 Design Specification (from DESIGN_SYSTEM.md)

**Colors:**
- Navy: #16233D (primary, table felt aesthetic)
- Gold: #C9A227 (accents, CTAs)
- Orange: #E8571F (energy, secondary CTAs)
- Parchemin: #EDEAE2 (background)
- Dark gray: #333 (text on light), white (text on dark)

**Typography:**
- Headings: Fraunces (serif, 600 SemiBold)
- Body: Inter (sans-serif)
- Code: JetBrains Mono

**Type Scale:**
- H1: 48px, 600
- H2: 36px, 600
- H3: 28px, 600
- H4: 20px, 600
- Body Large: 16px, 400
- Body: 14px, 400
- Body Small: 12px, 400

**Spacing base:** 4px (use multiples: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)

**Component specifications:**
- Buttons: 44px height, pill-shaped (border-radius: 8px), navy bg + white text
- Cards: 8px border-radius, shadow, padding 20px
- Inputs: 44px height, navy border, 2px stroke
- Mobile: Responsive (max-width 100%, touch-friendly)

**Dark mode:** Support via @media (prefers-color-scheme: dark) + optional toggle

---

## 4. Success Criteria for V0

### Quantitative
- **Users:** 1K signups by week 12
- **Hands:** 50+ hands created (proof of usage)
- **Retention:** 40% day-7 retention
- **Performance:** < 500ms API latency (p95), < 2s page load
- **Uptime:** 99.5%

### Qualitative
- **NPS:** > 30 (users like it)
- **Code quality:** TypeScript strict mode, ESLint passing, > 70% test coverage
- **UX:** Hand creation flow takes < 90 seconds
- **Design:** Premium feel, Fraunces headers visible, gold accents on CTAs

---

## 5. Out of Scope (V0)

**Explicitly NOT included in V0:**

- ❌ Premium tier / payments (add in V1)
- ❌ Coaching features (add in V1)
- ❌ Push notifications (add in V1)
- ❌ Email digest (add in V1)
- ❌ Search feature (add in V1)
- ❌ Advanced analytics (add in V2)
- ❌ Opponent database (add in V2)
- ❌ Hand import from PokerTracker/HM (add in V2)
- ❌ Mobile native app (add in V2)
- ❌ Dark mode (add in V1)
- ❌ Emoji reactions (add in V2)
- ❌ Groups/communities (add in V2)
- ❌ Verification badges (add in V1)
- ❌ Leaderboard (add in V2)
- ❌ Tournament support (add in V2)
- ❌ Showdown cards (add in V1)
- ❌ Action history tracking (add in V1)
- ❌ Video recording (add in V2)
- ❌ Live streaming integration (add in V3)
- ❌ Multi-language support (add in V3)

**Rationale:** Every excluded feature adds 1-2 weeks to timeline. V0 must ship in 12-14 weeks to validate retention before building more.

---

## 6. User Personas

### Persona 1: Casual Grinder (Primary)
- **Name:** Alex
- **Background:** Plays poker 2-3x/week, $100-500 buy-ins
- **Goal:** Improve game, track progress, learn from others
- **Pain point:** No easy way to share hands with friends for feedback
- **Motivation to use Pokza:** Quick hand entry, beautiful replay, peer feedback
- **Retention levers:** Daily hand posting, comments from better players, leaderboard

### Persona 2: Serious Student (Primary)
- **Name:** Jordan
- **Background:** 2+ years experience, $1000+ buy-ins, studies poker seriously
- **Goal:** Reach pro status, analyze own game, find coaching
- **Pain point:** PokerTracker is ugly, Binked is limited, no good community
- **Motivation:** Premium features, coaching marketplace (V1+), hand analytics (V2+)
- **Retention levers:** Advanced stats, coach recommendations, opponent DB

### Persona 3: Creator/Influencer (Secondary, for V1+)
- **Name:** Pro_Streamer_Mike
- **Background:** Twitch poker streamer, 50K followers
- **Goal:** Engage audience, build poker community, monetize content
- **Pain point:** No easy way to share hands from stream, no creator revenue
- **Motivation:** Easy hand export, creator revenue share (V1+), stream integration (V3+)
- **Retention levers:** Creator analytics, sponsorship deals, audience engagement tools

---

## 7. Metrics & Analytics

### V0 Metrics to Track

**Acquisition:**
- Total signups (cumulative)
- Signups per day
- CAC by source (organic, influencer, ads)

**Engagement:**
- Daily active users (DAU)
- Hands created per day
- Comments per hand (average)
- Likes per hand (average)
- Session length (minutes)

**Retention:**
- Day-7 retention (critical KPI)
- Day-30 retention
- Churn rate per cohort

**Technical:**
- API latency (p50, p95, p99)
- Page load time
- Error rate (5xx, 4xx)
- Database query time

**Qualitative:**
- NPS (survey on week 4, 8, 12)
- User feedback (comments, emails)
- Feature usage (% who create hand, % who like, % who comment)

---

## 8. Development Phase & Timeline

### Phase 1: Foundation (Week 1-2)
- [ ] Supabase setup + auth
- [ ] Express backend skeleton
- [ ] Next.js frontend skeleton
- [ ] Deployment (Railway, Vercel)

### Phase 2: Core (Week 3-6)
- [ ] Hand creation endpoint + form
- [ ] Hand replay + feed
- [ ] User profiles
- [ ] Social (follow, like, comments)

### Phase 3: Polish (Week 7-10)
- [ ] UI/UX refinement
- [ ] Mobile responsiveness
- [ ] Bug fixes
- [ ] Performance optimization

### Phase 4: Launch (Week 11-14)
- [ ] App Store listings (web)
- [ ] Influencer outreach
- [ ] Product Hunt prep
- [ ] Launch + monitoring

---

## 9. Launch Checklist

Before shipping:
- [ ] All P0 TASKS.md tasks completed
- [ ] Day-7 retention tested (internal cohort)
- [ ] Latency < 500ms confirmed
- [ ] Zero critical bugs on main flows
- [ ] Legal review done (terms, privacy, regulations)
- [ ] Social media accounts ready
- [ ] 10 influencers primed to demo
- [ ] Sentry + monitoring configured
- [ ] Backup strategy tested

---

## 10. Document Updates & References

- **PRODUCT_PRINCIPLES.md** — Core values (simplicity, confidentiality, community, sharing, pedagogy, premium design)
- **DESIGN_SYSTEM.md** — UI/UX specs (colors, typography, components, dark mode)
- **TASKS.md** — Detailed task backlog (P0-P4)
- **STRATEGIC_PLAN.md** — Revised roadmap (V0-V3 with lean scope)
- **ROADMAP.md** — (Deprecated, use STRATEGIC_PLAN.md)

---

**Status:** Ready for development. First task: Setup Supabase project.

