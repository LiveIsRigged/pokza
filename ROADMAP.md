# Roadmap

Pokza's bootstrapped path to market leadership (zero external capital, self-financed growth).

---

## Philosophy

**No outside money. No investors. Revenue funds growth.**

- Ship V0 in 2 months solo (proof of concept)
- Monetize immediately ($9/month premium)
- Use cash to hire and scale
- Reach $100K MRR by month 18, $1M MRR by month 36

**Economics:**
- Month 1-3: Solo, $0 burn, $0 revenue → need personal savings to cover living
- Month 4-6: 1K users, $100-300 MRR → still need day job or savings
- Month 7-12: 10K users, $2-5K MRR → can go full-time
- Month 13-18: 50K users, $20-50K MRR → hire first engineer
- Month 19-24: 150K users, $100K+ MRR → hire team of 3
- Month 25-36: 400K users, $500K-1M MRR → hire team of 10-15

---

## V0: Prototype (8 weeks, Solo)

**Timeline:** Dec 2025 - Jan 2026

**Mission:** Prove the product works. Get 500-1000 users. No design, no polish, just working.

### Features (Minimal)

#### Core
- ✅ Hand creation (simple form, not wizard)
  - Game type (6max, HU, full ring)
  - Stakes (text input)
  - Hero position + cards
  - Flop/Turn/River cards
  - Action notes (text)
  - Result (win/loss/fold/all-in)
- ✅ Hand feed (chronological, infinite scroll)
- ✅ Like hands (click heart)
- ✅ Comment on hands (text only, no nested replies)
- ✅ View hand replay (animated, basic)
- ✅ User profiles (hands list, followers count)
- ✅ Follow/unfollow
- ✅ Auth (email + password, no OAuth)
- ✅ Search (basic keyword search)

#### Tech Stack (Free)
- **Frontend:** Next.js (Vercel free tier)
- **Mobile:** Responsive web (no native app yet)
- **Backend:** Node.js on Railway free tier ($5/month after trial)
- **Database:** Supabase free tier (500MB, good for 1K users)
- **Storage:** Cloudinary free tier (5GB)
- **Auth:** Supabase Auth (built-in, free)
- **Monitoring:** Sentry free tier

#### No Design System
- Use Tailwind CSS defaults + simple colors
- Copy layout from Binked (basic, proven)
- Goal: working product, not beautiful

#### Distribution
- Launch on Product Hunt
- Post in r/poker, poker Discord servers
- Ask 10 poker influencers to try (free account)
- Twitter threads about building

### Team
- **You (solo):** Full-stack (design, backend, frontend)
- **Time:** 40-50 hours/week for 8 weeks
- **Cost:** $0 (use free tier services)

### Success Criteria

- ✅ App deployed and live
- ✅ 500+ signups
- ✅ 50+ hands created (proof users understand the flow)
- ✅ <500ms API latency
- ✅ No critical bugs
- ✅ "This is cool" feedback from 3-5 influencers

### Risks & Mitigations

| Risk | Impact | Fix |
|------|--------|-----|
| Hand creation too complex | High | Start with bare minimum (5 fields only) |
| Free tier quotas hit | Medium | Monitor usage, optimize DB queries |
| You burn out | High | Work sustainable pace, take weekends off |
| Nobody uses it | High | Get influencers to validate early (week 2-3) |

---

## V1: Launch & Monetize (24 weeks, Solo → 1 hire)

**Timeline:** Feb - Aug 2026

**Mission:** Launch public, get 10K users, hit $2-5K MRR (enough for full-time), hire first engineer.

### Phase 1A: Polish & Premium (6 weeks)

**Scope:**
- ✅ Beautiful UI (hire freelance designer for 2-4 weeks, ~$3K from V0 revenue)
- ✅ Premium tier ($9/month, 30-day free trial)
  - Ad-free feed
  - Hand analytics (win rate, positions)
  - Opponent stats (searchable DB)
  - Export hands (CSV)
- ✅ Free tier (limited hands per month, ads)
- ✅ Stripe integration for billing
- ✅ Email onboarding (MailChimp free tier)
- ✅ Push notifications (Expo push on web, via service worker)

