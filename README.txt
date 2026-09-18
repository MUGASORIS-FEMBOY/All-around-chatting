MUGS CHAT NETWORK — ZERO-COST EDITION v2.1
============================================

This package is designed around the current Cloudflare Workers Free plan:
- GitHub Pages for the browser client
- Cloudflare Worker for the API/WebSocket entry point
- SQLite-backed Durable Objects for persistent state
- Hibernatable WebSockets to reduce idle duration usage
- No terminal required for the basic browser/dashboard workflow

ZERO-COST PROMISE
-----------------
Deploy this only on the Workers Free plan and GitHub Pages. Do not select
Workers Paid, add a payment method, buy a domain, or connect any paid add-on.
The Free plan stops the affected operation when a quota is exhausted; it does
not convert this project into a paid deployment automatically.

As verified on 2026-09-18, Cloudflare Free includes SQLite-backed Durable
Objects. Its limits include 100,000 Durable Object requests/day, 13,000
GB-seconds/day of duration, 5 million SQLite row reads/day, 100,000 row
writes/day, and 5 GB total Durable Object storage. This is a small-community
chat app, not unlimited free hosting. Limits can change, so confirm them in
Cloudflare's official pricing page before deploying.

FEATURES
--------
* Automatic main room
* Username and password accounts (signup and multi-device sign-in)
* Persistent per-device session token
* Device/profile registration tied to a signed-in account
* Real-time WebSocket chat
* Persistent recent message history
* User-created private servers
* Server membership/invites by device token
* Friend system by device token
* Online/offline presence
* Reconnect and diagnostics
* Server-side message limits
* Automatic trimming of old room messages
* Separate Durable Object instances for rooms
* Rate limit of two messages per second per connection

FREE-PLAN DESIGN
----------------
The code intentionally avoids paid-only Durable Object storage modes and is
built for SQLite-backed Durable Objects.

IMPORTANT v2.1 FIX
------------------
The original v2 archive put user/group data in one Durable Object and room
messages in different Durable Objects, but had each room look for users in its
own empty database. That prevented registered users from opening WebSockets.
This version verifies identity and group membership in the system object, then
passes the verified identity to the private room-object request. It also keeps
room databases to message data only, reducing free-tier storage overhead.

ACCOUNTS AND SERVERS
--------------------
Open Settings on the website and enter an account username (3-24 lowercase
letters, numbers, or underscores) and a password of at least 10 characters.
Choose Create account. On a second browser/device, use the same fields and
choose Sign in; this creates a separate device session for that account.

After signing in, select Create server. The account that creates it remains
the owner even when it signs in from another device. Open the server and use
Invite device to add a friend's signed-in device token.

Passwords are salted and hashed with PBKDF2-SHA-256 in the Worker before
storage. They are not saved to browser local storage. This is a starter
authentication system: use HTTPS (the default for Pages and Workers) and do
not reuse a valuable password.

Cloudflare's current documentation should be checked before deployment because
limits can change. This version is designed to stay within the Free-plan
architecture, not to bypass limits.

NO-TERMINAL SETUP
-----------------
A) GITHUB
1. Open your GitHub repository.
2. Upload INDEX.HTML to the repository root.
3. Commit it.
4. Repository Settings -> Pages.
5. Source: Deploy from a branch.
6. Branch: main.
7. Folder: / (root).
8. Save.
9. Wait for the GitHub Pages URL.

B) CLOUDFLARE
1. Sign in to the Cloudflare dashboard.
2. Open Workers & Pages.
3. Create a Worker.
4. Open the browser-based code editor/Quick Editor.
5. Replace the generated code with WORKER.JS.
6. Create the Durable Object binding:
     Binding name: MUGS_DO
     Class name: MUGS_DO
   Use the SQLite-backed Durable Object option.
7. Apply the SQLite migration for class MUGS_DO if the dashboard asks for it.
8. Deploy.
9. Copy the HTTPS workers.dev URL.

WRANGLER.JSON
-------------
WRANGLER.JSON documents the exact binding and SQLite migration:
  MUGS_DO -> MUGS_DO
  migration tag v1 -> new SQLite class MUGS_DO

The dashboard may present these steps differently than Wrangler. Do not pay
for a plan just because the dashboard wording is different.

C) CONNECT THE WEBSITE
1. Open your GitHub Pages MUGS site.
2. Open Settings (gear).
3. Paste the Cloudflare Worker HTTPS URL.
4. Save.
5. The browser creates/registers its device token automatically.
6. It connects to the main room.

TEST THE BACKEND
----------------
Open these in a browser after deployment:

  https://YOUR-WORKER.workers.dev/health
  https://YOUR-WORKER.workers.dev/debug

The first should return JSON with "ok": true.
The second should report WebSocket and SQLite Durable Object support.

DIAGNOSTICS
-----------
Inside MUGS:
  Gear -> Diagnostics

If /health works but WebSocket fails:
  The Worker is reachable. Check the Durable Object binding, WebSocket
  endpoint, or the network blocking WebSockets.

If /health fails:
  Check the Worker URL, deployment, or network access.

SECURITY
--------
The device token is a bearer credential. Keep it private.
Anyone who gets the token can act as that device.

This starter intentionally avoids email/password accounts to keep setup simple.
A future version can add stronger account authentication and encryption.

LIMITATIONS
-----------
* This is not a complete Discord clone.
* Free-plan quotas still apply.
* A group owner currently invites members by pasting their registered device
  token.
* No end-to-end encryption yet.
* No large-file storage/transfer in this version.
* No moderation dashboard yet.
* Losing a device token means that browser cannot recover the old identity.
* Network/device management systems can still block Cloudflare or WebSockets.
  This software does not attempt to bypass such restrictions.

FREE-PLAN EFFICIENCY
--------------------
* Hibernatable WebSockets are used so idle Durable Objects can hibernate.
* No polling loop.
* 2,000-character message cap.
* 50-message client history load.
* 500-message server retention per room.
* Separate room Durable Objects.
* Lightweight JSON protocol.
