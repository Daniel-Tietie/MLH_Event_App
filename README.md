# Hackathon Project Brief: Sports Pairing Platform

**Team:** 2 people
**Format:** Website (web app), built during the hackathon. A mobile app may come later.
**Working name:** TBD

## 1. Concept

A platform that matches people who want to play or train together. Think LinkedIn-style profiles plus Tinder-style matching, but for sports and outdoor activities.

**Terms used in this brief**
- **Host:** a person who creates and runs an activity.
- **User:** a person who joins an activity. Anyone can be both a host and a user.

## 2. Goal and Pitch

Most people spend their free time on their phones. Many are lonely, and it is hard to meet people outside your usual circle. We want to give people an easy way to meet, get active, and build real relationships in their own community, regardless of background.

Pitch points for the judges:
1. Bring people in the community together.
2. Promote a healthy community through activity.
3. Give people a real alternative to screen time, a place to bond and form meaningful relationships.

## 3. Core Features

### Profiles
- Profile picture, name, bio.
- Sports they play.
- Level per sport: casual, competitive, professional, D1, D2, ex-player, retired. Used for recommendations and matching.
- Users can post which sports they play so others can find them.

### Hosting and joining activities
- Hosts create activities: cycling, basketball, running, hiking, badminton, tennis, and so on.
- **Participant cap:** the host sets a limit (e.g. 8 companions). The listing closes automatically when the cap is reached, and the host can also close it manually.
- **Group and team events:** for sports like basketball, football, flag football and rugby, hosts can set up team events and challenge another team. This is different from casual activities like running or cycling, where people mainly go for health.

### Discovery
- Filter by city or radius.
- Notify nearby users whose sports and level match a new activity.

### Messaging
- In-platform messaging between hosts and users, plus a group chat per activity.

### Fitness tracking
- Optional. Users can connect fitness data from supported sources.
- Nothing is shared unless the user opts in.

### After the event
- Users can post photos (no video) from the activity.
- Others can comment, e.g. "Great ride, nice cycling with you."

### Event check-in
- Before an event starts, host and users verify each other on arrival with a QR code, so nobody can pretend to be someone else.

## 4. Safety and Trust

This is a platform for meeting strangers, so safety is a core part of the product, not an add-on.

| Risk | Our approach |
|---|---|
| Fake or dangerous accounts | Identity verification with a government ID. We lean toward a driver's license over a passport since a passport is more sensitive. Only verified users can host or join. Users must be 18+. |
| Night-time events | Restrict or flag night activities. If allowed, require public locations and extra safety features (below). |
| Abduction or trafficking risk | Scheduled check-ins and opt-in location sharing during the event window only. Users can share their live location with a trusted contact. |
| Leaving safely after an event | The app asks "Is the event still going on?" with Yes/No. Users can drop out from their own device at any time. If a user doesn't respond, escalate (reminder, then alert their trusted contact). |
| Impersonation at events | QR check-in before the event starts (see above). |

## 5. Hackathon Scope (for the AI model)

We have limited time, so build in this order.

**Must have (demo core)**
1. Sign up and login, profile with sports and level.
2. Create an activity with a participant cap; join it; it auto-closes at the cap.
3. Browse and filter activities by city or radius.
4. QR check-in for an event.

**Should have**
5. Messaging (basic activity chat).
6. Post-event photo posts with comments.
7. Team event / challenge mode.

**Mock or simulate for the demo**
- ID verification: show the flow with a placeholder step. Don't store real ID documents.
- Fitness data sync: mock one integration.
- Scheduled safety check-ins and location sharing: build a simple version and describe the full design in the pitch.

**Later (mention in pitch, don't build)**
- Native mobile app, full recommendation engine, real ID verification provider.

## 6. Instructions for the AI model

- Build a responsive website first.
- Ask me before choosing the tech stack if it isn't specified, and keep it simple enough for two people to finish in the time we have.
- Explain each design decision briefly so we can defend it to the judges.
- Keep the UI clean and modern, with a strong focus on trust and safety cues.
