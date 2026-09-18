# MUGS Chat Network — no-terminal starter

This package contains a browser client and a Cloudflare Worker backend.

## What is included

- Automatic MUGS device token
- Main server / global room
- WebSocket real-time messaging
- Basic friend-request packet
- Network diagnostics
- HTTPS health check
- Responsive Discord-style UI
- No local computer needs to stay on

## Important

The client intentionally does NOT attempt to bypass a school firewall, device-management policy, proxy, or filtering system. If the network blocks WebSockets, the Diagnostics panel will report that connection stage as failed.

## No-terminal deployment

### 1. Host the client

You can put `index.html` on a static HTTPS host such as GitHub Pages.

### 2. Create the backend in Cloudflare Dashboard

Create a Worker and paste the contents of `worker.js`.

Create a Durable Object binding:

Name: `CHAT_ROOM`
Class name: `CHAT_ROOM`

Use the SQLite-backed Durable Object migration shown in `wrangler.json`.

Cloudflare's dashboard UI changes over time, so use the current Workers/Durable Objects setup screens and make the binding names exactly match.

### 3. Get your Worker URL

It will look like:

https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev

### 4. Configure the client

Open `index.html` in a text editor and replace:

__BACKEND_URL__

with your Worker URL.

Example:

const CONFIG={BACKEND_URL:"https://mugs-chat.example.workers.dev"};

Then upload the updated index.html to your static host.

### 5. Test

Open the website and click the gear button.

Run the full diagnostics.

Test first on two ordinary browsers/devices that you control. Then test on the Chromebook.

## Next upgrades

This starter intentionally keeps the first backend small so failures are easy to diagnose. The next version can add:

- persistent accounts
- friend requests stored in Durable Objects/SQLite
- group creation and membership
- multiple rooms
- message history
- authenticated sessions
- encrypted application payloads
- resumable file transfer
- presence
- moderation/admin controls
- WebRTC direct transfer where permitted

Do not use a MUGS device token as a password. Anyone who knows a token should not automatically be able to impersonate the owner; authentication should be added before treating the system as private.
