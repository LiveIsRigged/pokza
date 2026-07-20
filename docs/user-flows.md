# User Flows

Detailed, click-optimized user journeys for every core interaction in Pokza.

Every flow minimizes friction: fewer screens, fewer inputs, faster completion.

---

## 1. Sign Up Flow

**Goal:** New user creates account and enters app in <2 minutes.

**Entry Point:** App launch (first time) or "Sign Up" button on login screen.

```
START
  ↓
Screen 1: Welcome Screen
  - Title: "Pokza"
  - Subtitle: "Share • Analyze • Learn"
  - 2 buttons: [Sign Up with Email] [Sign Up with Google]
  - Optional: "Already have an account? [Log In]"
  ↓ [Tap: Sign Up with Email]
Screen 2: Email Entry
  - Input: Email
  - Input: Password (with show/hide toggle)
  - Submit button: [Create Account]
  ↓ [Enter email, password, tap Create]
Screen 3: Email Verification (async)
  - Loading state: "Sending verification email..."
  - User receives email with 6-digit code
  - Input: Verification code (6 digits)
  - Submit button: [Verify]
  ↓ [Enter code, tap Verify]
Screen 4: Profile Setup (Quick)
  - Input: Display Name (e.g., "AlexK")
  - Input: Handle/Username (auto-generate from name, editable)
  - Optional: Upload avatar (can skip)
  - Optional: Bio (can skip)
  - Submit button: [Continue to App]
  ↓ [Fill name, tap Continue]
Screen 5: Onboarding Tour (optional, dismissible)
  - Welcome card: "Let's get started"
  - 3 quick screens: How to create hand, how to play replayer, how to share
  - Each screen: Back/Next buttons
  - Skip option: [Skip Tour]
  ↓ [Tap Next 3x, or Skip]
Screen 6: Feed (Home)
  - Empty state: "No hands yet. Create your first hand!"
  - Button: [+ Create a Hand]
  - Feed empty (no posts to show yet)
  ✓ FLOW COMPLETE

Clicks: 1 (email signup) + 3 (email → password → code) + 1 (profile name) + 1 (continue) = 6 clicks
Time: ~90 seconds (including email verification wait)

Alternative: Sign Up with Google
  - [Tap: Sign Up with Google]
  - Redirects to Google OAuth
  - Auto-fills email, profile name
  - Skips email verification
  - Goes directly to profile setup
  Clicks: 1 + 1 (OAuth approve) + 1 (continue) = 3 clicks
  Time: ~30 seconds
```

---

## 2. Log In Flow

**Goal:** Returning user logs in in <30 seconds.

```
START
  ↓
Screen 1: Login Screen (if logged out)
  - Input: Email
  - Input: Password (show/hide toggle)
  - Button: [Log In]
  - Link: [Forgot password?]
  ↓ [Enter email, password, tap Log In]
Screen 2: Feed (Home)
  ✓ FLOW COMPLETE

Clicks: 2 inputs + 1 submit = 3 clicks
Time: ~20 seconds

Alternative: Biometric Login (iOS Face ID / Android Fingerprint)
  - If user has enabled biometric:
  - On app launch, FaceID prompt appears
  - [Approve with face/fingerprint]
  - Directly to Feed
  Clicks: 1 (approve)
  Time: ~5 seconds

Forgot Password:
  - [Tap: Forgot password?]
  - Input: Email address
  - [Send reset link]
  - User receives email with reset link
  - Clicks link → Password reset page
  - Input: New password
  - [Save password]
  - Redirects to login
  Clicks: 3 + login = 4 clicks total
```

---

## 3. Create Hand Flow

**Goal:** User publishes a hand in <5 minutes.

**Entry Point:** [+ Create Hand] button (any screen has floating button)