**Cost:**
- Designer: $3-5K (paid from next phase revenue)
- Infrastructure upgrades: $100-200/month
- Total: $0 (bootstrap with V0 if any revenue)

**Revenue Model:**
- $9/month premium (target 5% conversion = 500 premium users @ $45K ARR)
- Free tier (14-day free trial converts some)

### Phase 1B: Growth Hacking (12 weeks)

**Acquisition Channels:**
- **Organic (free):**
  - Reddit r/poker + poker subreddits (weekly posts)
  - Discord communities (partner with mods, free premium access)
  - Poker Twitter threads (build following, daily posts)
  - PokerStars forums, 2+2 forums (invite links)
  - Twitch streamers (DM top 50, offer free premium)

- **Paid (if revenue allows, after month 3):**
  - Facebook/Instagram ads ($500-1K/month targeting poker players)
  - Google Ads ($500-1K/month, search "poker hand tracker")

**Content:**
- Launch blog (2 posts/week on poker strategy, each links to Pokza)
- Twitter: daily updates, hand breakdowns, user highlights
- Video: 3-4 YouTube shorts of hand replays (auto-generated from platform)

**Retention:**
- Weekly email digest of trending hands
- "You posted 10 hands" notifications
- Leaderboard (top 10 players by followers, visible on homepage)

### Phase 1C: Coaching Integration (6 weeks)

**Once you have users:**
- ✅ Coach profiles (simple: name, specialization, hourly rate, calendar link)
- ✅ Connect to Calendly (coaches book outside Pokza)
- ✅ Coaching marketplace (list of coaches, filterable by specialization)
- ✅ Coach badge (✓ verified)
- ✅ "Book a session" button → Calendly link

**Revenue:** Don't take commission yet (too complex). Just drive traffic to coaches. They pay $0, grateful for leads.

### Success Criteria (End of V1)

- ✅ 10K signups
- ✅ 2K active monthly users (20% of signups)
- ✅ 5K hands published (500 hands/month active)
- ✅ 500 premium subscribers ($4.5K MRR)
- ✅ 50+ coaches on platform (not yet monetized)
- ✅ 40% day-7 retention, 20% day-30
- ✅ <500ms API latency
- ✅ NPS > 40 (people like it)

### Budget (V1)

| Item | Cost | Notes |
|------|------|-------|
| Designer freelance | $3-5K | 4-6 weeks, design system |
| Ads (Facebook/Google) | $2-3K | Months 4-6 |
| Infrastructure | $1-2K | Supabase paid tier, Railway, Cloudinary |
| **Total** | **$6-10K** | Funded by V0 free premium revenue + personal savings |

### Team

- **Months 1-10:** You (solo)
- **Months 11-24:** You + 1 part-time engineer (hired with $2-5K MRR)

---

## V2: Scale & Coaching Revenue (24 weeks, 1-3 engineers)

**Timeline:** Sep 2026 - Feb 2027

**Mission:** 50K users, $20-50K MRR (coaching marketplace + premium), hire full team.

### Phase 2A: Coaching Marketplace (8 weeks)

**Monetization:**
- ✅ Stripe Connect for coaches (Pokza takes 15-20% commission)
- ✅ Session booking (choose time, pay via Stripe)
- ✅ Session recordings (optional, stored on S3, coach gets link)
- ✅ Coach reviews (1-5 stars, required after session)
- ✅ Automatic payouts (weekly to coach Stripe account)

**Coach Acquisition:**
- Email existing coaches: "Start earning on Pokza"
- Free landing page for coaches
- Coach revenue share: if coach gets 10 sessions @ $80, Pokza takes $16-24, coach gets $56-64
- Target: 300+ coaches by end of phase

**Revenue:** 300 coaches × 5 sessions/month × $80 × 20% commission = $24K/month

### Phase 2B: Analytics Dashboard (6 weeks)

**Premium features:**
- ✅ Personal win-rate stats (aggregated by hand)
- ✅ Position breakdown (how much you win HU vs 6max vs full ring)
- ✅ Opponent database (search "player name", see your stats vs them)
- ✅ Hand filters (by position, game type, result, date range)
- ✅ Leaderboard (top 100 players by win rate, followers, hands posted)
- ✅ PDF export (monthly report)

**Tech:** Materialized views in Supabase (computed nightly), cache in Redis

