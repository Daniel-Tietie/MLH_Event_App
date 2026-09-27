# Rally

**Find a game. Show up safely. Leave with friends.**

Rally is a web app that helps people meet through sport. Hosts post casual or competitive games, players join nearby ones, and safety is built into every step, from QR check-in on arrival to a "got home safe?" check afterwards.

Built in about 18 hours by a team of two at an MLH hackathon.

<!-- Add screenshots to docs/screenshots/ and uncomment:
![Explore](docs/screenshots/explore.png)
![Live safety](docs/screenshots/live-safety.png)
-->

---

## The problem

Most of our free time goes to screens, and it's hard to meet people outside your usual circle, especially if you're new to a city, a student, or working remotely. Sport is one of the easiest ways to connect, but showing up to play with strangers feels awkward and sometimes unsafe, so people don't go.

Existing tools either help you *find* a group or help you *track* a workout. Few of them help you trust the people you're about to meet, or make sure everyone gets home.

## Our solution

Rally covers the whole journey:

1. **Find:** games matched to your sports, level and location.
2. **Show up safely:** verified profiles, QR check-in, live check-ins, SOS, and a home-safe check.
3. **Trust:** show-up scores for serious games, members-only content, and reporting.
4. **Stay connected:** the people you play with become friends you follow and message, so you can plan the next game together.

---

## Features

### Discover and join
- **Explore** with search, filters (casual or pro, sport, open only) and sorting.
- **For you:** recommendations based on the sports and levels on your profile.
- **Friends are going:** upcoming games that people you follow have joined.
- **Nearby:** a map of events within 5–50 km of you.
- **Calendar:** see what's on each day and host something on an empty one.
- **Weather chip:** the forecast for the event's exact time and place, with a warning for rain, storms, heat, cold or wind.

### Hosting
- Create events with a sport, level, time, duration, a participant cap and a pinned meeting spot on the map.
- **Casual vs pro:** casual games are one-tap join; pro games need host approval.
- **Team vs team:** challenge another team, or leave an open challenge for any team to accept.
- **Age groups and gender-specific events:** for example 50+, 18–25, Women's, Men's, or Women & non-binary, like real leagues.
- The event closes automatically when full, and the host can close or reopen sign-ups at any time.

### Waitlist and approvals
- **Casual waitlist:** when an event is full, join the line. If someone leaves more than 30 minutes before the start, the next person is moved in automatically and notified. Inside 30 minutes nobody is moved in, so there's always time to get there.
- **Pro requests:** players request to join. The host sees each player's **show-up score**, games played, and sports and levels (never personal info), then approves or denies.

### Safety (the core of Rally)
- **QR check-in:** every attendee gets a private QR code that the host scans on arrival, so nobody can pretend to be someone else.
- **Live safety** opens 30 minutes before the start:
  - **Moving casual sports** (runs, rides, hikes) get a group radar showing who's still with the group.
  - **Games at a venue** get check-in mode, since people don't carry phones while playing.
  - **Smart check-ins** ask "Are you OK?" and flag anyone who doesn't respond.
  - **SOS** sends your location to the group and puts your emergency contacts one tap away.
  - **Leave early** tells the group you've left on purpose.
- **Time's up:** at the planned end time the host chooses to end the event or add 30 minutes.
- **Home-safe check:** after the event everyone confirms they got home, or asks for help.
- **Night safety mode** for late events.
- **Emergency contacts** are stored privately and masked on screen.
- **Show-up score:** for pro games, based on real QR check-ins, not self-reported. Leaving after the start counts as a no-show.

### Social
- **Friends:** follow people you've played with; mutual follows become friends. Only you see your followers, and you can remove anyone, which stops them re-following.
- **Direct messages** between friends only, so strangers can't message you. You can share an event card right in the chat.
- **Group chat** per event for everyone who joined.
- **Comments and photos** after the event, from the host and people who checked in. Every photo shows who posted it.
- **Profile:** photo, sports and levels, activity history, and ID verification.