```
START
  ↓
Screen 1: Hand Context (Setup)
  - Game type dropdown: "Cash" / "Tournament"
  - Blinds inputs: SB / BB (auto-filled from last session)
  - Effective stack input: (e.g., 500)
  - Player count dropdown: 6-max (default)
  - Hero position dropdown: "CO" (default)
  - Location input (optional): "Club Circus, Brussels"
  - Buy-in input (optional): "$500"
  
  Button: [Continue]
  
  Back button: [← Back] (goes to Feed)
  
  Clicks: Tap to fill context = 4-7 taps (depending on defaults)
  ↓ [Fill context, tap Continue]

Screen 2: Hole Cards (Hero)
  - Card Picker: 52-card grid (4 rows, suits)
  - Select first card: [Tap A♠]
  - Select second card: [Tap K♦]
  - Cards show as "A♠ K♦" at top
  - Button: [Continue]
  
  Back button: [← Back]
  
  Clicks: 2 card taps + 1 continue = 3 clicks
  ↓ [Select 2 cards, tap Continue]

Screen 3: Preflop Actions
  - Board section: "Cartes puis actions"
  - (No board for preflop, so skip board)
  
  Action section:
  - Current player to act: "UTG"
  - Action buttons: [Fold] [Call (2)] [Raise]
  - Current bet: 2 (SB), Owed: 2
  
  Tap [Fold] → UTG folds
  Next player: HJ
  Repeat actions until everyone is in or hand ends
  
  Undo button: [↩ Undo] (revert last action)
  
  Continue: When action reaches hero on preflop, hero acts
  Hero taps [Raise]
    → Input field appears: "Enter amount (minimum 5)"
    → Type "15"
    → [Confirm]
  
  Next player acts (BB)
  ... (repeat)
  
  When preflop done (all in or action complete):
  [Continue to Flop]
  
  Clicks: ~8-15 taps (depends on hand length)
  ↓ [Add all preflop actions, tap Continue]

Screen 4: Flop
  - Board picker: Select 3 cards
  - [Tap Q♥] [Tap J♦] [Tap 2♣]
  - Cards show at top
  
  Action section: (same as preflop)
  - BB acts, hero acts, etc.
  
  Continue: [Continue to Turn]
  
  Clicks: 3 cards + action taps (~5-10)
  ↓ [Add board, add actions, tap Continue]

Screen 5: Turn
  - Board picker: Select 1 card (new card)
  - [Tap T♠]
  - Board now shows: Q♥ J♦ 2♣ T♠
  
  Action section: (same)
  
  Continue: [Continue to River]
  
  Clicks: 1 card + action taps (~3-8)
  ↓ [Add turn card, add actions, tap Continue]

Screen 6: River
  - Board picker: Select 1 card (final card)
  - [Tap 7♦]
  - Board complete: Q♥ J♦ 2♣ T♠ 7♦
  
  Action section: (same, but typically showdown or fold)
  
  Continue: [Continue to Showdown]
  
  Clicks: 1 card + action taps (~2-5)
  ↓ [Add river card, add actions, tap Continue]

Screen 7: Showdown (Optional)
  - Message: "Cartes montrées par les adversaires (optionnel)"
  - Villain chips shown: [BB] [SB] etc.
  - If villain still in hand, can assign cards
  - Card picker for villain
  - [Skip] or [Continue] without assigning
  
  Clicks: 0-2 (if skipping, 0; if assigning, 1-2)
  ↓ [Skip or assign cards, tap Continue]

Screen 8: Publish
  - Input: Hand title (required)
    - Placeholder: "e.g., Hero call against aggressive reg"
  - Input: Vote question (optional)
    - Placeholder: "e.g., Should I have folded preflop?"
  - Visibility dropdown: Public / Private / Friends-only
  - Button: [Publish Hand]
  
  Back button: [← Back]
  
  Clicks: 1 (title input) + optional vote + 1 visibility + 1 publish = 3-4 clicks
  ↓ [Fill title, tap Publish]

Screen 9: Success (Confirmation)
  - Title: "Hand published! 🎉"
  - Show: Link to hand, share button
  - Buttons: [View Hand] [Share] [Create Another] [Back to Feed]
  
  ✓ FLOW COMPLETE

Total Clicks: 4 + 3 + 8 + 3 + 1 + 1 + 4 = ~24 clicks (including action entries)
Total Time: 3-5 minutes (depending on hand complexity)

Optimization Notes:
- Card picker uses single-tap (not two-step rank/suit)
- Action entry is streamlined (buttons, not dropdowns)
- Defaults filled in (blinds, positions) reduce inputs
- All-in handling automatic (no extra step)
- Undo available at every step to prevent frustration
```

---

## 4. View & Replay Hand Flow

**Goal:** User plays back hand in <30 seconds, no friction.

**Entry Point:** Tap on hand card in Feed, or from Profile → Hands grid