**Monetization:** Premium-only feature, drives conversion

### Phase 2C: Ads & Sponsoring (5 weeks)

**Once you have 30K+ users:**
- ✅ Sponsored hands (poker sites, training courses pay $100-500 to promote hand)
- ✅ Coaching ads (coaches pay $50-200/month for featured listing)
- ✅ In-feed ads (native ads from poker sites, 2-3 per day max)

**Ad partners:**
- PokerStars affiliate
- GTO Wizard affiliate
- PokerTracker affiliate
- Hold'em Manager affiliate
- Poker training courses

**Revenue:** $5-10K/month from sponsoring + affiliates by end of phase

### Phase 2D: Creator Revenue Share (5 weeks)

**Top creators earn:**
- ✅ $0.01-0.05 per view (threshold: 10K views/month to qualify)
- ✅ Bonus: $100-500/month if trending hand
- ✅ Coaching referral bonus: $10 per student booking through their profile

**Revenue impact:** $2-5K/month going to creators (but incentivizes quality content)

### Success Criteria (End of V2)

- ✅ 50K MAU
- ✅ 300+ verified coaches
- ✅ 200 hands posted per day (6K/month)
- ✅ 2K premium subscribers ($18K MRR)
- ✅ Coaching revenue: $24K/month
- ✅ Ads/Sponsoring: $8K/month
- ✅ Creator payouts: $3K/month
- ✅ **Total MRR: $50-55K** (cash-flow positive after overhead)
- ✅ Retention: 45% day-7, 22% day-30

### Budget (V2)

| Item | Cost | Notes |
|------|------|-------|
| Salaries (1 engineer, 6 mo) | $15-20K | Hired from cash flow, part-time→full-time |
| Designer/freelance | $5-8K | UI Polish, coaching flows |
| Infra upgrades | $3-5K | Supabase, PostgreSQL scaling |
| **Total** | **$23-33K** | Funded by revenue |

### Team

- **Months 1-6:** You + 1 engineer (part-time, ramping to full-time)
- **Months 7-12:** You + 1 full-time engineer + 1 part-time designer
- **Months 13-24:** You + 1 engineer + 1 part-time designer (hiring second engineer at month 20)

---

## V3: Professional Network (26 weeks, 2-4 engineers)

**Timeline:** Mar - Sep 2027

**Mission:** 150K users, $100K+ MRR, establish Pokza as professional poker platform.

### Phase 3A: Advanced Analytics (6 weeks)

