# Database Architecture

**Platform:** Supabase (PostgreSQL + Auth + Realtime)

Complete database schema for Pokza, optimized for scaling to millions of hands.

---

## Architecture Overview

```
User System
├── users (core auth)
├── profiles (public data)
├── user_preferences (settings)
└── user_sessions (tracking)

Poker Core
├── hands (main entity)
├── seats (players in hand)
├── actions (street actions)
├── boards (community cards)
└── posts (publication metadata)

Social Graph
├── follows (relationships)
├── likes (engagement)
├── comments (discussions)
├── comment_replies (threading)
└── notifications (activity)

Coaching & Marketplace
├── coaches (coach profiles)
├── coaching_sessions (bookings)
├── session_reviews (feedback)
├── session_notes (analysis)
└── coach_specializations (tags)

Content & Discovery
├── posts (published hands)
├── post_tags (hashtags)
├── post_collections (curated)
├── search_index (full-text search)
└── trending_hands (computed daily)

Analytics & Reporting
├── hand_stats (computed per user)
├── opponent_database (stats vs players)
├── daily_metrics (aggregate stats)
└── user_analytics (engagement tracking)

Moderation & Trust
├── reports (community flagging)
├── moderation_actions (bans, etc.)
├── user_verifications (badges)
└── blocked_users (user blocking)

Business
├── subscriptions (premium tiers)
├── coaching_payments (transactions)
├── sponsor_campaigns (ads)
└── analytics_premium (feature usage)
```

---

## 1. User System Tables

### users

**Purpose:** Supabase auth table (extended with custom fields)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | Auto from Supabase auth |
| email | TEXT | UNIQUE, NOT NULL | Lowercased, verified |
| email_verified_at | TIMESTAMP | | NULL until verified |
| phone | TEXT | UNIQUE | Optional |
| password_hash | TEXT | NOT NULL | Managed by Supabase |
| last_sign_in_at | TIMESTAMP | | Auto-updated |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- email (UNIQUE, for login)
- email_verified_at (for filtering unverified users)
- created_at (for analytics)

**Constraints:**
- Email must be valid format (app-level or CHECK constraint)
- Phone must be unique if provided

---

### profiles

**Purpose:** Public user profile data (separate from auth for privacy)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK, FK → users.id | One-to-one |
| username | TEXT | UNIQUE, NOT NULL | @username, 3-30 chars, alphanumeric + underscore |
| display_name | TEXT | NOT NULL | User's public name (e.g., "Alex K") |
| bio | TEXT | | Max 300 chars |
| avatar_url | TEXT | | URL to avatar image (S3) |
| cover_url | TEXT | | URL to cover image (S3) |
| website | TEXT | | Optional personal website |
| location | TEXT | | City/region |
| poker_position | VARCHAR(20) | | Hero position (CO, BTN, etc.) |
| is_coach | BOOLEAN | DEFAULT false | Verified coach flag |
| coach_rate_per_hour | INTEGER | | NULL if not coach, in cents |
| coaching_bio | TEXT | | Bio specifically for coaching |
| coach_specializations | TEXT[] | | Array: ['Preflop', 'Postflop', 'Tournament'] |
| verification_badge | VARCHAR(50) | | NULL or 'pro', 'streamer', 'coach', 'ambassador' |
| total_hands_shared | INTEGER | DEFAULT 0 | Denormalized count (for sorting) |
| total_followers | INTEGER | DEFAULT 0 | Denormalized |
| total_following | INTEGER | DEFAULT 0 | Denormalized |
| win_rate | DECIMAL(5,2) | | Computed from hands, nullable |
| updated_at | TIMESTAMP | DEFAULT now() | |

**Indexes:**
- username (UNIQUE, for profile lookup)
- is_coach (for coach directory filtering)
- display_name (for search)
- verification_badge (for filtering verified users)

**Constraints:**
- username: alphanumeric + underscore, 3-30 chars (CHECK or app-level)
- coach_rate_per_hour: positive integer if is_coach = true
- display_name: NOT NULL, max 100 chars

**Note:** Denormalized counts (total_hands_shared, total_followers) are updated via triggers on INSERT/DELETE in related tables. This trades consistency for query performance.

---

### user_preferences