```
START (from Feed)
  ↓
Screen 1: Feed (Home)
  - Scroll, tap on hand card
  ↓ [Tap hand card]

Screen 2: Hand Replayer (Full Screen)
  - Table visualization (elliptical, 6 seats)
  - Seats show: avatars, stacks, fold status
  - Board shows: cards progressively (preflop empty, flop shows 3, etc.)
  - Action callout: center screen (e.g., "UTG raises to 20")
  - Controls: [←] [▶ Play] [→] at bottom
  
  Tap [▶ Play]:
  - Replayer auto-plays all actions
  - Cards flip with animation
  - Chips move to pot
  - Action callout fades in/out
  - Speed: 0.5x / 1x / 2x (tap speed control)
  
  Tap [→] (next action):
  - Advances one action
  
  Tap [←] (previous action):
  - Goes back one action
  
  Swipe down or [← Back]:
  - Exits replayer
  ↓ [Play hand or swipe back]

Screen 3: Feed (Back to where you were)
  ✓ FLOW COMPLETE

Clicks: 1 (tap hand) + optional controls + 1 (back/swipe) = 2 clicks minimum
Time: ~30 seconds

Alternative: Full Screen Info
  - Tap [ℹ️] on replayer → Shows:
    - Player names, positions, stacks
    - Action history (scrollable)
    - Pot progress
    - Game type, stakes
  - Swipe up to close info
  Clicks: 1 (info) + swipe = 2 clicks
```

---

## 5. Like Hand Flow

**Goal:** Express appreciation instantly (one tap).

**Entry Point:** On hand card (Feed or Replayer)

```
START
  ↓
Screen: Hand card visible (Feed or Replayer context)
  - Action bar shows: ❤️ (0) | 💬 (1) | 🔗 | ⋯
  ↓ [Tap ❤️]

Action:
  - Heart animates: outline → filled, scale up slightly
  - Count increments: 0 → 1
  - Post request sent (async)
  - If user already liked: heart un-fills, count decrements
  ↓ [Complete]

✓ FLOW COMPLETE

Clicks: 1 (tap heart)
Time: <1 second

Visual Feedback:
  - Heart color: Navy outline → Gold filled
  - Animation: 200ms scale pulse (1.0 → 1.2 → 1.0)
  - Undo: Tap again to unlike (reverses animation)
```

---

## 6. Comment on Hand Flow

**Goal:** Write and post a comment in <1 minute.

**Entry Point:** Tap 💬 on hand card

```
START
  ↓
Screen 1: Replayer (with hand visible)
  - Action bar at bottom
  - Tap [💬 Comments] or scroll down to comments section
  ↓ [Tap comments button]

Screen 2: Comments Sheet (Bottom slide-up)
  - Existing comments shown (top N, scrollable)
  - Comment 1: "@Alice: Great 3bet sizing!"
  - Comment 2: "@Bob: I would have folded preflop"
  
  Text input at bottom:
  - Placeholder: "Share your thoughts..."
  - Input field grows as user types (multi-line)
  - Button: [Post] (disabled until text entered)
  ↓ [Tap input, type comment]

Screen 3: Comment Posted
  - Comment appears in list (bottom, newest)
  - Animation: slide up + fade in
  - Text shows: Your name, comment, "now" timestamp
  - Options on hover/long-press: [Delete] [Edit]
  
  Sheet stays open (user can post more or [← Close])
  ↓ [Tap Close]

Screen 4: Replayer (Back to)
  - Comment count incremented: 💬 (2) → 💬 (3)
  ✓ FLOW COMPLETE

Clicks: 1 (tap comments) + 1 (tap input) + 1 (post) + 1 (close) = 4 clicks
Time: ~30-60 seconds

Optimization:
  - Input field always visible (no separate screen)
  - Mentions: Type @ → autocomplete list appears
  - Markdown support (bold, code blocks, links)
  - Real-time preview (optional)
```

---

## 7. Vote on Hand Flow

**Goal:** Vote on creator's question instantly.

**Entry Point:** On hand with vote question

```
START (assuming hand has vote question)
  ↓
Screen: Feed hand card
  - Below hand replayer:
  - Question: "Should I have 3bet preflop?"
  - Vote options: [Yes] [No] [Unsure]
  - Current votes shown: Yes: 12 | No: 5 | Unsure: 3
  ↓ [Tap Yes]

Action:
  - Button highlights: [Yes] now filled/highlighted
  - Vote count updates: Yes: 12 → 13
  - User's vote registered
  ↓ [Complete]

Screen: Back to Feed
  ✓ FLOW COMPLETE

Clicks: 1 (tap vote option)
Time: <1 second

Undo:
  - Tap same button again: Vote removed, count decrements
  - Tap different button: Vote switches, counts update
```

