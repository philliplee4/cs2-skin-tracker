CS2 Skin Tracker
A full-stack web app that tracks CS2 skins across Skinport and DMarket, sending Discord notifications when listings match your criteria in real time.

What It Does

Browse all CS2 skins (rifles, pistols, knives, gloves)
Set tracking criteria — price range, wear, float, StatTrak, pattern, Doppler phase
Get notified instantly on Discord when a matching listing appears on Skinport
View current market prices from Skinport, DMarket, and Steam on each skin page
Manage all tracked items and matches from your profile page


Tech Stack

Frontend — Vanilla HTML, CSS, JavaScript
Backend — Node.js + Express
Database — PostgreSQL
Real-time — Skinport WebSocket live feed
Notifications — Discord webhooks


Requirements
Make sure these are installed before starting:
ToolDownloadNode.js (LTS)https://nodejs.orgPostgreSQLhttps://postgresql.org/downloadpgAdmin 4https://pgadmin.org (usually bundled with PostgreSQL)VS Codehttps://code.visualstudio.comLive Server (VS Code extension)Search "Live Server" by Ritwick Dey in VS Code extensions

Setup
1. Clone the repo
bashgit clone https://github.com/philliplee4/cs2-skin-tracker.git
cd cs2-skin-tracker
2. Install dependencies
bashcd server
npm install
3. Create the database

Open pgAdmin 4
Connect to your PostgreSQL server
Right click Databases → Create → Database, name it cs2_tracker
Right click cs2_tracker → Query Tool
Paste the contents of schema.sql and press F5

4. Create the .env file
!!! 

5. Start the server
bashcd server
node server.js
You should see:
Server running on http://localhost:3001
✅ Connected to Skinport websocket
📡 Joined CS2 sale feed (USD)
6. Start the frontend
In VS Code, right click index.html → Open with Live Server
The site opens at http://localhost:5500

Discord Notifications Setup

In Discord, right click the channel you want notifications in
Edit Channel → Integrations → Webhooks → New Webhook
Copy the webhook URL
On your profile page, paste the URL under Notification Settings → Discord Webhook
Click Test to confirm it works


How Tracking Works
EventWhat happensAdd tracked itemServer immediately scans existing Skinport listings and notifies if matches foundNew listing on SkinportWebSocket catches it in real time, notifies within seconds if it matchesListing gets soldDiscord notification sent, match removed from your profileEvery 20 minutesFull rescan of all Skinport listings for all tracked itemsWebSocket reconnectsAutomatic rescan to catch any listings missed during disconnect

Project Structure
cs2-skin-tracker/
├── index.html          # Home page — browse skins
├── item.html           # Skin detail page — prices, tracking
├── profile.html        # Dashboard — tracked items, matches
├── login.html          # Login / register
├── how-it-works.html   # Guide for new users
├── css/
│   ├── style.css           # Main styles
│   ├── market-prices.css   # Item page price cards
│   └── skinport.css        # Match card styles
├── js/
│   ├── api.js          # Shared skin data fetching (ByMykel API)
│   ├── auth.js         # Auth state + apiRequest helper
│   ├── navigation.js   # Nav dropdown menus
│   ├── home.js         # Home page logic + dashboard summary
│   ├── item.js         # Skin detail page + price chart
│   └── profile.js      # Profile page — tracked items + matches
└── server/
    ├── server.js       # Main Express server
    ├── db.js           # PostgreSQL connection pool
    ├── package.json
    └── .env            # Environment variables (not in repo)

Database Schema
Run schema.sql to create all tables. Tables:

users — accounts (username, email, password hash)
tracked_items — what each user is tracking and their criteria
skinport_matches — current matches found (Skinport + DMarket)
notification_settings — Discord webhook URLs per user


Common Issues
Skinport rate limited (429)
The server backs off for 2 minutes automatically. Do not restart the server repeatedly — leave it running and it recovers on its own.
Login not working
Make sure you are accessing the site via http://localhost:5500 not http://127.0.0.1:5500. On Mac, add "liveServer.settings.host": "localhost" to VS Code settings.json.
DMarket matches showing in console but not profile
DMarket match display is intentionally disabled in the UI for now. DMarket prices still show on the item page.
WebSocket disconnects
The server reconnects automatically and runs a fresh scan on reconnect. No action needed.

Environment Variables
VariableDescriptionDB_USERPostgreSQL username (default: postgres)DB_PASSWORDPostgreSQL passwordDB_HOSTDatabase host (default: localhost)DB_PORTDatabase port (default: 5432)DB_NAMEDatabase name (cs2_tracker)SESSION_SECRETSecret key for session encryption — change this in production

Planned Features

Discord bot DMs (requires hosted server for OAuth2)
Subscription tiers with Stripe (free: 5 items, basic: 20, pro: unlimited)
Full DMarket integration with proper API access
Price history chart improvements
Email notifications