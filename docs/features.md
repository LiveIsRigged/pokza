# Features & Capabilities

Complete feature inventory for Pokza. Prioritized by MVP criticality.

---

## P0: MVP Essentials (Launch)

These features MUST exist for V1 launch. Without them, Pokza is not viable.

---

### Core Hand Creation & Replayer

#### P0.1: Live Hand Creation Wizard
**User Value:** Players can create & publish hands from their phone in 5 minutes without poker software.

**What it does:**
- 7-step wizard: context → hero cards → street actions (preflop/flop/turn/river) → showdown → publish
- Drag-and-drop card selection
- Visual action entry (Fold/Check/Call/Bet/Raise with amount input)
- All-in handling built-in
- Stack tracking per street
- Undo at every step

**Complexity:** High (state management, input validation, game logic)

**Impact Business:** Critical. This is the core value prop. Without it, no content creation.

**Launch Status:** MVP-ready (in dev, needs completion)

---

#### P0.2: Interactive Hand Replayer
**User Value:** Watch hands replay with smooth animations, understand action flow, learn from plays.

**What it does:**
- Elliptical table visualization with 6-seat positions
- Animated card reveals (3D flip)
- Chip movement animations (arc trajectory to center pot)
- Play/pause/step forward/step backward controls
- Speed control (0.5x, 1x, 2x)
- Action callout (text description in center: "UTG raises to 100")
- Fold fading
- Card/stack display per seat
- Responsive layout (portrait/landscape)

**Complexity:** Medium-High (SVG rendering, animation timing, state sync)

**Impact Business:** Critical. Core engagement loop. If replayer sucks, app sucks.

**Launch Status:** MVP-ready (mostly complete, needs polish)

---

#### P0.3: Showdown Card Assignment
**User Value:** Optionally reveal villain hole cards to show what actually happened. Learn from villain plays.

**What it does:**
- After river, optional step to assign cards to each villain still in hand
- Card picker with exclusion (no duplicates)
- Cards persist and show in replayer
- Saves to hand data

**Complexity:** Low (UI + data storage)

**Impact Business:** Medium. Nice-to-have for educational value, not critical for launch.

**Launch Status:** MVP-ready (implemented)

---

### Publishing & Feed

#### P0.4: Feed (Home Page)
**User Value:** Discover hands from friends, coaches, and the community. Endless scroll.

**What it does:**
- Chronological feed of published hands
- Infinite scroll with pagination
- Each post shows: user avatar, hand description, replayer preview, action bar
- Pull-to-refresh (mobile)
- Filter by: All / Following / My hands (optional for MVP)

**Complexity:** Medium (backend pagination, caching, feed algorithm)

**Impact Business:** Critical. This is where engagement happens.

**Launch Status:** MVP-ready (basic version exists)

---

#### P0.5: Hand Publication & Post Metadata
**User Value:** Share a hand with description, question, and game context.

**What it does:**
- Hand gets title, optional vote question, optional description
- Visibility: Public / Private / Friends-only
- Game type, stakes, location stored
- Timestamp auto-generated
- Published hands appear in feed immediately

**Complexity:** Low (API endpoint + database)

**Impact Business:** Critical. Without publishing, no community.

**Launch Status:** MVP-ready

---

#### P0.6: Post Actions (Like, Comment, Share)
**User Value:** React to hands, start discussions, share with others.

**What it does:**
- ❤️ Like button (with count)
- 💬 Comment button (open comments section)
- 🔗 Share button (copy link, native share sheet)
- 📌 Save button (bookmark for later)

**Complexity:** Low (API endpoints for likes/comments/saves)

**Impact Business:** High. Engagement metrics. Social proof.

**Launch Status:** Needs implementation

---

#### P0.7: Comments & Discussions
**User Value:** Debate strategy, ask questions, learn from others' opinions.

**What it does:**
- Comment section on each post
- Nested replies (comments → replies)
- Sort: Newest / Most liked
- Reply notifications (see below)
- Mention system: @username

**Complexity:** Medium (nested data, sorting, pagination)

**Impact Business:** High. Core community feature.

**Launch Status:** Needs implementation

---

### User Profiles & Social

#### P0.8: User Profiles
**User Value:** Show your stats, hands, identity in the community.