---

## 8. Share Hand (Public) Flow

**Goal:** Get hand link and share externally in <30 seconds.

**Entry Point:** Tap 🔗 on hand card

```
START
  ↓
Screen: Feed (hand card visible)
  - Action bar: ❤️ | 💬 | [🔗 Share]
  ↓ [Tap Share]

Screen 2: Share Sheet
  - Hand title shown: "Hero 3bet vs aggressive opponent"
  - Link: "pokza.com/hands/abc123" (copyable)
  - Buttons (iOS):
    - [Copy Link]
    - [Share to Messages]
    - [Share to Mail]
    - [Share to Twitter]
    - [Share to Discord]
    - [More...]
  ↓ [Tap Copy Link or direct share option]

Action:
  - Copy: Text copied to clipboard (toast: "Link copied!")
  - Direct share: Native share sheet opens
  
  If [Share to Twitter]:
  - Twitter app opens (or web)
  - Pre-filled text: "Check out this hand: [link] via @pokza"
  - User can edit before posting
  
  ✓ FLOW COMPLETE

Clicks: 1 (tap share) + 1 (select share method) = 2 clicks
Time: ~15 seconds

Link Preview:
  - When link pasted elsewhere (Twitter, Slack, Discord):
  - Card preview shows: Hand title, replayer thumbnail, user avatar
  - Click preview → Opens Pokza hand view (in-app or web)
```

---

## 9. Share Hand (Private) Flow

**Goal:** Share hand with specific person/group in <1 minute.

**Entry Point:** Tap 🔗 on hand card, then [Share Privately]

```
START
  ↓
Screen 1: Hand card (Feed)
  - Action bar
  ↓ [Tap 🔗]

Screen 2: Share Options
  - [Copy Public Link]
  - [Share with Friends / Group]
  - [Direct Message]
  ↓ [Tap Share with Friends]

Screen 3: Friend Selector
  - List of followers/friends
  - Checkboxes: [✓] @AlexK, [ ] @BobPlayer, [ ] @CoachSarah
  - Search bar: "Find friend..."
  - Button: [Share with Selected]
  
  Alternative: [Share with Group]
  - Group list: "NYC Poker Crew", "Study Group", etc.
  - Tap group → Hand posted to group feed
  
  ↓ [Select friends and tap Share]

Screen 4: Confirmation
  - Toast: "Hand shared with 2 friends!"
  - Friends receive notification: "@YourName shared a hand with you"
  ✓ FLOW COMPLETE

Clicks: 1 (tap share) + 1 (share option) + multi-select + 1 (confirm) = 4-5 clicks
Time: ~45 seconds

Alternative: Direct Message
  - [Tap Direct Message]
  - Friend selector (same as above)
  - Selected friends receive hand via DM
  - DM shows hand preview + link
```

---

## 10. Search Flow

**Goal:** Find hands or players in <1 minute.

**Entry Point:** Tap 🔍 (search icon in bottom nav or top nav)

```
START
  ↓
Screen 1: Feed (any screen)
  - Top nav: Search bar [🔍 Search hands, players...]
  ↓ [Tap search bar]

Screen 2: Search Results (empty state initially)
  - Input: Keyboard visible, cursor in search box
  - Placeholder: "Search hands, players, topics..."
  ↓ [Type "3bet"]

Screen 3: Live Search Results (as you type)
  - Results grouped by category:
  
  Players (matching "3bet" in name):
    - @3betMachine (240 followers)
    - @3betAndy (120 followers)
  
  Hands (matching "3bet" in title/description):
    - "Hero 3bet IP preflop" by @AlexK (4 likes)
    - "3bet pot in SNG" by @CoachSarah (12 likes)
  
  Topics/Hashtags:
    - #3bet (2,400 posts)
    - #3betting (1,200 posts)
  
  ↓ [Tap result]

Screen 4A: If Player Selected
  - Navigates to player profile
  - Shows: Avatar, bio, follower count, [Follow]
  - Hand gallery below
  ✓ FLOW COMPLETE

Screen 4B: If Hand Selected
  - Opens hand replayer
  ✓ FLOW COMPLETE

Screen 4C: If Hashtag Selected
  - Shows feed of all hands tagged #3bet
  - Feed infinite scroll
  ✓ FLOW COMPLETE

Clicks: 1 (tap search) + typing + 1 (select result) = 2-3 clicks
Time: ~30 seconds

Optimization:
  - Search is live (results as you type)
  - Recently searched (if no input) shows: Recent searches + trending topics
  - Filters: [All] [Hands] [Players] [Topics] (to narrow results)
```