### Privacy and moderation
- Comments, photos and chat are visible **only to event members**, and photos are stored in a private bucket with expiring links.
- **Report a photo:** three reports hide it automatically, and the host can hide or restore it.
- Date of birth and gender live in a separate private table that only the owner can read. They're used only to check eligibility and are never shown to anyone, including hosts.
- Gender is locked once set, so nobody can switch just to get into an event, and hosts can only run gender-specific events they could join themselves.
- The app is **18+**.

---

## How it works

```
Browser (React + Vite)
   │
   ├── Supabase Auth ........ sign-up / login, sessions
   ├── Supabase Postgres .... all data + the rules (row-level security + database functions)
   ├── Supabase Storage ..... profile pictures (public), event photos (private, signed links)
   ├── Supabase Realtime .... group chat, direct messages, live safety updates
   │
   ├── Leaflet + CARTO / OpenStreetMap tiles ... maps
   ├── Nominatim ............ place search for the meeting pin
   └── Open-Meteo ........... weather forecast (no key needed)
```

**Every rule lives in the database, not just the app.** Joining, the cap, waitlist promotion, pro approvals, eligibility, who can see photos and messages, and who can message whom are all enforced by Postgres functions and row-level security. They hold even if someone bypasses the front end with the public API key.

## Tech stack

| Layer | Tools |
|---|---|
| Front end | React 18, Vite 6, plain CSS |
| Backend | Supabase (Postgres + PostGIS, Auth, Storage, Realtime) |
| Maps | Leaflet, CARTO tiles (OpenStreetMap fallback), Nominatim geocoding |
| Other | Open-Meteo weather, `qrcode.react` |

---

## Getting started

**Requirements:** Node.js 20+ (22 recommended) and a free [Supabase](https://supabase.com) project.

1. **Install**
   ```bash
   git clone <this repo>
   cd Fitness_App
   npm install
   ```
2. **Environment:** copy `.env.example` to `.env` and fill it in:
   ```
   VITE_SUPABASE_URL=         # Supabase -> Project Settings -> API
   VITE_SUPABASE_ANON_KEY=    # Supabase -> Project Settings -> API
   VITE_CARTO_KEY=            # optional, free at carto.com (falls back to OpenStreetMap)
   ```
3. **Database:** in the Supabase SQL Editor, run `supabase/schema.sql` (the full structure). Optionally run `supabase/seed-demo-events.sql` for sample events.
4. **Run**
   ```bash
   npm run dev
   ```
   Then open the local URL Vite prints.

> The anon key is meant to be public; security comes from the database rules. Never commit `.env` or your Supabase service-role key.

## Project structure

```
src/
  pages/        Explore, Nearby, Calendar, My events, Friends, Host, Profile, Event detail, Live safety, Auth
  components/   Event cards, chat, messages, comments/photos, radar, requests/waitlist, weather, notifications...
  services/     Supabase calls (activities, safety, weather, auth)
  hooks/        Session, events, following
  utils/        Constants, geo helpers, recommendations, safety simulation
supabase/
  schema.sql            full database structure
  seed-demo-events.sql  sample data
  migrations/           the SQL for each feature, in the order it was added
```

---

## What's simulated for the demo

We want to be upfront about this:
- **ID verification** shows the flow, but no real ID check happens and no document is stored. A real version would use an ID provider (for example Stripe Identity).
- **Live location on the group radar** is simulated. A real version would use the phone's location with consent, only during the event window.
- **SOS** alerts the group in the app and opens your contacts. It doesn't contact emergency services.

## What's next

- Real ID verification, with age and gender coming from the ID
- Real opt-in GPS tracking during events
- Push notifications for the waitlist, requests, messages and SOS
- Optional two-factor login
- Accessibility tags (wheelchair-accessible venue, beginner-friendly)
- A native mobile app

## Team

- **Ashok Kumar** — <!-- role -->
- **<!-- teammate name -->** — <!-- role -->

Built at an MLH hackathon, September 2026.
