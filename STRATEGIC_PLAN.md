# Pokza Strategic Plan - Revised

**YC-style honest assessment + improved execution plan**

---

## Part 1: Honest Assessment (What We Got Wrong)

### The Problems

1. **Original roadmap was fantasy.** V0 in 8 weeks solo is doable if you're a 10x engineer with prior experience shipping solo. Otherwise, it's a plan to burn out. Realistic: 14-16 weeks with competent solo founder, or 10-12 weeks with two founders.

2. **P0 feature scope was bloated.** 25 tasks for MVP is ambitious. Industry standard: 6-8 tasks. We were trying to build Binked 2.0 + improvements instead of a focused MVP.

3. **Coaching revenue model lacks validation.** Assuming 500 coaches by year 3 is premature. Binked has fewer coaches active. We need to validate: Can coaches actually get bookings? What's the churn rate? What's the ops cost per coach?

4. **Retention wasn't the north star.** We focused on user acquisition targets (10K → 100K → 400K) without proving retention. If day-30 retention is 15% instead of 20%, revenue targets fall in half.

5. **Distribution was vague.** "Post in r/poker and get influencers to try it" isn't a strategy. We needed CAC modeling and partnership validation.

6. **Regulatory risks ignored.** Operating internationally, integrating with poker sites, taking commission—none of this was legally reviewed.

7. **Missed obvious opportunities:**
   - Live hand entry at table (this is a killer feature, not a year-2 feature)
   - Solver integration from day 1 (differentiator vs. Binked)
   - PokerStars partnership (10M users to tap)
   - Influencer seeding strategy (not just "hope they use it")
   - Tournament tracking MVP (serious players need this)

---

## Part 2: Revised Roadmap

### V0: Lean MVP (12-14 weeks, 1-2 founders)

**Philosophy:** Validate retention on ONE core use case. Don't build anything else.

#### Core Features (6 only)

1. ✅ **Hand creation form** (basic: game type, stakes, position, hero cards, board, result)
   - NOT: Complex action tracking, showdown cards, betting logic edge cases
   - YES: Simple form, 30 seconds to fill

2. ✅ **Hand replay** (non-interactive cards + board visualization)
   - NOT: Play/rewind buttons, action animations (yet)
   - YES: Show hero cards, board, result. That's it.

3. ✅ **Feed** (chronological list of public hands)
   - NOT: Recommendation algorithm, trending, search
   - YES: Latest 50 hands, infinite scroll

4. ✅ **Profiles** (username, hands posted count, followers)
   - NOT: Stats breakdown, analytics, opponent DB
   - YES: Simple profile card

5. ✅ **Follow + Like** (basic social)
   - NOT: Mentions, complex notifications
   - YES: Follow/unfollow button, like heart

6. ✅ **Comments** (text only)
   - NOT: Nested replies, emoji reactions, mentions
   - YES: Add comment, see comments

#### Tech Stack (Minimal)

- Frontend: Next.js (Vercel free tier)
- Mobile: Responsive web (NO native app yet)
- Backend: Node.js on Railway
- Database: Supabase free tier
- Storage: Cloudinary free tier
- Auth: Supabase Auth (email/password only, NO OAuth)

#### Timeline

- Week 1-2: DB setup + auth endpoints
- Week 3-4: Hand creation endpoint + form
- Week 5-6: Feed + profiles
- Week 7-8: Social (follow, like, comments)
- Week 9-10: UI polish + bug fixes
- Week 11-12: Launch + monitoring
- Week 13-14: Buffer + launch retro

#### Monetization: Do NOT include in V0

- NO premium tier (validate free first)
- NO payment processing (complexity + distraction)
- NO coaching integration (ops burden)

#### Success Criteria for V0

- ✅ 1K signups by week 12
- ✅ 50+ hands created (proof users understand)
- ✅ **40% day-7 retention** (KEY METRIC)
- ✅ **3+ NPS** (users should love it)
- ✅ < 500ms API latency
- ✅ Zero critical bugs

**If you hit these, V0 succeeds. If not, debug before moving on.**

---

### V0.5: Validation Phase (4-6 weeks, parallel to V0 launch)