---

## 11. View Profile Flow

**Goal:** See user's stats and hands in <1 minute.

**Entry Point:** Tap user avatar or name (from Feed, Comments, etc.)

```
START (from Feed)
  ↓
Screen 1: Feed hand card
  - User info: Avatar (40px), Name "@AlexK"
  ↓ [Tap avatar or name]

Screen 2: User Profile
  - Header (full-width image):
    - Cover photo (gradient or user-uploaded)
    - Avatar (80px, positioned -40px from bottom)
    - Name: "Alex K"
    - Handle: "@AlexK"
    - Badge: "Grinder" (gold)
    - Bio: "2/5 crusher at Club Circus. Study group every Tuesday."
  
  Stats row:
    - Hands Shared: 127
    - Followers: 340
    - Win Rate: 52.3%
    - Coaching: Available
  
  Action buttons:
    - If own profile: [Edit Profile]
    - If other's profile: [Follow] or [Unfollow] (if followed)
                          [Send Message]
  
  Tabs:
    - [Hands] [Analyses] [Comments] [Likes]
  ↓ [Tap Hands tab]

Screen 3: Hand Gallery
  - Grid: 2-3 columns (responsive)
  - Hands: Card previews (16:9 aspect ratio)
  - Each card shows: Small replayer thumbnail, date, likes count
  - Infinite scroll: Load more as user scrolls down
  ↓ [Tap hand card]

Screen 4: Hand Replayer (full screen)
  - Same as "View Hand" flow
  ↓ [Swipe back]

Screen 5: Back to Profile (Hand Gallery)
  ✓ FLOW COMPLETE

Clicks: 1 (tap avatar) + 0 (Hands tab selected by default) + 1 (tap hand) + 1 (back) = 3 clicks
Time: ~1 minute

Other Tabs:
  - [Analyses]: Only analyses posted by this user (if coach)
  - [Comments]: Comments user has made on others' hands
  - [Likes]: Hands user has liked (if public setting enabled)

Follow Action:
  - Tap [Follow]
  - Button state changes: [Follow] → [Following]
  - Notification sent to followed user: "@YourName started following you"
```

---

## 12. Edit Profile Flow

**Goal:** Update profile info in <2 minutes.

**Entry Point:** On own profile, tap [Edit Profile]

```
START
  ↓
Screen 1: Profile (own)
  - [Edit Profile] button (top-right)
  ↓ [Tap Edit Profile]

Screen 2: Edit Profile Form
  - Avatar: Tap to upload/camera
  - Name: "Alex K" (editable)
  - Handle: "@AlexK" (editable, checked for availability)
  - Bio: "2/5 crusher at Club Circus..." (300 char limit)
  - Cover photo: Tap to upload
  - Coaching: Toggle "Available for coaching"
  - Hourly rate (if coach): "$100/hr"
  - Location: "Brussels, Belgium"
  - Website: "alexkcoaching.com" (optional link)
  
  Button: [Save Changes]
  ↓ [Make edits, tap Save]

Screen 3: Saving
  - Loading state: "Saving..."
  
Screen 4: Profile (Updated)
  - Toast: "Profile updated!"
  - Profile refreshes with new data
  ✓ FLOW COMPLETE

Clicks: 1 (edit) + inputs + 1 (save) = ~5-8 clicks total
Time: ~60-90 seconds
```

---

## 13. Follow/Unfollow Flow

**Goal:** Follow/unfollow player instantly (one tap).

**Entry Point:** On other user's profile