**What it does:**
- Profile header with avatar, name, handle, bio
- Stats: Hands shared, Followers, Win rate, Win/Loss record
- Tab view: Hands (grid) / Analyses / Comments
- Hand gallery (infinite scroll)
- Edit profile button (for own profile only)
- Follow/Unfollow button (for others' profiles)

**Complexity:** Medium (profile data structure, tabs, pagination)

**Impact Business:** High. Identity + social proof.

**Launch Status:** Needs implementation

---

#### P0.9: Follow/Followers System
**User Value:** Build a network. Follow coaches, friends, and pro players.

**What it does:**
- Follow button on profiles
- Followers count displayed
- Following count displayed
- "Following" filter in feed (see only followed players' hands)
- Notification when someone follows you

**Complexity:** Low (relationship table, feed filtering)

**Impact Business:** High. Network effect. Retention.

**Launch Status:** Needs implementation

---

#### P0.10: User Authentication & Profiles
**User Value:** Create an account, secure your data.

**What it does:**
- Email/password signup
- Email verification
- Password reset
- Persistent session (remember login for 30 days)
- Logout

**Complexity:** Medium (auth best practices, security)

**Impact Business:** Critical. Legal requirement.

**Launch Status:** Needs implementation

---

### Search & Discovery

#### P0.11: Basic Search
**User Value:** Find hands, players, topics.

**What it does:**
- Search bar (top of app)
- Search by: Player name, hand description, game type
- Results: Players / Hands
- Click to view

**Complexity:** Medium (elasticsearch or similar, indexing)

**Impact Business:** Medium. Helps discoverability.

**Launch Status:** Post-MVP (nice-to-have)

---

### Notifications

#### P0.12: Notifications Tab
**User Value:** See who liked, commented, followed, replied to you.

**What it does:**
- Notifications center
- Types: Like, Comment, Reply, Follow, @mention
- Show avatar, player name, action ("liked your hand"), timestamp
- Mark as read / Clear all
- Click to go to relevant hand/profile

**Complexity:** Medium (notification queue, real-time or periodic)

**Impact Business:** High. Drives re-engagement.

**Launch Status:** Needs implementation

---

### Design & Premium Feel

#### P0.13: Design System Implementation
**User Value:** App looks beautiful and feels premium.

**What it does:**
- Navy + Gold color scheme
- Fraunces typography (headings)
- Smooth animations (card reveals, transitions)
- Dark mode support
- Responsive layouts

**Complexity:** Medium (design consistency across all screens)

**Impact Business:** High. First impression. Retention.

**Launch Status:** In progress (needs polish)

---

### Core Game Logic

#### P0.14: Multi-Street Betting Logic
**User Value:** Correctly handle all betting actions across preflop/flop/turn/river.

**What it does:**
- Track action order per street
- Handle re-raises (action resets)
- Track contributions per player per street
- Calculate pot
- Handle all-in (stack capping)
- Validate betting (can't raise less than previous, can't bet more than stack)

**Complexity:** High (game theory, edge cases)

**Impact Business:** Critical. Wrong logic = wrong game = no credibility.

**Launch Status:** MVP-ready (mostly complete)

---

### Mobile App Basics

#### P0.15: Cross-Platform Mobile (iOS + Android)
**User Value:** Works on iPhone and Android.

**What it does:**
- Native-like UI on both platforms
- Touch-optimized (44px buttons)
- Fast load times
- Offline support (view cached hands)

**Complexity:** Medium (React Native, platform-specific testing)

**Impact Business:** Critical. 90%+ of users on mobile.

**Launch Status:** In progress (Expo)

---

---

## P1: Launch + 3 Months

Important features that unlock second-order value. Launch MVP first, add these in weeks 2-8.

---

### Analytics & Stats

#### P1.1: Hand Statistics Dashboard
**User Value:** See your win rate, profit, position breakdown, opponent stats.

**What it does:**
- Personalized dashboard
- Key metrics: Hands played, Win rate, Profit, ROI
- Charts: Win rate over time, profit by position, profit by game type
- Filters: Date range, position, game type, stack size
- Leaderboard: Best hands, worst beats

**Complexity:** Medium (data aggregation, charting)

**Impact Business:** High. Retention (players want to see progress). Monetization opportunity.

---

#### P1.2: Opponent Database
**User Value:** Understand opponents you've played against.

**What it does:**
- List of opponents with stats
- Win rate vs them, hands played, favorite position
- Exploits (how to beat them)
- Filter: By game, by time period

**Complexity:** High (data aggregation, opponent matching)

**Impact Business:** Medium-High. Advanced players love this.

---

### Coaching & Education

#### P1.3: Coach Profiles & Verification
**User Value:** Identify real coaches, filter by specialization.

**What it does:**
- Coaches can mark themselves as "Coach"
- Verification badge (manual review)
- Specialization tags: "Preflop", "Postflop", "Tournament", "Cash", "PLO", etc.
- Hourly rate (optional)
- "Available for coaching" toggle
- Bio and credentials

**Complexity:** Low-Medium (profile customization, badge system)

**Impact Business:** High. Unlocks coaching marketplace.

---

#### P1.4: Coaching Mode (Private Analysis)
**User Value:** Coaches can give private feedback to students.

**What it does:**
- Coach can "claim" a student's hand for private analysis
- Coach adds annotations (voiceover or text comments)
- Student-only visibility (private)
- Notifications sent to student
- Versioning (multiple coaches can analyze same hand)

**Complexity:** Medium-High (permissions, versioning, annotation system)

**Impact Business:** Medium. Unlock B2B (coaching). Retention for coaches.

---

#### P1.5: Educational Content (Curated Collections)
**User Value:** Learn strategy from best hands in the community.

**What it does:**
- Curated "collections" of hands: "Best 3bets", "Fold equity plays", "Hero folds"
- Admin or verified coaches can create collections
- Hands tagged and searchable
- Linear progression (learn from simple to complex)

**Complexity:** Medium (curation, tagging, collection management)

**Impact Business:** Medium. Engagement. Educational moat.

---

### Social Features

#### P1.6: Direct Messages (1-on-1 Chat)
**User Value:** Private conversations between players/coaches.

**What it does:**
- Chat tab
- Send text messages
- Message notifications
- Block/unblock users
- Typing indicators (optional)

**Complexity:** Medium (real-time messaging, database)

**Impact Business:** Medium. Retention. Coach-student relationships.

---

#### P1.7: Groups / Private Communities
**User Value:** Create private communities for teams, study groups, coaching groups.

**What it does:**
- Create group (name, description, avatar)
- Invite members (email or link)
- Group feed (only members see posts)
- Group chat (like Discord channel)
- Admin controls (kick member, delete)

**Complexity:** High (permissions, nested feeds, moderation)

**Impact Business:** High. Stickiness. Turns casual players into engaged communities.

---

#### P1.8: Reactions to Comments
**User Value:** React to comments without replying (👍, ❤️, 😂, 🔥, etc.).

**What it does:**
- 5-6 emoji reactions to comments
- Show count per reaction
- Click to add/remove

**Complexity:** Low (simple emoji counting)

**Impact Business:** Low. UX polish. Encourages discussion.

---

### Content Moderation & Safety

#### P1.9: Report & Moderation System
**User Value:** Block toxic players, report inappropriate content.

**What it does:**
- Report button on posts/comments
- Report reason: Offensive, Spam, Misinformation, Other
- Moderator dashboard (admin only) to review
- Ban/mute users
- Delete posts
- Moderation log

**Complexity:** Medium (moderation workflow, admin UI)

**Impact Business:** Critical. Protect community from toxicity.

---

#### P1.10: Block Users
**User Value:** Don't see posts from annoying players.

**What it does:**
- Block button on profiles
- Blocked users' posts filtered from feed
- Blocked user can't see your profile (optional)
- Unblock anytime

**Complexity:** Low (filter logic)

**Impact Business:** Medium. User safety.

---

### Discovery & Feed Improvements

#### P1.11: Hashtags & Topics
**User Value:** Discover hands about specific topics (#3bet, #cooler, #badbeat).

**What it does:**
- Posts can include hashtags
- Hashtag feed (tap hashtag to see all posts with that tag)
- Trending hashtags widget (optional)
- Hashtag suggestions while typing

**Complexity:** Low-Medium (tagging, feed filtering)

**Impact Business:** Medium. Discoverability.

---

#### P1.12: Advanced Feed Filters
**User Value:** See only hands relevant to you (by position, game type, stakes).

**What it does:**
- Filter by: Position, Game type (Cash/Tourney), Stake range, Result (Won/Lost)
- Save filters as favorites
- Feed updates live as you filter

**Complexity:** Low (UI filter logic)

**Impact Business:** Medium. Engagement (users find more relevant content).

---

### Notifications & Engagement

#### P1.13: Push Notifications
**User Value:** Get notified when someone likes/comments on your hand.

**What it does:**
- Push notification on mobile for: Like, Comment, Reply, Follow, Mention
- User can customize notification preferences (all, important only, none)
- Notification badge on app icon
- Opt-out globally or per event type

**Complexity:** Medium (push infrastructure)

**Impact Business:** High. Retention driver.

---

### Data Export & Privacy

#### P1.14: Hand Export (PDF / CSV)
**User Value:** Export hands for personal records, coaching analysis, or import to poker software.

**What it does:**
- Export single hand as PDF (print-friendly)
- Export all hands as CSV
- Export format compatible with PokerTracker / Hold'em Manager (optional)

**Complexity:** Low-Medium (PDF generation, CSV export)

**Impact Business:** Low. Nice-to-have for advanced users.

---

---

## P2: Post-Launch Growth (Months 3-6)

Features that expand market and monetization. Add after P0 + P1 are solid.

---

### Monetization

#### P2.1: Subscription Tiers (Premium)
**User Value:** Unlock advanced analytics, ad-free experience, coaching directory.

**What it does:**
- Free tier: Create hands, share, basic feed
- Premium ($9/month): Advanced stats, ad-free, coach directory, early feature access
- Coach tier ($19/month): Premium + appear in coach directory, private analysis, student management

**Complexity:** Medium (subscription logic, feature gating, billing)

**Impact Business:** Critical for revenue.

---

#### P2.2: In-App Purchases (Optional Cosmetics)
**User Value:** Customize avatar, badges, hand themes (vanity).

**What it does:**
- Avatar frames ($0.99)
- Username badges ($1.99)
- Custom replayer themes (night mode, neon, etc.) ($2.99)
- Emoji reactions packs ($0.99)

**Complexity:** Low (cosmetic storage, IAP integration)

**Impact Business:** Low-Medium revenue. Engagement signal.

---

#### P2.3: Sponsored Content & Ads
**User Value:** (Advertiser value) Reach poker players.

**What it does:**
- Sponsored hands in feed (clearly marked)
- Poker training course ads
- Affiliate links (poker sites, tools)
- Banner ads (optional on web)
- No intrusive video ads

**Complexity:** Medium (ad serving, fraud detection)

**Impact Business:** Medium revenue stream.

---

### Advanced Analytics

#### P2.4: GTO & Solver Integration (Optional)
**User Value:** See optimal plays using solver data.

**What it does:**
- Link to GTO+ or PioSOLVER for ranges
- Show solver suggestion on specific street
- Compare your play to solver
- (Or: partner with solver company for integration)

**Complexity:** High (solver API, data licensing, education)

**Impact Business:** Medium. Differentiator.

---

#### P2.5: Hand Labeling & Tagging
**User Value:** Organize hands for later study (review, problems, etc.).

**What it does:**
- Custom tags: "Study", "Sick play", "Mistake", "Cooler", "Tournament"
- Color labels
- Smart search: Find hands tagged "Study" from last month
- Export tagged hands for cohesive review

**Complexity:** Low (tagging system, filtering)

**Impact Business:** Low. User organization tool.

---

### Video & Multimedia

#### P2.6: Video Replayer Commentary (Coach Feature)
**User Value:** Coaches can add video commentary to hands.

**What it does:**
- Coach can record video (in-app or upload)
- Video plays alongside replayer
- Sync with action timeline (video pauses at specific actions for discussion)
- Students watch analyzed hand with coach voiceover

**Complexity:** High (video upload, encoding, storage, sync)

**Impact Business:** Medium-High. Coaching differentiation.

---

#### P2.7: Hand Sharing to YouTube/Twitch
**User Value:** Content creators can easily export hands for streaming/YouTube.

**What it does:**
- Generate MP4 of hand replay (with sound/music)
- Auto-upload to YouTube (with OAuth)
- Preset themes for streaming (Twitch overlay)
- Automatically include hand description in description

**Complexity:** Medium (video encoding, YouTube API, CDN)

**Impact Business:** Medium. Viral distribution.

---

### Tournament Features

#### P2.8: Tournament Replay Support
**User Value:** Track entire tournament runs, replay key moments.

**What it does:**
- Create tournament (buy-in, blinds schedule)
- Log hands within tournament
- Tournament summary: Final position, profit, chip trajectory
- Replay any hand from tournament
- Stats: ROI, hand breakdown

**Complexity:** High (tournament data model, progression logic)

**Impact Business:** High. Tournament players are high-value users.

---

#### P2.9: Tournament Series Tracking
**User Value:** Track multi-day series or recurring games.

**What it does:**
- Group hands into "series" (e.g., "Vegas Trip 2024")
- Series stats: Total profit, hands played, ROI
- Comparison across series

**Complexity:** Low (grouping logic)

**Impact Business:** Low-Medium. Nice-for-tournament players.

---

### Community Moderation

#### P2.10: Community Guidelines & Education
**User Value:** Understand what behavior is expected.

**What it does:**
- In-app guidelines (tone, respect, no real-money betting promotion)
- Tooltips on first use
- Report reason explanations
- Moderation actions log (transparency)

**Complexity:** Low (UI + docs)

**Impact Business:** Low. Protects brand.

---

#### P2.11: Verified Users & Badges
**User Value:** Know who's legit (pros, streamers, coaches).

**What it does:**
- Verification badge system
- Types: Pro player (X GTO rank), Streamer (X followers), Coach (verified), Ambassador
- Manual verification process by Pokza team

**Complexity:** Medium (verification workflow)

**Impact Business:** Medium. Trust signal.

---

### Desktop Web App

#### P2.12: Full Web Version
**User Value:** Access Pokza from desktop (laptop, desktop).

**What it does:**
- Responsive web app
- Feature parity with mobile (except camera for hand photos)
- PWA (installable)
- Dark mode
- Better for long-form content (analyses, discussions)

**Complexity:** Medium (web framework setup, responsive design)

**Impact Business:** Medium. Reach desktop audience. Better for content consumption.

---

### Analytics & Reporting

#### P2.13: Custom Reports
**User Value:** Generate custom performance reports (for coaches, serious players).

**What it does:**
- Select date range, filters (position, game, stakes)
- Generate report: PDF or PNG
- Include graphs, tables, summary stats
- Export for analysis or sharing

**Complexity:** Medium (PDF generation, charting)

**Impact Business:** Low. Advanced user feature.

---

---

## P3: Scaling & Ecosystem (6-12 Months+)

Big ideas that require scale and partnerships. Do after P0 + P1 + P2.

---

### Platform Integration

#### P3.1: Live Game Parser (Poker Room Import)
**User Value:** Auto-import hands from PokerTracker 4, Hold'em Manager, or online sites.

**What it does:**
- Connect PokerTracker account (API)
- Auto-sync hands to Pokza
- Parse hand history (HH files)
- One-click import from WSOP, Binked, etc.

**Complexity:** Very High (multiple APIs, hand history parsing)

**Impact Business:** Very High. Unlock millions of existing hands. Network effect.

---

#### P3.2: Online Poker Site Direct Integration
**User Value:** Hands automatically streamed from your GTO+ session to Pokza.

**What it does:**
- Partner with poker sites (GGPoker, PokerStars, 888, etc.)
- Real-time hand sync
- Auto-publish or draft mode
- Hand notation auto-generated

**Complexity:** Very High (poker site APIs, regulatory)

**Impact Business:** Very High. Viral. Makes Pokza the social layer for online poker.

---

### Live Poker Features

#### P3.3: Live Stream Integration (Twitch/YouTube)
**User Value:** Watch live poker streams with side-by-side Pokza analysis.

**What it does:**
- Embed Twitch/YouTube stream
- Community live-chat with Pokza users
- Option to link hands played in stream to Pokza analysis
- Real-time hand notation (crowdsourced from viewers)

**Complexity:** High (streaming API, real-time sync)

**Impact Business:** High. Connects to massive Twitch poker audience.

---

#### P3.4: Live Table Integration (Phone + Camera)
**User Value:** Capture live poker hands in-person (note taking at table).

**What it does:**
- Quick hand entry at table (minimal inputs)
- Optional: Camera capture of table for reference
- Live sync (if WiFi available)
- Batch sync later (offline mode)
- Timestamp auto-inserted

**Complexity:** Medium (mobile camera, offline sync, data validation)

**Impact Business:** Medium-High. Huge for live players.

---

### Marketplace & Monetization

#### P3.5: Coaching Marketplace
**User Value:** Book sessions with coaches directly from Pokza.

**What it does:**
- Coaching profiles with rates, specialization, reviews
- Booking calendar integration
- Payment processing (Pokza takes 20% cut)
- Lesson notes auto-synced to hands
- Rating system for coaches

**Complexity:** High (payment processing, scheduling, escrow)

**Impact Business:** Very High. B2B revenue. High AOV.

---

#### P3.6: Study Materials & Courses (Marketplace)
**User Value:** Buy courses, training packs, hand ranges from pros.

**What it does:**
- Coaches/pro players sell courses on Pokza
- DRM-protected video content
- Interactive quizzes
- Progress tracking
- Pokza takes 30% cut

**Complexity:** High (payment, DRM, content management)

**Impact Business:** High. High-margin revenue.

---

#### P3.7: Hand Database Licensing (B2B)
**User Value:** (Poker software companies) Access anonymized hand data for research.

**What it does:**
- Aggregate anonymized hand data (with consent)
- License to poker software (PokerTracker, GTO+, etc.)
- Research partnerships with universities
- No user PII exposed

**Complexity:** Medium (data aggregation, anonymization, contracts)

**Impact Business:** Medium. Premium B2B revenue.

---

### AI & Personalization

#### P3.8: AI-Powered Hand Analysis
**User Value:** Auto-analysis of your hands (ranges, sizing, line consistency).

**What it does:**
- Upload hand (or auto-sync from PokerTracker)
- AI analyzes: Hand strength, opponent ranges, EV
- Generates report: "You overfolded to 3bets preflop", "Your bet sizing was +EV"
- Training recommendations based on leaks
- Compare to solver (if available)

**Complexity:** Very High (ML model training, poker engine)

**Impact Business:** Very High. Monetize as premium feature. Differentiation.

---

#### P3.9: Personalized Feed Algorithm
**User Value:** See hands most relevant to you (by position, game type, results).

**What it does:**
- ML algorithm learns: Which hands you engage with
- Recommends hands similar to your plays
- Prioritizes posts from followed players
- Suppresses low-engagement content
- Shuffle boost (randomize to discover new players)

**Complexity:** High (recommendation engine, data infrastructure)

**Impact Business:** High. Engagement. Retention.

---

#### P3.10: Smart Coaching Recommendations
**User Value:** Get coach recommendations based on your leaks.

**What it does:**
- AI analyzes your hands, identifies weakness
- Recommends coaches who specialize in that area
- Surface relevant courses/content
- A/B test recommendations

**Complexity:** High (leaks detection, matching algorithm)

**Impact Business:** High. Monetization (coaching, courses).

---

### Community & Social

#### P3.11: Clubs & Teams
**User Value:** Create teams, compete in leagues, organize tournaments.

**What it does:**
- Create club (e.g., "NYC Poker Crew")
- Members can be added by invite or request
- Club feed (members-only)
- Leaderboard within club
- Club tournaments (run bracket with member hands)

**Complexity:** High (team logic, tournaments, permissions)

**Impact Business:** Medium. Retention (sense of belonging).

---

#### P3.12: Achievements & Leaderboards
**User Value:** Compete globally for achievements, bragging rights.

**What it does:**
- Global leaderboard: Highest win rate, most hands, most followers
- Achievements: "Posted 100 hands", "Got 1000 likes", "Coached 10 students"
- Badges on profile
- Monthly competitions (e.g., "Best line of the month")

**Complexity:** Medium (leaderboard DB, achievement logic)

**Impact Business:** Medium. Engagement. Social proof.

---

#### P3.13: Podcasts & Audio Content
**User Value:** Listen to poker analysis while commuting.

**What it does:**
- Coaches can upload audio/podcast
- Auto-transcribe (using AI)
- Link to hands being discussed
- Podcast directory/search

**Complexity:** Medium (audio hosting, transcription)

**Impact Business:** Low. Content moat.

---

### Regulation & Compliance

#### P3.14: Legal Hand Import (Licensed Poker Rooms)
**User Value:** Seamlessly import hands from licensed online rooms (no fraud risk).

**What it does:**
- Partnerships with PokerStars, GGPoker, 888 (in legal jurisdictions)
- Verified API access to player's hand history
- Regulatory compliance (no money movement on Pokza)
- Geographic restrictions based on jurisdiction

**Complexity:** Very High (legal, compliance, API work with poker sites)

**Impact Business:** Very High. Unlock massive user base.

---

#### P3.15: Anonymous Hand Sharing (GDPR/Privacy)
**User Value:** Share hands without revealing opponent names.

**What it does:**
- Option to anonymize opponents' identities
- Blur opponent names in replayer
- Pseudonymize for privacy

**Complexity:** Low (UI toggle, data masking)

**Impact Business:** Low. Compliance feature.

---

### Mobile App Enhancements

#### P3.16: Offline Hand Creation
**User Value:** Create hands without internet (sync when you're back online).

**What it does:**
- Offline mode (cache app shell)
- Create hands in airplane/no WiFi
- Auto-sync when online
- Draft handling (don't lose work)

**Complexity:** Medium (offline storage, sync logic)

**Impact Business:** Low. UX polish.

---

#### P3.17: Hand Notifications (Intelligent)
**User Value:** Get notified about the most engaging discussions on your hands.

**What it does:**
- Notification when coach comments on your hand
- Notification when hand reaches X likes
- Mention notifications only (not every comment)
- Mute specific threads

**Complexity:** Low (notification filtering)

**Impact Business:** Medium. Retention.

---

### Analytics for Business

#### P3.18: Creator Analytics Dashboard
**User Value:** See how your content performs (views, engagement, reach).

**What it does:**
- Views over time, peak times
- Engagement rate (likes / views)
- Top-performing hands
- Follower growth
- Click-through rate (from profile to hands)

**Complexity:** Medium (analytics pipeline)

**Impact Business:** Low. Creator retention.

---

---

## Summary Table

| Category | P0 | P1 | P2 | P3 |
|----------|----|----|----|----|
| Core Hand Creation | 2 | - | 1 | - |
| Publishing & Feed | 4 | 2 | 2 | 1 |
| User Profiles & Social | 3 | 3 | 2 | 2 |
| Analytics | - | 2 | 3 | 2 |
| Coaching | - | 3 | 1 | 2 |
| Moderation | - | 2 | 1 | 1 |
| Monetization | - | - | 3 | 3 |
| Platform Integration | - | - | - | 3 |
| AI & ML | - | - | - | 4 |
| **Total** | **15** | **12** | **13** | **18** |

---

## Launch Criteria (MVP Definition)

Pokza MVP launches when P0 features are 100% complete AND tested:

✅ Hand creation wizard (all 7 steps)
✅ Replayer (smooth animations, all controls)
✅ Showdown card assignment (optional but polished)
✅ Feed (infinite scroll, clean design)
✅ Publishing (title, description, visibility)
✅ Post actions (like, comment, share)
✅ Comments & discussions (nested, sortable)
✅ User profiles (public + private)
✅ Follow system (follow/followers)
✅ Authentication (signup, login, logout)
✅ Search (basic player/hand search)
✅ Notifications (activity tab)
✅ Design system (implemented across all screens)
✅ Mobile app (iOS + Android via Expo)
✅ Multi-street betting logic (correct game logic)

**Launch Date Estimate:** 8-10 weeks from now (if team is 2-3 engineers + 1 designer)

---

## Roadmap by Month

**Month 1-2 (P0):** MVP launch
**Month 3-4 (P1): Growth phase (analytics, coaching, social, ads)**
**Month 5-6 (P2): Monetization & advanced features (subscriptions, marketplace)**
**Month 7-12 (P3): Scale & ecosystem (parsers, AI, live poker)**

