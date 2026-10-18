# Publishing Party Spy on Google Play

Everything Play Console asks for, in the order it asks. Copy-paste the text
blocks; upload the files from this folder.

## 0. What you need ready

| Item | Where |
|---|---|
| App bundle (.aab) | `PartySpy-1.0.0-vc3.aab` on your Desktop |
| App icon, 512 × 512 | `store-assets/play-store-icon-512.png` |
| Feature graphic, 1024 × 500 | `store-assets/play-store-feature-graphic.png` |
| Phone screenshots, 1080 × 1920 (min 2, max 8) | `store-assets/screenshots/` |
| Privacy policy URL | `https://<your-coolify-domain>/privacy-policy.html` (the page ships with the web build) |
| Developer email | Your support email, e.g. sumitsah250@gmail.com |

Package name: **com.sumix.partyspy** (permanent). Version 1.0.0, version code 3.

---

## 1. Create app (Play Console → Create app)

- **App name:** `Party Spy: Family Game Night`
- **Default language:** English (United States) – en-US
- **App or game:** Game
- **Free or paid:** Free (a free app can never become paid later)
- Tick the Developer Program Policies and US export laws declarations.

Other good names if that one is taken (all under Play's 30-character limit):
`Party Spy – Secret Mission Game` · `Party Spy: Party Games` · `Party Spy – Game Night`

## 2. Main store listing (Grow users → Store presence → Main store listing)

**App name (≤ 30):**
```
Party Spy: Family Game Night
```

**Short description (≤ 80):**
```
Secret missions for parties & family nights. Do it. Don't get caught!
```

**Full description (≤ 4,000):**
```
Party Spy turns any hangout into a game. Everyone gets a secret mission, like getting a friend to say "pizza", to high-five you or to hum a Bollywood song. Pull yours off without anyone noticing. Think someone is working on you? Call it out!

Perfect for house parties, family get-togethers, Diwali, Dashain and Tihar nights, weddings, birthdays, road trips and game nights with friends.

HOW TO PLAY
• Add 3 to 10 players and pass one phone around. Each player holds the card to see their secret mission.
• Put the phone in the middle. 3, 2, 1… let's start the chaos!
• Pull off your mission before the timer runs out, without getting caught.
• Suspect someone? Call them out. Guess right and their mission fails.
• When time's up, reveal everything, swipe to vote, and crown the winner.

FEATURES
• 200+ missions in 15 categories: Everyday, Desi Adda, Friends, Couples, Family, Festival, Wedding, College, Birthday, Movie Night, Sports, House Party, Dinner, Road Trip and Office
• Write your own missions, or edit and delete any mission to fit your group
• Easy, medium and hard missions, worth more points
• Three modes: Classic, Chaos (a surprise rule every round) and Sudden Death
• Chaos rules like Whisper Only, Accent Round, Swap, Bounty and Reverse
• Optional double agent who secretly sabotages another player
• Play on one phone, or in a private room where everyone uses their own phone
• Hall of Fame with lifetime stats, badges and unlockable avatars
• Share the results to WhatsApp, Instagram and more
• No accounts, no sign-up, no ads

Made by Sumix Developers.
```

**Graphics:** upload the icon, the feature graphic and 4–8 screenshots in this
order: 1-home, 2-pass-the-phone, 3-chaos-rule, 4-lets-start, 5-timer, 6-vote,
7-mission-library.

## 3. Store settings (Grow users → Store presence → Store settings)

- **App category:** Games → **Casual** (Play has no "Party" category; Casual is the best fit. Board or Word also work.)
- **Tags (pick up to 5):** Party game, Family game, Multiplayer, Casual, Offline
- **Contact email:** your support email
- **Website:** your Coolify domain (optional)
- **Phone:** optional

## 4. App content (Policy → App content)

| Section | Answer |
|---|---|
| Privacy policy | `https://<your-coolify-domain>/privacy-policy.html` |
| App access | **All functionality is available without special access** (no login) |
| Ads | **No, my app does not contain ads** |
| Content rating | See the questionnaire answers below |
| Target audience | Ages **13–15, 16–17, 18 and over**. Do **not** pick under 13 (that brings in the stricter Families policy). "Could the app unintentionally appeal to children?" **No** |
| News app | No |
| Data safety | See below |
| Government app | No |
| Financial features | My app doesn't provide any financial features |
| Health | My app doesn't have any health features |

### Content rating questionnaire (IARC)

- Category: **Game** (Casual / party)
- Violence, blood, fear, horror: **No**
- Sexuality or nudity: **No** (the Couples pack is light and romantic: compliments, "aww", dream dates)
- Language (profanity, crude humour): **No**
- Controlled substances (drugs, alcohol, tobacco): **No**
- Gambling or simulated gambling: **No** (points only, no money, no casino mechanics)
- **Users can interact or exchange content:** **Yes**. In private rooms, players invited with a room code see each other's nicknames and the host's custom missions. There is no open chat.
- Shares the user's location: **No**
- Digital purchases: **No**

Expected result: Everyone / PEGI 3 (or 7), with the "Users Interact" note.

### Data safety

- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes
- **Do you provide a way for users to request that their data is deleted?** Not applicable / data isn't stored (rooms are ephemeral; on-device data is deleted with the app)
- Data type: **Personal info → Name** (the nickname typed to join a private room)
  - Collected: **Yes** · Shared: **No**
  - Processed ephemerally: **Yes**
  - Required or optional: **Optional** (only used in private rooms)
  - Purpose: **App functionality**
- Nothing else is collected: no location, contacts, photos, device IDs, analytics or crash logs.

Review these against Google's current definitions before you submit; the final answers are your responsibility.

## 5. Release (Test and release)

1. **Internal testing** first: Create new release → upload `PartySpy-1.0.0-vc3.aab` → release name `1.0.0 (3)` → paste the release notes below → Save → Review → Roll out. Add yourself as a tester and install from the opt-in link to check it on a real phone.
2. **Closed testing:** personal developer accounts created after November 2023 must run a closed test with **at least 12 testers for 14 days in a row** before Google allows production. Add 12+ friends' Gmail addresses as a tester list.
3. **Production:** once the closed test requirement is met, apply for production access, promote the release, pick countries (all, or start with India and Nepal) and roll out. First reviews usually take a few days.

App signing: keep **Play App Signing** on (default). Your upload key is stored in your Expo account (`npx eas-cli credentials` to back it up).

### Release notes ("What's new", ≤ 500 characters per language)

```
<en-US>
🎉 Welcome to Party Spy!
• 200+ secret missions in 15 categories: friends, family, couples, festivals, weddings and more
• Classic, Chaos and Sudden Death modes
• Call out anyone you think is targeting you
• Write, edit or delete your own missions
• Play on one phone or everyone on their own phone
• Hall of Fame with badges and unlockable avatars
Do it. Don't get caught!
</en-US>
<hi-IN>
🎉 Party Spy में आपका स्वागत है!
• 15 कैटेगरी में 200+ सीक्रेट मिशन: दोस्त, परिवार, कपल, त्योहार, शादी और भी बहुत कुछ
• Classic, Chaos और Sudden Death मोड
• जिस पर शक हो, उसे Call Out करें
• अपने मिशन लिखें, बदलें या हटाएँ
• एक फ़ोन पर या सब अपने-अपने फ़ोन पर खेलें
करो, पर पकड़े मत जाओ!
</hi-IN>
<ne-NP>
🎉 Party Spy मा स्वागत छ!
• १५ वटा कोटिमा २००+ गोप्य मिसन: साथी, परिवार, जोडी, चाडपर्व, बिहे र अझै धेरै
• Classic, Chaos र Sudden Death मोड
• शंका लागेको मान्छेलाई Call Out गर्नुहोस्
• आफ्नै मिसन लेख्नुहोस्, बदल्नुहोस् वा हटाउनुहोस्
• एउटै फोनमा वा सबैजना आ-आफ्नो फोनमा खेल्नुहोस्
गर, तर नसमातिऊ!
</ne-NP>
```
(Hindi and Nepali were machine-written: have a native speaker read them once.)
Hindi and Nepali notes only show if you add those languages under Store listing → Manage translations.

## 6. App facts (from the built bundle)

- Permissions: **INTERNET, VIBRATE, WAKE_LOCK** only. Microphone and storage are blocked.
- No accounts, ads, analytics or in-app purchases. Pass-the-phone mode works offline.
- Supports all phone CPU types (Play delivers only the matching one).

## 7. Future updates

1. Raise `"version"` in `app.json` (e.g. 1.0.1). The version code goes up automatically.
2. `npx eas-cli build --platform android --profile production`
3. Upload the new .aab (or, after the first manual upload, `npx eas-cli submit --platform android --profile production`
   with a Google Play service account key saved as `google-play-service-account.json`; it uploads a draft to internal testing).