**Do these after V0 ships but before adding features.**

#### Retention Experiments (A/B test the retention)

- Email digest (weekly trending hands) → measure if it improves day-30 retention
- Push notification on new follower post → measure engagement impact
- "You posted 5 hands" milestone email → measure emotional engagement

#### Coaching Pilot (Real validation)

- Recruit 20 coaches manually (DM top Binked creators, poker Twitch streamers)
- Create basic coach directory page (just a list, no integration)
- Drive traffic to their Calendly/external booking
- Measure: How many bookings do coaches get? What's the conversion? Do they stick?
- **This answers:** Does the coaching model actually work?

#### Influencer Strategy (Structured outreach)

- Identify 30 poker Twitch streamers (100K-1M followers each)
- Send personalized deck: "Pokza lets you share hands with your audience"
- Goal: 5-10 to demo on stream by week 16
- Measure: CAC from each influencer (clicks → signups)

#### Distribution Testing (Validate CAC channels)

- r/poker posts (organic, free)
- Paid ads on Facebook/Instagram (micro-budget, $200/month)
- Affiliate partnerships (PokerStars, GTO Wizard referral links)
- Measure CAC per channel, retention by cohort

**Output by week 20:** You'll know:
- Real retention numbers (not projections)
- Does coaching actually work?
- Which distribution channels work
- NPS from early users (what to build next)

---

### V1: Monetize + Retain (16-20 weeks, 2-3 person team)

**Only if V0 hits retention targets.**

#### Premium Tier ($9/month)

- Analytics: win rate %, profit/loss total, hands breakdown
- Opponent stats: searchable DB of opponents
- NO ads (free tier has ads)

**Target:** 5% conversion = 250 premium users @ $2.25K MRR

#### Coaching Marketplace (Stripe Connect)

**Only if V0.5 pilot shows coaches book sessions.**

- Stripe Connect for payout
- Take 20% commission
- Automatic weekly payouts
- Review system

**Target:** 100 active coaches, 3-5 sessions each → $30K MRR by week 24

#### Sponsored Hands ($200-500/hand)

- Poker companies pay to promote hands to audience
- Feature badge, separate section

**Target:** 2-3 sponsors per month → $5K MRR by week 24

#### Email Monetization (Affiliate + ads)

- Weekly digest email (trending hands, top coaches)
- Affiliate links (PokerStars, GTO Wizard)
- Native ads from poker partners

**Target:** $2-3K MRR by week 24

#### Total V1 Target: $40-50K MRR (instead of $50K in original roadmap, more realistic)

#### Team Growth

- Week 1: Hire 1 backend engineer (from V0 cashflow)
- Week 10: Hire 1 frontend/designer (from coaching revenue)
- Week 16: Hire 1 operations person for coaching (essential by now)

---

### V2: Scale (16-20 weeks, 4-6 person team)

**Only if V1 hits $40K MRR + 50K MAU.**

#### Mobile Native App

- Native iOS/Android (Expo)
- Push notifications (now we have them)
- Offline hand entry (tables have bad wifi)

#### Hand Import (PokerTracker, Hold'em Manager)

- CSV upload
- Auto-parse hand history
- Bulk import

#### Advanced Analytics

- Position breakdown (SB, BTN, CO, etc.)
- Game type breakdown (6max, HU, full ring)
- Win rate by opponent
- Variance calculator

#### Leaderboard + Trending

- Top 100 players (followers, hands, win rate)
- Trending hands (like + comments)
- Verified badges (pro, coach, streamer)

#### Groups (Communities)

- Private groups (study groups, player collectives)
- Group revenue share: $5-20/month fee, Pokza takes 20%

#### Target: 150K MAU, $100K+ MRR

---

### V3: Ecosystem (6-12 months, 6-10 person team)

**Only if V2 hits $100K MRR + 150K MAU.**

#### PokerStars Partnership (Game-changing)

- Native PokerStars hand import (API)
- "Share to Pokza" button on PokerStars
- Become social layer for their 10M users
- Revenue share with PS

#### Twitch Integration