**Purpose:** Settings per user (notifications, privacy, display)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK, FK → users.id | One-to-one |
| theme | VARCHAR(20) | DEFAULT 'auto' | 'light', 'dark', 'auto' |
| notifications_enabled | BOOLEAN | DEFAULT true | Global mute |
| notifications_likes | BOOLEAN | DEFAULT true | Likes only |
| notifications_comments | BOOLEAN | DEFAULT true | Comments only |
| notifications_follows | BOOLEAN | DEFAULT true | Follow notifications |
| notifications_mentions | BOOLEAN | DEFAULT true | @mentions only |
| notifications_push | BOOLEAN | DEFAULT true | Push notifications |
| profile_visibility | VARCHAR(20) | DEFAULT 'public' | 'public', 'private', 'friends' |
| show_win_rate | BOOLEAN | DEFAULT true | Show stats publicly |
| allow_coaching_offers | BOOLEAN | DEFAULT true | Coaches can message about sessions |
| language | VARCHAR(5) | DEFAULT 'en' | ISO 639-1 (en, fr, de, etc.) |
| updated_at | TIMESTAMP | DEFAULT now() | |

**Constraints:**
- theme must be in ('light', 'dark', 'auto')
- profile_visibility must be in ('public', 'private', 'friends')

---

### user_sessions

**Purpose:** Track user activity for analytics and fraud detection

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id | NOT NULL |
| ip_address | INET | | IP address |
| user_agent | TEXT | | Browser user agent |
| device_type | VARCHAR(20) | | 'mobile', 'tablet', 'desktop' |
| platform | VARCHAR(20) | | 'iOS', 'Android', 'Web' |
| app_version | VARCHAR(20) | | e.g., '1.2.3' |
| last_activity_at | TIMESTAMP | | Auto-updated on each request |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| expires_at | TIMESTAMP | | Session expiry (30 days) |

**Indexes:**
- user_id + expires_at (for active sessions)
- created_at (for analytics)

**Constraints:**
- device_type in ('mobile', 'tablet', 'desktop')
- expires_at > now() (CHECK for active sessions)

**Retention:** Delete sessions older than 90 days (via cron)

---

## 2. Poker Core Tables

### hands

**Purpose:** Main entity. Represents a single poker hand.

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| post_id | UUID | UNIQUE, FK → posts.id | NULL until published |
| created_by | UUID | FK → users.id, NOT NULL | Creator's user ID |
| game_type | VARCHAR(20) | NOT NULL | 'cash', 'tournament', 'sng' |
| stakes | TEXT | NOT NULL | e.g., '2/5', '1000+1' (human-readable) |
| small_blind | INTEGER | NOT NULL | In cents |
| big_blind | INTEGER | NOT NULL | In cents |
| effective_stack | INTEGER | NOT NULL | In cents |
| num_players | SMALLINT | NOT NULL | 2-10 |
| hero_position | VARCHAR(20) | NOT NULL | UTG, CO, BTN, etc. |
| hero_cards | TEXT[] | NOT NULL | Array: ['As', 'Kd'] |
| board | JSONB | | {flop: ['Qs', 'Jd', '2c'], turn: 'Ts', river: '7h'} |
| actions | JSONB[] | NOT NULL | Array of action objects (see below) |
| final_result | VARCHAR(20) | | 'win', 'loss', 'split', 'abandoned' |
| pot_won | INTEGER | | Final pot amount in cents |
| profit_loss | INTEGER | | Win/loss amount in cents (nullable) |
| location | TEXT | | 'Club Circus Brussels' |
| tournament_level | TEXT | | e.g., '2/4 blinds' (for tournaments) |
| buy_in | INTEGER | | In cents (optional) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| deleted_at | TIMESTAMP | | Soft delete (NOT NULL = deleted) |

**Indexes:**
- created_by (for "My hands" view)
- created_at DESC (for feed)
- post_id (UNIQUE, for publication lookup)
- game_type (for filtering)
- hero_position (for stats by position)

**Constraints:**
- game_type IN ('cash', 'tournament', 'sng')
- hero_position IN (valid positions)
- effective_stack > 0
- small_blind < big_blind
- num_players BETWEEN 2 AND 10

**Action Object Schema (JSONB):**
```json
{
  "id": "preflop-0",
  "street": "preflop",
  "seat_id": "seat-123",
  "type": "raise",
  "amount": 2000,
  "order": 0
}
```

**Board Object Schema (JSONB):**
```json
{
  "flop": ["Qs", "Jd", "2c"],
  "turn": "Ts",
  "river": "7h"
}
```

---

### seats