```
START
  ↓
Screen: User Profile (not own)
  - Top-right: [Follow] button (or [Following] if already followed)
  ↓ [Tap Follow]

Action:
  - Button animates: [Follow] → [Following] (gold background)
  - Followed user gets notification: "@YourName started following you"
  - Your feed now includes their hands (can filter to "Following" only)
  ↓ [Complete]

Screen: Profile (unchanged, button now shows [Following])
  ✓ FLOW COMPLETE

Clicks: 1 (tap follow)
Time: <1 second

Unfollow:
  - Tap [Following]
  - Confirmation popup: "Unfollow @AlexK?"
  - [Unfollow] [Cancel]
  - If confirmed: Button → [Follow], notification sent
  Clicks: 1 + 1 (confirm) = 2 clicks
```

---

## 14. Notifications Tab Flow

**Goal:** See all activity and re-engage (taps lead to relevant content).

**Entry Point:** Tap 🔔 in bottom nav

```
START (any screen)
  ↓
Screen 1: Bottom Navigation
  - Icons: [🏠 Home] [🔍 Search] [➕ Create] [💬 Messages] [🔔 Notifications]
  ↓ [Tap 🔔]

Screen 2: Notifications Tab
  - Unread badge: Shows "5" on icon (red dot)
  - List of notifications (newest first):
  
  1. ❤️ @AlexK liked your hand (2 hours ago)
  2. 💬 @CoachSarah replied: "Great line!" (4 hours ago)
  3. 👤 @BobPlayer started following you (1 day ago)
  4. 💬 @Grinder mentioned @you in a comment (1 day ago)
  5. 🎉 Your hand reached 100 likes (3 days ago)
  
  Each notification is tappable:
  ↓ [Tap notification #2 (comment)]

Screen 3: Hand Replayer (with Comments)
  - Hand opens directly to comments section
  - Coach's comment highlighted: "@CoachSarah: Great line!"
  - User can reply or view full replayer
  ✓ FLOW COMPLETE

Clicks: 1 (tap notifications) + 1 (tap notification item) = 2 clicks
Time: ~30 seconds

Actions:
  - Swipe notification left: [Delete] option
  - Tap notification: Opens relevant hand/profile
  - [Mark all as read]: Button at top
  - Settings: Tap ⚙️ for notification preferences (toggle types)
```

---

## 15. Direct Message Flow

**Goal:** Send private message to coach/friend in <1 minute.

**Entry Point:** Tap 💬 (Messages) in bottom nav OR from profile [Send Message]

```
START (from Messages tab)
  ↓
Screen 1: Messages Tab
  - List of recent conversations:
    1. @CoachSarah (Last: "When can you review my hand?") — 2 hours ago
    2. @AlexK (Last: "See you Tuesday!") — 1 day ago
  - Floating button: [+ New Message]
  ↓ [Tap Coach Sarah conversation]

Screen 2: Chat with @CoachSarah
  - Messages show chronologically
  - Your messages: right side, gold background
  - Their messages: left side, gray background
  - Input at bottom: [Message input] [Send button]
  
  You: "Can you review my hand from yesterday?"
  Coach: "Sure! Send me the link."
  You: [Tap input] → Type message or tap [Attach hand link]
  
  If [Attach hand link]:
  - Picker opens: Show your recent hands
  - [Tap hand] → Adds link to message
  - Send message (includes hand)
  
  ↓ [Type message, tap Send]

Screen 3: Message Sent
  - Message appears on screen
  - Read receipt (optional): "Seen 1 minute ago"
  ✓ FLOW COMPLETE

Clicks: 1 (tap conversation) + 1 (tap input) + 1 (send) = 3 clicks
Time: ~30 seconds

New Message:
  - [+ New Message] button
  - Friend selector: "Who do you want to message?"
  - Type friend name or select from list
  - [Tap friend]
  - Chat opens (empty)
  - Type message
  - [Send]
  Clicks: 1 + search/select + 1 (send) = 3-4 clicks
```

---

## 16. Settings & Preferences Flow

**Goal:** Adjust app settings in <2 minutes.

**Entry Point:** Tap ⚙️ (Settings) — usually in profile or burger menu