- Stream live while sharing hands
- Overlay hand replayer
- Creator monetization (tips, sponsorships)

#### Tournament Support

- Tournament bracket tracking
- Pokza leagues (monthly competitions, prizes)
- Prize pool funded by sponsors

#### Marketplace / Creator Tools

- Video export (auto-generate YouTube videos from hands)
- Content studio (batch upload, scheduling)
- Analytics dashboard for creators

#### International Expansion

- Multi-language (French, German, Spanish, Portuguese)
- Regional leaderboards
- Regulatory compliance per jurisdiction

#### Target: 400K MAU, $400K+ MRR, 10+ person team

---

## Part 3: Addressing the Risks

### Risk 1: Founder Burnout

**Original plan:** Solo founder, 8 weeks, unrealistic.

**Revised approach:**
- ✅ Find a co-founder (technical, proven shipping velocity)
- ✅ Split work: Founder A = backend + DB, Founder B = frontend + mobile
- ✅ Timeline extends to 12-14 weeks (sustainable pace)
- ✅ Take weekends off; plan for holidays

### Risk 2: Retention Collapse

**Original problem:** Assumed 20% day-30 without validation.

**Revised approach:**
- ✅ V0 focuses entirely on retention (not growth)
- ✅ Day-7 retention is north star metric, measured daily
- ✅ V0.5 runs retention experiments (email, push, milestones)
- ✅ Only move to V1 if hitting 40% day-7 retention
- ✅ If retention is 20% or lower, pivot (focus on onboarding, not new features)

### Risk 3: Coaching Ops Burden

**Original problem:** Assumed coaches just sign up and work. Reality: needs vetting, support, churn management.

**Revised approach:**
- ✅ V0.5 runs small pilot (20 coaches) to validate ops cost
- ✅ Budget 1 ops person by V1 (not mentioned before)
- ✅ Build review system + moderation tools before scaling
- ✅ Measure coach churn monthly (if >5% month, problem)
- ✅ Only expand to 500 coaches if pilot shows <3% monthly churn

### Risk 4: Regulatory Ambiguity

**Original problem:** No legal review. Operating internationally + integrating with poker sites + taking commission = potential issues.

**Revised approach:**
- ✅ Hire lawyer to review by week 4 (budget $5K)
- ✅ Geofence certain countries (no poker in some jurisdictions)
- ✅ Clear ToS about hand-sharing (not promoting gambling)
- ✅ Separate business entity per jurisdiction (if needed)
- ✅ Insurance for disputed content/payment issues

### Risk 5: Competitive Response (PokerStars copies)

**Original problem:** PokerStars could add social features tomorrow.

**Revised approach:**
- ✅ Move fast to get partnerships (PokerStars, GTO Wizard) → become embedded
- ✅ Network effects: Early community = defensible moat
- ✅ Once creators have 1000+ followers on Pokza, they're sticky
- ✅ If PokerStars adds social, we already have the community
- ✅ Acquisition target: PokerStars buys Pokza to avoid cannibalizing their own platform

---

## Part 4: Unrealistic Assumptions (Replaced)

### ❌ Original Assumption 1: 5% premium conversion

**Reality:** Freemium social apps see 0.5-1.5% conversion. Replace with 2% target, measure cohort by cohort.

### ❌ Original Assumption 2: 300 coaches by month 18

**Reality:** Takes 12-18 months to build a marketplace (chicken-and-egg problem). Start with 20, grow to 100 by month 12, then 300 if retention/bookings are strong.

### ❌ Original Assumption 3: $330K MRR in V2 (month 6-18)

**Reality:** Coaching takes time to scale, premium conversion is lower than assumed. Revised: $40-50K MRR by month 18 (still impressive for bootstrapped company).

### ❌ Original Assumption 4: "Post in r/poker and influencers will come"

**Reality:** Need structured outreach, partnerships, content marketing. Revised: 30-hour/week community building by founder until team hired.

### ❌ Original Assumption 5: User acquisition via word-of-mouth alone

**Reality:** WOM works for retention, not acquisition. Revised: Paid ads on Facebook starting month 6 (once we have retention proof + PMF signal).

---