**Purpose:** Players in a hand (one row per player)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| hand_id | UUID | FK → hands.id, NOT NULL | |
| seat_number | SMALLINT | NOT NULL | 1-10 (position at table) |
| user_id | UUID | FK → users.id | NULL for non-Pokza players |
| player_name | TEXT | NOT NULL | "Hero", "Villain", "UTG", etc. |
| position | VARCHAR(20) | NOT NULL | 'UTG', 'CO', 'BTN', 'SB', 'BB' |
| is_hero | BOOLEAN | NOT NULL | True if the creator's seat |
| starting_stack | INTEGER | NOT NULL | In cents |
| hole_cards | TEXT[] | | NULL if not revealed, e.g., ['As', 'Kd'] |
| final_stack | INTEGER | | Remaining stack at end |
| is_folded | BOOLEAN | DEFAULT false | Folded before showdown |
| result | VARCHAR(20) | | 'win', 'loss', 'split', 'folded' |

**Indexes:**
- hand_id (for queries by hand)
- user_id (for opponent database)
- is_hero (for finding hero seat quickly)

**Constraints:**
- position IN (valid positions)
- starting_stack > 0
- final_stack >= 0
- One seat per hand must have is_hero = true
- All positions must be unique per hand (no two SBs)

---

### actions

**Purpose:** Detailed action log (denormalized from hands.actions JSONB for analytics)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| hand_id | UUID | FK → hands.id, NOT NULL | |
| seat_id | UUID | FK → seats.id, NOT NULL | |
| street | VARCHAR(20) | NOT NULL | 'preflop', 'flop', 'turn', 'river' |
| action_type | VARCHAR(20) | NOT NULL | 'fold', 'check', 'call', 'bet', 'raise' |
| amount | INTEGER | | In cents (NULL for check/fold) |
| cumulative_amount | INTEGER | NOT NULL | Total contributed on this street |
| action_order | SMALLINT | NOT NULL | Order within street (1, 2, 3...) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- hand_id + street (for street-by-street replay)
- seat_id (for opponent action analysis)
- action_type (for filtering specific actions)

**Constraints:**
- street IN ('preflop', 'flop', 'turn', 'river')
- action_type IN ('fold', 'check', 'call', 'bet', 'raise')
- amount NULL for check/fold, NOT NULL for call/bet/raise
- cumulative_amount > 0

**Note:** This table is populated by a trigger on hands INSERT/UPDATE (denormalization for speed).

---

### boards

**Purpose:** Community cards (denormalized from hands.board for querying)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| hand_id | UUID | FK → hands.id, UNIQUE, NOT NULL | One-to-one |
| flop_1 | VARCHAR(2) | | 'As', 'Kd', NULL if preflop only |
| flop_2 | VARCHAR(2) | | |
| flop_3 | VARCHAR(2) | | |
| turn | VARCHAR(2) | | NULL if no turn |
| river | VARCHAR(2) | | NULL if no river |

**Indexes:**
- hand_id (UNIQUE, for lookup)
- (flop_1, flop_2, flop_3, turn, river) (for board runout analysis)

**Note:** Denormalized from hands.board for faster analytical queries.

---

### posts

**Purpose:** Published hand (when hand gets shared to feed)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| hand_id | UUID | FK → hands.id, UNIQUE, NOT NULL | One-to-one |
| created_by | UUID | FK → users.id, NOT NULL | Creator |
| title | TEXT | NOT NULL | Max 200 chars |
| description | TEXT | | Max 2000 chars |
| vote_question | TEXT | | "Should I have folded preflop?" |
| visibility | VARCHAR(20) | NOT NULL | 'public', 'private', 'friends_only' |
| tags | TEXT[] | | ['3bet', 'cooler', 'badbeat'] |
| featured_until | TIMESTAMP | | Sponsored hands featured longer |
| is_featured | BOOLEAN | DEFAULT false | Featured status |
| is_removed | BOOLEAN | DEFAULT false | Moderation flag |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- created_by (for profile feed)
- created_at DESC (for home feed)
- visibility (for public/private filtering)
- is_featured DESC, created_at DESC (for featured feed)
- tags (GIN index for hashtag search)

**Constraints:**
- visibility IN ('public', 'private', 'friends_only')
- title NOT NULL, max 200 chars
- hand_id must have is_removed=false on hands table
- featured_until > now() if is_featured = true

---

## 3. Social Graph Tables

### follows

**Purpose:** User follow relationships

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| follower_id | UUID | FK → users.id, NOT NULL | Who is following |
| following_id | UUID | FK → users.id, NOT NULL | Who is being followed |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- (follower_id, following_id) (UNIQUE, composite)
- following_id (for "followers" count)
- follower_id (for "following" list)