**Premium features:**
- ✅ Game type breakdown (cash vs tournament vs sit-n-go)
- ✅ Villain position buckets (which positions do you struggle vs?)
- ✅ Street-by-street analysis (your aggression %, fold rate by street)
- ✅ Variance calculator (how much downswing is normal for your stats?)
- ✅ Hand history upload (PokerTracker, Hold'em Manager CSV import)

**Revenue:** Premium-only, drives LTV of premium users

### Phase 3B: Groups & Communities (6 weeks)

**Features:**
- ✅ Private groups (study groups, player collectives)
- ✅ Group hand feed (share hands within group only)
- ✅ Group challenges ("Post your biggest cooler this month")
- ✅ Group leaderboard (top members in group)

**Monetization:** Group creators can charge $5-20/month to members (Pokza takes 20%)

### Phase 3C: Verified Badges & Pro Program (4 weeks)

**Badge types:**
- ✅ Pro player (self-reported winnings + community vouching)
- ✅ Coach (background check via Stripe)
- ✅ Streamer (Twitch/YouTube following)
- ✅ Author (published poker content)

**Revenue:** $9/month pro tier (includes verified badge, analytics tools, group creation)

### Phase 3D: Mobile Native App (10 weeks)

**Launch native iOS + Android:**
- ✅ Expo managed workflow
- ✅ Push notifications (finally available)
- ✅ Offline hand creation (sync when online)
- ✅ App Store + Play Store distribution

**User acquisition:** App store discoverability, +50% growth

### Success Criteria (End of V3)

- ✅ 150K MAU
- ✅ 150K hands posted/month
- ✅ 5K premium subscribers ($45K MRR)
- ✅ 500+ active coaches ($40K MRR coaching revenue)
- ✅ 50+ active groups ($5K MRR)
- ✅ Ads/Sponsoring: $15K/month
- ✅ Pro tier (analytics): $8K/month
- ✅ **Total MRR: $110-120K**
- ✅ Retention: 50% day-7, 25% day-30
- ✅ Mobile app: 50K+ downloads

### Budget (V3)

| Item | Cost | Notes |
|------|------|-------|
| Engineering (2-3 engineers) | $40-60K | 6 months salary |
| Designer/Contractor | $10K | Mobile UX, analytics design |
| App store costs | $100 | Apple developer, Google Play |
| Infra | $8-12K | Database scaling, Redis, CDN |
| **Total** | **$58-82K** | Funded by $100K+ MRR |

### Team

- Month 1-6: You + 1 engineer + 1 designer
- Month 7-13: You + 2 engineers + 1 designer
- Month 14-26: You + 2-3 engineers + 1 designer + 1 community manager (hired at month 20)

---

## V4: Ecosystem (26 weeks, 5-8 engineers)

**Timeline:** Oct 2027 - Mar 2028

**Mission:** 300K+ users, $400K+ MRR, partnerships with poker ecosystem.

### Phase 4A: Hand Import Integrations (8 weeks)

**Partnerships:**
- ✅ PokerTracker API (import user hands automatically)
- ✅ Hold'em Manager API
- ✅ Poker site parsers (PokerStars, GGPoker, 888)

**Revenue:** Free feature (but users more engaged, premium conversion +20%)

### Phase 4B: Creator Tools (6 weeks)

**For content creators (streamers, coaches, pros):**
- ✅ Content studio (batch upload hands, auto-generate clips)
- ✅ Analytics dashboard (views, engagement, revenue)
- ✅ Monetization dashboard (track creator payouts)
- ✅ YouTube export (auto-create videos from hands)

**Revenue:** Creator Pro tier ($29/month)

### Phase 4C: Coaching Certifications (6 weeks)

**Build credentials:**
- ✅ Pokza coaching academy (free course)
- ✅ Certification exam (coaches must pass)
- ✅ Verified badge (only certified coaches)

**Revenue:** $50-100 per certification exam

### Phase 4D: Esports & Tournaments (6 weeks)

**Community competitions:**
- ✅ Pokza leagues (monthly, $0 entry, prize pool funded by ads)
- ✅ Tournament bracket (public tournament support)
- ✅ Prize pool ($100-1K per month funded by sponsorships)

**Revenue:** Sponsorship deals (poker sites pay to sponsor leagues)

### Success Criteria (End of V4)

- ✅ 300K+ MAU
- ✅ 500K hands posted/month
- ✅ 10K premium subscribers ($90K MRR)
- ✅ 1000+ active coaches ($80K MRR)
- ✅ 200+ active groups ($15K MRR)
- ✅ Creator pro tier: $20K/month
- ✅ Sponsorships/Ads: $50K/month
- ✅ Group revenue: $10K/month
- ✅ Certifications: $5K/month
- ✅ **Total MRR: $400-450K**
- ✅ Retention: 55% day-7, 28% day-30

### Budget (V4)

| Item | Cost | Notes |
|------|------|-------|
| Engineering (4-6 engineers) | $80-120K | Salary |
| Designer/Product | $15K | |
| Marketing | $20K | Content, ads |
| Infra | $15-20K | Multi-region, scaling |
| **Total** | **$130-175K** | Funded by $400K+ MRR |

### Team

- Month 1-13: You + 3 engineers + 1 designer + 1 community manager
- Month 14-26: You + 4-6 engineers + 1-2 designers + 2 community managers + 1 marketer

---

## V5: Mature (Ongoing)

**Timeline:** Apr 2028+

**Mission:** 500K+ users, $1M+ MRR, sustainable platform.

### Features
- ✅ AI analysis (hand strength evaluation, leak detection)
- ✅ International expansion (multi-language, regional leaderboards)
- ✅ Enterprise white-label (poker sites use Pokza replayer)
- ✅ Advanced training tools (study mode, range visualization)
- ✅ Financial services (bankroll tracking, tax reporting)

### Team
- 10-15 people (engineers, designers, ops, community, support)

### Success Criteria

- ✅ 500K+ MAU
- ✅ $1M+ MRR
- ✅ Profitable and self-sustaining
- ✅ International presence (30%+ non-US)

---

## Financial Timeline (Bootstrapped)

| Month | Phase | Users | MRR | Burn | Status |
|-------|-------|-------|-----|------|--------|
| 1-2 | V0 start | 0 | $0 | -$0 (solo) | Building |
| 3-4 | V0 launch | 500 | $50-100 | -$0 | Live! |
| 5-6 | V1 start | 1K | $200 | -$500/mo | Day job + building |
| 7-8 | V1 scale | 3K | $1K | -$1K/mo | Hiring freelancer |
| 9-10 | V1 coaching | 5K | $2K | -$1K/mo | Can go full-time soon |
| 11-12 | V1 end | 10K | $4-5K | +$1-2K/mo | **Go full-time** |
| 13-14 | V2 start | 15K | $8K | +$2K/mo | Hire first engineer |
| 15-18 | V2 scale | 30K | $25K | +$10K/mo | Hire second engineer |
| 19-24 | V2 end | 50K | $50K | +$20K/mo | Cash-flow positive |
| 25-30 | V3 start | 80K | $70K | +$30K/mo | Hiring more |
| 31-36 | V3 end | 150K | $120K | +$60K/mo | **Team of 3-4** |
| 37-48 | V4 | 300K | $400K | +$200K/mo | **Hiring 5+ people** |
| 49+ | V5 | 500K+ | $1M+ | Self-sustaining | **Mature platform** |

---

## Key Decisions

### Lean Development

**No design system V0-V1.** Copy proven layouts (Binked, Twitter), iterate based on users.

**No DMs V0-V1.** Too complex, comments are enough.

**No native app V0-V2.** Mobile web works fine, saves 3+ months.

**No notifications V0-V1.** Email only, Web Push later.

**No advanced features early.** Hand creation, replayer, feed, follow = MVP. Nothing else.

### Monetization Strategy

**Premium first** ($9/month from day 1). Not ads. People will pay for good product.

**Coaching commission** (15-20%). Give coaches free platform, take commission when they earn.

**Affiliate revenue** (PokerStars, GTO Wizard, PT4). These companies pay for referrals.

**Sponsorships** (once you have 30K+ users). Poker sites want to reach players.

**Creator revenue share** (later, once you have critical mass). Incentivize content.

### Growth Hacking

**Week 1-2:** Get 10 top poker influencers to try (free premium).

**Week 3-4:** Launch on Product Hunt (target poker audience).

**Month 2-3:** Reddit + Discord communities (organic, viral growth).

**Month 4-5:** Twitter presence (daily poker content, user spotlights).

**Month 6+:** Paid ads only if cash-flow positive.

**Goal:** 50% organic growth, 50% paid (once revenue available).

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Burnout (solo for 6-10 months) | High | Critical | Find co-founder early, share workload |
| Free tier quotas hit | Medium | High | Monitor usage, optimize queries |
| Competing product launches | Medium | Medium | Move fast, ship V1 in 6 months |
| Users don't pay | Medium | High | Validate pricing with 100 users, iterate |
| Coaches leave for competitor | Low | Medium | Build community, revenue share, exclusivity |
| Can't hire talent | Low | Medium | Hire from poker community (players want to build) |

---

## Summary

**V0 (8 weeks):** Prove product works, get 500 users, $0 cost.

**V1 (24 weeks):** Polish, monetize, reach 10K users, $50K MRR.

**V2 (24 weeks):** Coaching marketplace, analytics, ads. 50K users, $50K MRR.

**V3 (26 weeks):** Mobile app, groups, pro program. 150K users, $120K MRR.

**V4 (26 weeks):** Integrations, tournaments, certifications. 300K users, $400K MRR.

**V5 (Ongoing):** Scale to 500K+ users, $1M+ MRR.

**Key insight:** By month 24 (V2 end), you have a $50K MRR sustainable business. By month 36 (V3 end), you're hiring and scaling. By month 48 (V4 end), you're a $400K+ MRR company with team of 5-8 people — all from $0 invested capital.

**The advantage of bootstrapping:** You keep 100% equity. No investors to answer to. Sustainable pace. Real profitability discipline.