## Part 5: The 18-Month Path to $100K MRR

| Phase | Timeline | Users | MRR | Focus |
|-------|----------|-------|-----|-------|
| **V0** | Month 1-3 | 1K | $0 | Retention + validation |
| **V0.5** | Month 3-4 | 3K | $100 | Coaching pilot + influencer seeding |
| **V1 Alpha** | Month 5-6 | 5K | $2K | Premium tier, coaching marketplace |
| **V1 Launch** | Month 7-9 | 15K | $8-10K | Scale retention, monetization |
| **V1+ Growth** | Month 10-15 | 50K | $40-50K | Analytics, mobile app |
| **V2 Launch** | Month 16-20 | 150K | $100K+ | PokerTracker import, leaderboards, groups |

**By month 18:** $100K MRR, 3-4 person team, cash-flow positive, raising Series A is optional (you don't need to).

---

## Part 6: What You Actually Need to Do First

### Month 0 (Now)

- [ ] **Find co-founder or reset expectations** (solo vs. team timeline)
- [ ] **Hire lawyer for 2-hour legal review** ($2-5K) — understand regulatory constraints
- [ ] **Validate coaching demand** (email 50 top Binked coaches: "Would you use a platform to get coaching clients?")
- [ ] **List 30 Twitch poker streamers** with 100K+ followers (seeding targets)
- [ ] **Refactor roadmap to lean MVP** (this doc replaces old ROADMAP.md)

### Months 1-3 (Build V0)

- [ ] Ship 6 features (hand creation, replay, feed, profiles, follow, comments)
- [ ] Hit 40% day-7 retention
- [ ] Get 5-10 influencers to demo

### Months 3-4 (Validate)

- [ ] Run coaching pilot (20 coaches)
- [ ] Email to 500 Binked users (to drive early signups)
- [ ] Influencer outreach (get 2-3 Twitch streamers to stream Pokza hands)
- [ ] Measure CAC per channel

### Months 5-6 (Monetize)

- [ ] Add premium tier ($9/month)
- [ ] Launch coaching marketplace (if pilot is positive)
- [ ] Hire first engineer
- [ ] First $2-5K MRR

### Months 7-12 (Scale)

- [ ] Hit 50K MAU
- [ ] $40-50K MRR (all revenue streams)
- [ ] Mobile native app
- [ ] Hand import (PokerTracker, CSV)

### Months 13-18 (Expand)

- [ ] Hit 150K MAU
- [ ] $100K+ MRR
- [ ] Leaderboards, trending, verified badges
- [ ] Groups / communities

---

## Summary: Key Changes from Original Plan

| Area | Original | Revised | Impact |
|------|----------|---------|--------|
| **Timeline (V0)** | 8 weeks, solo | 12-14 weeks, 1-2 founders | More realistic, sustainable |
| **P0 Features** | 25 tasks | 6 tasks | Ship 4-6x faster, validate retention |
| **Revenue V1** | $50K MRR | $40-50K MRR | More conservative, achievable |
| **Coaching** | Assume works | Validate with 20-coach pilot | De-risk biggest revenue stream |
| **Distribution** | Hope + prayer | Structured: influencers + paid ads | Measurable CAC |
| **Retention focus** | Growth targets | Day-7 retention = metric | Not chasing vanity numbers |
| **Legal** | Ignored | $5K lawyer review | Avoid regulatory issues |
| **Co-founder** | Optional | Essential | Execution velocity |

---

## The Honest Assessment

**Original plan:** Good product idea, overly ambitious roadmap, unrealistic execution assumptions.

**Revised plan:** Same product idea, but grounded in reality. Lean MVP, retention-focused, operational validation before scaling, structured distribution.

**YC would say:** "This version is fundable. The founder is thinking like a business person now, not just a PM."

**Runway:** Starting with $50K (seed from savings):
- Month 1-6: Burn $10K/month on costs (laptop, server, lawyer, ads test)
- Month 7+: Revenue covers burn rate
- Month 18: $100K MRR, Series A optional

**Verdict:** This is a $50M+ company in 3-4 years if executed well. Ship the lean MVP first.