**Constraints:**
- follower_id != following_id (can't follow self)
- UNIQUE (follower_id, following_id)

---

### likes

**Purpose:** User reactions to posts

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| post_id | UUID | FK → posts.id, NOT NULL | |
| user_id | UUID | FK → users.id, NOT NULL | |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- (post_id, user_id) (UNIQUE, for "already liked" check)
- post_id (for like count)
- user_id (for "my likes" view)

**Constraints:**
- UNIQUE (post_id, user_id)
- user_id != (hand creator) at app level (can't like own post)

---

### comments

**Purpose:** Comments on posts

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| post_id | UUID | FK → posts.id, NOT NULL | |
| user_id | UUID | FK → users.id, NOT NULL | |
| content | TEXT | NOT NULL | Max 5000 chars |
| mentions | TEXT[] | | @usernames mentioned |
| is_edited | BOOLEAN | DEFAULT false | |
| edited_at | TIMESTAMP | | |
| deleted_at | TIMESTAMP | | Soft delete |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- post_id (for comment thread)
- user_id (for "my comments" view)
- created_at DESC (for chronological order)

**Constraints:**
- content NOT NULL, max 5000 chars
- mentions array (for @mention search)

---

### comment_replies

**Purpose:** Nested replies to comments (threading)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| comment_id | UUID | FK → comments.id, NOT NULL | |
| user_id | UUID | FK → users.id, NOT NULL | |
| content | TEXT | NOT NULL | Max 5000 chars |
| mentions | TEXT[] | | @usernames |
| is_edited | BOOLEAN | DEFAULT false | |
| edited_at | TIMESTAMP | | |
| deleted_at | TIMESTAMP | | Soft delete |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- comment_id (for reply thread)
- user_id (for "my replies")
- created_at DESC

**Constraints:**
- content NOT NULL, max 5000 chars

---

## 4. Coaching & Marketplace Tables

### coaches

**Purpose:** Verified coach profiles (extended from profiles table)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK, FK → users.id | One-to-one with profiles |
| hourly_rate | INTEGER | NOT NULL | In cents, e.g., 10000 (= $100) |
| availability_status | VARCHAR(20) | DEFAULT 'available' | 'available', 'full', 'on_break' |
| bio | TEXT | | Coaching-specific bio |
| specializations | TEXT[] | NOT NULL | ['Preflop', 'Postflop', 'Tournament'] |
| languages | TEXT[] | DEFAULT '{"English"}' | ['English', 'French', 'German'] |
| years_experience | SMALLINT | | Years playing poker |
| win_rate | DECIMAL(5,2) | | Coach's own win rate |
| session_count | INTEGER | DEFAULT 0 | Denormalized |
| average_rating | DECIMAL(3,2) | | 1.0 - 5.0 |
| verified_at | TIMESTAMP | | Manual verification |
| verification_badge_type | VARCHAR(50) | | 'pro', 'coach', 'verified_grinder' |
| calendar_url | TEXT | | Calendly/Acuity link |
| stripe_connect_id | TEXT | | Stripe account for payments |
| is_active | BOOLEAN | DEFAULT true | Can be deactivated |
| updated_at | TIMESTAMP | DEFAULT now() | |

**Indexes:**
- availability_status (for coach directory)
- average_rating DESC (for top coaches)
- verified_at (for filtering verified coaches)
- specializations (GIN for tag search)

**Constraints:**
- hourly_rate > 0
- average_rating BETWEEN 1.0 AND 5.0 OR NULL
- specializations NOT NULL, min 1 element
- verified_at NOT NULL iff verification_badge_type NOT NULL

---

### coaching_sessions

**Purpose:** Booked coaching sessions

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| coach_id | UUID | FK → coaches.id, NOT NULL | |
| student_id | UUID | FK → users.id, NOT NULL | |
| scheduled_at | TIMESTAMP | NOT NULL | When the session happens |
| duration_minutes | SMALLINT | NOT NULL | 30, 60, 90, 120 |
| rate_per_minute | DECIMAL(10,2) | NOT NULL | Computed from coach.hourly_rate |
| total_cost | INTEGER | NOT NULL | In cents |
| status | VARCHAR(20) | DEFAULT 'scheduled' | 'scheduled', 'completed', 'cancelled', 'no_show' |
| meeting_url | TEXT | | Zoom/Google Meet link |
| recording_url | TEXT | | Video recording (if approved) |
| notes_by_coach | TEXT | | Coach notes (visible to student) |
| student_feedback | TEXT | | Student's notes on session |
| rating | SMALLINT | | 1-5 star rating |
| payment_intent_id | TEXT | | Stripe payment ID |
| payment_status | VARCHAR(20) | DEFAULT 'pending' | 'pending', 'completed', 'failed', 'refunded' |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- coach_id + scheduled_at (for coach schedule)
- student_id + scheduled_at (for student bookings)
- status (for filtering active sessions)
- payment_status (for payment reconciliation)

**Constraints:**
- coach_id != student_id (can't coach self)
- duration_minutes IN (30, 60, 90, 120)
- scheduled_at > now() if status IN ('scheduled', 'completed')
- rating BETWEEN 1 AND 5 OR NULL
- total_cost > 0

---

### session_reviews

**Purpose:** Feedback on coaching sessions

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| session_id | UUID | FK → coaching_sessions.id, NOT NULL | |
| student_id | UUID | FK → users.id, NOT NULL | |
| rating | SMALLINT | NOT NULL | 1-5 |
| communication | SMALLINT | | 1-5 (how clear was coach?) |
| value_for_money | SMALLINT | | 1-5 (was it worth it?) |
| would_book_again | BOOLEAN | | |
| comment | TEXT | | Max 1000 chars |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- session_id (UNIQUE for one review per session)
- student_id (for "my reviews" view)

**Constraints:**
- rating, communication, value_for_money BETWEEN 1 AND 5
- One review per session (UNIQUE session_id)

---

## 5. Analytics Tables

### hand_stats

**Purpose:** Computed stats per user (updated daily via cron)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, UNIQUE, NOT NULL | One row per user |
| total_hands | INTEGER | DEFAULT 0 | Hands shared |
| total_sessions | INTEGER | DEFAULT 0 | Distinct games |
| win_count | INTEGER | DEFAULT 0 | Won hands |
| loss_count | INTEGER | DEFAULT 0 | Lost hands |
| win_rate | DECIMAL(5,2) | | (win_count / total_hands) * 100 |
| total_profit_loss | INTEGER | DEFAULT 0 | In cents |
| roi | DECIMAL(8,2) | | (profit_loss / buy_in) * 100 |
| avg_stack_size | INTEGER | | |
| favorite_position | VARCHAR(20) | | Most played position |
| biggest_win | INTEGER | | In cents |
| biggest_loss | INTEGER | | In cents |
| longest_winning_streak | SMALLINT | | Consecutive wins |
| by_position | JSONB | | {CO: {hands: 50, win_rate: 55.2}, ...} |
| by_game_type | JSONB | | {cash: {...}, tournament: {...}} |
| vs_opponents | JSONB | | {opponentId: {hands: 10, win_rate: 60}} |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- user_id (UNIQUE for lookup)
- win_rate DESC (for leaderboard)
- total_hands DESC (for volume ranking)

**Constraints:**
- win_rate BETWEEN 0 AND 100 OR NULL
- total_hands > 0 if exists
- win_count <= total_hands

**Materialization:** Updated via PostgreSQL trigger or cron job (runs hourly).

---

### opponent_database

**Purpose:** Stats vs each opponent

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, NOT NULL | Observer |
| opponent_id | UUID | FK → users.id, NOT NULL | Opponent |
| hands_played | INTEGER | DEFAULT 0 | Against this opponent |
| hands_won | INTEGER | DEFAULT 0 | |
| win_rate | DECIMAL(5,2) | | (hands_won / hands_played) * 100 |
| profit_loss | INTEGER | DEFAULT 0 | In cents |
| last_hand_at | TIMESTAMP | | Most recent hand vs this opponent |
| notes | TEXT | | "Aggressive 3bettor", etc. |
| updated_at | TIMESTAMP | DEFAULT now() | |

**Indexes:**
- (user_id, opponent_id) (UNIQUE composite)
- user_id + win_rate DESC (for opponent ranking)
- win_rate DESC (for finding tough matchups)

**Constraints:**
- user_id != opponent_id
- hands_played > 0
- UNIQUE (user_id, opponent_id)
- win_rate BETWEEN 0 AND 100

---

## 6. Moderation & Trust Tables

### reports

**Purpose:** Community reports (spam, toxicity, etc.)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| reporter_id | UUID | FK → users.id, NOT NULL | Who reported |
| reported_user_id | UUID | FK → users.id | Reported user (NULL if post) |
| reported_post_id | UUID | FK → posts.id | Reported post (NULL if user) |
| reported_comment_id | UUID | FK → comments.id | Reported comment |
| reason | VARCHAR(50) | NOT NULL | 'offensive', 'spam', 'misinformation' |
| description | TEXT | | Details |
| status | VARCHAR(20) | DEFAULT 'open' | 'open', 'investigating', 'resolved', 'dismissed' |
| decision | VARCHAR(20) | | 'upheld', 'rejected' |
| moderator_id | UUID | FK → users.id | Who reviewed (if resolved) |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| resolved_at | TIMESTAMP | | |

**Indexes:**
- reported_user_id (for user safety)
- status (for moderation queue)
- reporter_id (to prevent spam reporters)

**Constraints:**
- reason IN ('offensive', 'spam', 'misinformation', 'cheating', 'other')
- Exactly ONE of reported_user_id, reported_post_id, reported_comment_id NOT NULL
- reporter_id != reported_user_id if user report

---

### blocked_users

**Purpose:** User blocking (privacy)

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| blocker_id | UUID | FK → users.id, NOT NULL | Who blocked |
| blocked_id | UUID | FK → users.id, NOT NULL | Who is blocked |
| reason | TEXT | | Optional |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |

**Indexes:**
- (blocker_id, blocked_id) (UNIQUE composite)
- blocker_id (for "my blocks" view)

**Constraints:**
- UNIQUE (blocker_id, blocked_id)
- blocker_id != blocked_id

---

## 7. Business Tables

### subscriptions

**Purpose:** Premium subscription tracking

**Columns:**
| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| id | UUID | PK | |
| user_id | UUID | FK → users.id, NOT NULL | |
| tier | VARCHAR(20) | NOT NULL | 'free', 'premium', 'coach_premium' |
| status | VARCHAR(20) | NOT NULL | 'active', 'past_due', 'canceled', 'expired' |
| price_per_month | INTEGER | NOT NULL | In cents |
| billing_cycle | VARCHAR(20) | DEFAULT 'monthly' | 'monthly', 'annual' |
| current_period_start | TIMESTAMP | NOT NULL | |
| current_period_end | TIMESTAMP | NOT NULL | |
| cancel_at_period_end | BOOLEAN | DEFAULT false | |
| stripe_subscription_id | TEXT | | Stripe reference |
| stripe_customer_id | TEXT | | Stripe customer |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMP | DEFAULT now() | |

**Indexes:**
- user_id (for user subscription lookup)
- status (for renewal/expiry processing)
- tier (for feature access)
- current_period_end (for expiry notifications)

**Constraints:**
- tier IN ('free', 'premium', 'coach_premium')
- status IN ('active', 'past_due', 'canceled', 'expired')
- current_period_end > current_period_start

---

## Key Relationships

```
users 1 ──→ ∞ hands (created_by)
users 1 ──→ ∞ posts (created_by)
users 1 ──→ ∞ comments (user_id)
users 1 ──→ ∞ follows (follower_id OR following_id)
users 1 ──→ ∞ likes (user_id)
users 1 ──→ ∞ coaching_sessions (coach_id OR student_id)
users 1 ──→ ∞ subscriptions (user_id)

hands 1 ──→ ∞ seats (hand_id)
hands 1 ──→ ∞ actions (hand_id)
hands 1 ──→ 1 boards (hand_id)
hands 1 ──→ 1 posts (hand_id) [NULL until published]

posts 1 ──→ ∞ comments (post_id)
posts 1 ──→ ∞ likes (post_id)

comments 1 ──→ ∞ comment_replies (comment_id)

coaches 1 ──→ ∞ coaching_sessions (coach_id)
coaching_sessions 1 ──→ 1 session_reviews (session_id)

users 1 ──→ 1 hand_stats (user_id) [computed]
users 1 ──→ ∞ opponent_database (user_id)
```

---

## Row Level Security (RLS) Policies

**Philosophy:** Authorize access at database level, not app level. RLS ensures no leaked data.

### users Table

- **Profile read:** Anyone can read public fields (username, avatar, bio) of any user
- **Auth read:** Only self can read email, password_hash
- **Write:** Only self can update their own row

```
-- SELECT (public fields): Everyone
-- SELECT (auth fields): Only self
-- UPDATE: Only self
-- DELETE: Only self or admin
```

---

### hands Table

- **Read:** Creator can read own hands. Others can read if post.visibility != 'private'
- **Write:** Only creator can update/insert
- **Delete:** Only creator (soft delete via deleted_at)

```
-- SELECT: creator = auth.uid OR (has post AND post.visibility IN ('public', 'friends_only') AND follower check)
-- INSERT: auth.uid = created_by
-- UPDATE: auth.uid = created_by
-- DELETE: auth.uid = created_by
```

---

### posts Table

- **Read:** Public posts visible to all. Private posts visible only to creator.
- **Write:** Only creator can publish/update/remove
- **Delete:** Only creator or moderator can delete

```
-- SELECT: visibility = 'public' OR (visibility = 'private' AND auth.uid = created_by) OR (visibility = 'friends_only' AND user follows creator)
-- INSERT: auth.uid = created_by
-- UPDATE: auth.uid = created_by
-- DELETE: auth.uid = created_by OR admin
```

---

### comments Table

- **Read:** Anyone can read comments on public posts
- **Write:** Only authenticated users can insert. Only comment author can update/delete.

```
-- SELECT: Post is public OR user is author
-- INSERT: Authenticated users only
-- UPDATE: auth.uid = user_id
-- DELETE: auth.uid = user_id OR admin
```

---

### coaching_sessions Table

- **Read:** Only coach or student can read their own sessions
- **Write:** Only coach can update (notes), student can cancel
- **Delete:** None (sessions are immutable historical records)

```
-- SELECT: coach_id = auth.uid OR student_id = auth.uid
-- INSERT: student_id = auth.uid (student books) OR coach creates on behalf
-- UPDATE: coach_id = auth.uid (coach notes) OR status updates only
-- DELETE: Forbidden
```

---

### subscriptions Table

- **Read:** Only self can read own subscription
- **Write:** System only (Stripe webhooks)

```
-- SELECT: auth.uid = user_id
-- INSERT: System only (stripe webhook)
-- UPDATE: System only (stripe webhook)
-- DELETE: Forbidden
```

---

### coach_sessions → session_reviews

- **Read:** Student can read own reviews. Coach can read reviews of their sessions.
- **Write:** Only student can write review of a session

```
-- SELECT: student_id = auth.uid OR coach_id = auth.uid
-- INSERT: student_id = auth.uid
-- UPDATE: Forbidden (reviews are immutable)
-- DELETE: Only admin
```

---

### blocks Table (blocked_users)

- **Read:** System queries only (not user-facing)
- **Write:** User can block/unblock

```
-- UPDATE comments visibility: WHERE reported_post_id = posts.id → SELECT * WHERE NOT (post.creator_id IN blocked_users)
```

---

## Database Constraints & Integrity

### Temporal Constraints

- **created_at < updated_at:** Checked in UPDATE triggers
- **deleted_at > created_at if exists:** Soft-delete validity
- **scheduled_at > now() for future sessions:** CHECK constraint
- **current_period_end > current_period_start:** CHECK

### Data Integrity

- **Foreign keys:** CASCADE DELETE on hands → seats, comments
- **UNIQUE constraints:** Prevent duplicates (email, username, follows, likes, etc.)
- **NOT NULL:** On required fields (e.g., content, user_id)
- **CHECK constraints:** Enum validation (game_type, action_type, tier, status, etc.)

### Cascading Deletes

```
hands (DELETE) 
  → seats (CASCADE DELETE)
  → actions (CASCADE DELETE)
  → boards (CASCADE DELETE)
  → posts (SET NULL, hand_id nullable after deletion)

users (DELETE)
  → hands (CASCADE DELETE via hand_id)
  → posts (CASCADE DELETE via created_by)
  → comments (CASCADE DELETE)
  → follows (CASCADE DELETE)
  → coaching_sessions (prevent delete if coach has active bookings)
```

---

## Indexing Strategy

### Query Patterns

| Query | Index |
|-------|-------|
| Feed: `SELECT * FROM posts WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 50` | (visibility, created_at DESC) |
| My hands: `SELECT * FROM hands WHERE created_by = user_id ORDER BY created_at DESC` | (created_by, created_at DESC) |
| Search posts by tag: `SELECT * FROM posts WHERE tags @> ARRAY['3bet']` | GIN (tags) |
| Leaderboard: `SELECT * FROM hand_stats ORDER BY win_rate DESC LIMIT 100` | (win_rate DESC) |
| Opponent DB: `SELECT * FROM opponent_database WHERE user_id = X AND opponent_id = Y` | (user_id, opponent_id) UNIQUE |
| Coach directory: `SELECT * FROM coaches WHERE availability_status = 'available' AND 'Preflop' = ANY(specializations)` | (availability_status, specializations) |
| Comments on post: `SELECT * FROM comments WHERE post_id = X ORDER BY created_at DESC` | (post_id, created_at DESC) |
| Session schedule: `SELECT * FROM coaching_sessions WHERE coach_id = X AND scheduled_at BETWEEN start AND end` | (coach_id, scheduled_at) |

---

## Materialized Views (Optional)

### trending_hands (computed daily at 2 AM UTC)

```
SELECT post_id, likes_count, comments_count, score
FROM posts
WHERE created_at > now() - interval '7 days'
ORDER BY likes_count DESC
LIMIT 1000
```

**Use:** Feed ranking, trending sidebar

### coach_leaderboard (computed hourly)

```
SELECT coach_id, average_rating, session_count, hourly_rate
FROM coaches
WHERE is_active = true
ORDER BY average_rating DESC
```

**Use:** Coach directory sorting

---

## Denormalization Strategy

| Denormalized Field | Source | Update Trigger |
|-------------------|--------|-----------------|
| profiles.total_hands_shared | COUNT(hands WHERE created_by = user_id) | hand INSERT/DELETE |
| profiles.total_followers | COUNT(follows WHERE following_id = user_id) | follow INSERT/DELETE |
| hand_stats.* | Computed from hands/seats/actions | Daily cron + UPSERT |
| posts.featured_until | Sponsor campaigns | Sponsor creation/expiry |

**Tradeoff:** Denormalization buys query speed at the cost of update latency. Acceptable for non-critical fields (stats, counts).

---

## Partitioning Strategy (if > 100M rows)

### hands table (by year)

```
hands_2024
hands_2025
hands_2026
...
```

Benefits:
- Faster queries on recent hands
- Faster DELETE (drop entire partition, no slow DELETE query)
- Parallel scans across partitions

### actions table (by hand_id)

Not partitioned initially; only if queries become slow.

---

## Backup & Disaster Recovery

**Supabase default:**
- Daily backups (retained 7 days free tier, 30 days paid)
- Point-in-time recovery
- Automated replicas (paid tiers)

**Pokza additions:**
- Weekly snapshots to S3 (for long-term retention)
- Monthly exports of critical tables (users, hands, posts)
- Disaster recovery runbook (restore from backup, verify data integrity)

---

## Performance Targets

| Query | Target Latency | Notes |
|-------|----------------|-------|
| Feed load (50 posts) | < 200ms | Cached, indexed |
| Post creation | < 500ms | Includes image upload |
| Hand replay | < 100ms | All data in memory |
| Coach directory (1000 results) | < 300ms | Materialized view |
| User profile load | < 100ms | Light query |
| Opponent database lookup | < 50ms | UNIQUE index |
| Leaderboard (top 100) | < 200ms | Materialized view |

**Monitoring:** Use Supabase logs to track slow queries. Target p95 < 500ms.

---

## Best Practices

### Do's ✅

1. **Use UUIDs for PKs:** Better for horizontal scaling than auto-increment
2. **Soft deletes:** `deleted_at` column for historical records
3. **Audit trail:** `created_at`, `updated_at` on all tables
4. **Denormalize counts:** `total_hands_shared` on profiles (reads are 100x > writes)
5. **Index for queries:** Create indexes BEFORE queries are slow
6. **Use JSONB for flexible fields:** `actions`, `by_position` stats
7. **RLS everywhere:** Authorize at database level
8. **Normalize in transactional tables:** `hands`, `posts`, `coaching_sessions` should be 3NF
9. **Composite indexes:** (user_id, created_at) faster than separate indexes

### Don'ts ❌

1. **Don't use auto-increment:** Hard to shard, collisions in multi-region
2. **Don't store denormalized bitmaps:** Use JSONB or separate table
3. **Don't write-heavy denormalization:** If writes > reads, costs outweigh benefits
4. **Don't trust app-level auth:** Always enforce RLS at database
5. **Don't create indexes for every WHERE clause:** Adds write latency. Batch similar queries.
6. **Don't select *:** List columns explicitly (security, performance)
7. **Don't cascade DELETE without testing:** Accidental data loss is permanent
8. **Don't assume SQL injection is prevented:** Even with parameterized queries, audit

---

## Migration Strategy

**Approach:** Zero-downtime migrations using Supabase migrations

1. **Add column:** `ALTER TABLE hands ADD COLUMN new_field TEXT;` (nullable)
2. **Backfill:** `UPDATE hands SET new_field = compute_value();` (separate batch job)
3. **Add constraint:** `ALTER TABLE hands ALTER COLUMN new_field SET NOT NULL;`
4. **Remove old field:** `ALTER TABLE hands DROP COLUMN old_field;` (if renaming)

**Timing:** Off-peak hours (2-4 AM UTC) for large tables to avoid locking.

---

## Conclusion

**This schema is:**
- **Normalized:** Reduces redundancy, maintains ACID properties
- **Denormalized strategically:** Counts, stats for read-heavy queries
- **Secured:** RLS policies on every table
- **Indexed:** For common query patterns
- **Scalable:** UUIDs, partitioning-ready, Supabase infra
- **Auditable:** created_at, updated_at on all transactional tables

**Next steps:** Implement RLS policies in Postgres, create indexes, monitor performance in staging.