```
START
  ↓
Screen 1: Profile (own)
  - Top-right: [⚙️ Settings] or [⋯ More]
  ↓ [Tap Settings]

Screen 2: Settings Menu
  - Sections:
  
  Account
    - Email: alex@example.com [Edit]
    - Password: [Change Password]
    - 2FA: [Enable Two-Factor Auth] (toggle)
  
  Notifications
    - Likes: [On] [Off]
    - Comments: [On] [Off]
    - Follows: [On] [Off]
    - Mentions: [On] [Off]
    - Push notifications: [On] [Off]
  
  Privacy
    - Profile visibility: Public / Private / Friends-only
    - Show analytics to public: [On] [Off]
    - Allow coaching offers: [On] [Off]
  
  Appearance
    - Dark mode: [Auto] [Light] [Dark]
    - Font size: [Small] [Medium] [Large]
  
  Data
    - Export hands (CSV): [Download]
    - Delete account: [Delete Account]
  
  About
    - Version: 1.2.3
    - Terms: [Open]
    - Privacy Policy: [Open]
    - Support: [Contact Support]
  ↓ [Tap setting to change]

Screen 3A: If Toggle (e.g., Dark Mode)
  - Toggle switches immediately
  - App theme updates instantly
  ✓ SETTING SAVED

Screen 3B: If Input (e.g., Change Password)
  - Modal opens: "Change Password"
  - Input: Current password
  - Input: New password
  - Input: Confirm new password
  - [Save] [Cancel]
  ↓ [Enter data, tap Save]

Screen 4: Confirmation
  - Toast: "Password updated!"
  ✓ FLOW COMPLETE

Clicks: 1 (settings) + taps per setting = 3-5 clicks total
Time: ~60-120 seconds (depending on changes made)
```

---

## Summary: Clicks & Time by Flow

| Flow | Clicks (min) | Time (approx) | Optimize For |
|------|-------------|---------------|------|
| Sign Up | 3 (Google) | 30 sec | Biometric/OAuth |
| Log In | 3 | 20 sec | Biometric |
| Create Hand | ~24 | 3-5 min | Card picker, defaults, undo |
| View Replayer | 1-2 | 30 sec | Auto-play, speed control |
| Like | 1 | <1 sec | One-tap, animation |
| Comment | 4 | 30-60 sec | Input visible, markdown |
| Vote | 1 | <1 sec | One-tap |
| Share Public | 2 | 15 sec | Link + native share |
| Share Private | 4-5 | 45 sec | Quick friend selector |
| Search | 2-3 | 30 sec | Live results |
| View Profile | 3 | 1 min | Tab navigation |
| Edit Profile | 5-8 | 60-90 sec | Form layout |
| Follow | 1 | <1 sec | One-tap |
| Notifications | 2 | 30 sec | Links to content |
| DM | 3 | 30 sec | Attach hands |
| Settings | 3-5 | 60-120 sec | Toggles, modals |

---

## Design Principles (Applied to All Flows)

1. **Minimize inputs**: Defaults, autofill, dropdowns instead of typing
2. **One-tap for engagement**: Like, vote, follow = 1 click
3. **Visible input fields**: Never hide text areas (as in comments)
4. **Always show undo**: "Back" available on every screen
5. **Keyboard optimization**: Auto-focus next field, Return key submits
6. **Progressive disclosure**: Advanced options hidden by default (tap [More])
7. **Notifications drive re-engagement**: Every notification taps to relevant content
8. **Mobile-first spacing**: 44px minimum touch targets
9. **Smooth transitions**: Slide/fade between screens (don't jump)
10. **Micro-copy matters**: Button text guides user ("Share" not "Continue")

---

## Entry Points Summary

Most common entries to each flow:

| Flow | Entry 1 | Entry 2 | Entry 3 |
|------|---------|---------|---------|
| Sign Up | App launch (first time) | "Sign Up" link (login screen) | Deep link from invite |
| Log In | App launch (logged out) | "Log In" button (welcome) | Biometric prompt |
| Create Hand | [+ Create] FAB (any screen) | [+ Create] top button | Deep link |
| View Replayer | Tap hand (feed) | Tap hand (profile) | Tap notification |
| Like | Action bar (feed) | Action bar (replayer) | Action bar (profile) |
| Comment | [💬] (feed) | [💬] (replayer) | Notification (reply) |
| Vote | Vote section (feed) | Vote section (replayer) | Notification (question) |
| Share | [🔗] (feed) | [🔗] (replayer) | Post detail |
| Search | [🔍] (any nav) | Tap search bar (top) | Swipe-up gesture (iOS) |
| Profile | Tap avatar (feed) | Tap name (comment) | Tap avatar (notification) |
| Notifications | [🔔] (bottom nav) | Tap notification (popup) | Badge click |
| DM | [💬] (bottom nav) | [Message] (profile) | Notification |
| Settings | [⚙️] (profile) | [⋯ More] (menu) | Profile edit |

