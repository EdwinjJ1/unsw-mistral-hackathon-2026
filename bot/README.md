# Track D - Athena Discord Bot

The hands of Athena. Reads a person's slice of the graph, DMs them their work,
listens for the reply, and writes what it learns back through `POST /api/delta`.
It also delivers persistent task reminders leased from the web app's SQLite queue.

## Files

| File | Job |
| --- | --- |
| `index.ts` | Entry point: login, intents, event wiring, command registration. |
| `config.ts` | Reads env; required keys and token redaction. |
| `api.ts` | HTTP client for graph, plan handoff, identity-link and dispatch-receipt routes. |
| `mistral.ts` | Track E seam: imports `lib/mistral` if present, else deterministic fallbacks for `triageReply`, `extractDelta`, and `composeDM`. |
| `flows.ts` | Outbound check-in plus inbound reply handling: triage, extract, post. |
| `commands.ts` | `/athena-hello` and `/athena-status` slash commands. |
| `scheduler.ts` | Independent check-in and persistent task-reminder polling loops. |
| `dispatch.ts` | Exact roster matching, grouped plan DMs and idempotent delivery receipts. |

## Setup

1. Discord Developer Portal -> your application -> Bot:
   - Reset Token and paste the new token into `.env` as `DISCORD_BOT_TOKEN`.
   - Never paste the token into chat or commit it. `.env` is gitignored.
   - Under Privileged Gateway Intents, enable Message Content Intent and Server Members Intent.
2. OAuth2 -> URL Generator:
   - Scopes: `bot` and `applications.commands`.
   - Bot permission: Send Messages.
   - Open the generated URL and invite the bot to your server.
3. Put your server guild id in `.env` as `DISCORD_GUILD_ID`.
   - Discord -> User Settings -> Developer -> Developer Mode.
   - Right-click the server -> Copy Server ID.
4. Right-click the channel that should receive task pushes, copy its ID, and set
   `DISCORD_TASK_CHANNEL_ID`. The bot needs View Channel and Send Messages there.

## Env

Required:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

Optional:

- `API_BASE_URL` (default `http://localhost:3000`)
- `CHECKIN_INTERVAL_MS` (default `0`, scheduler off)
- `CHECKIN_USER_IDS` (comma-separated Discord user ids for scheduled check-ins)
- `DISCORD_TASK_CHANNEL_ID` (required for task push and reminder features)
- `REMINDER_POLL_INTERVAL_MS` (default `15000`; set `0` to disable reminder delivery)
- `REMINDER_WORKER_SECRET` (shared by Next and the bot; required in production)
- `PLAN_DISPATCH_INTERVAL_MS` (default `0`; set a positive interval only after the roster is verified)

## Run

```bash
npm install
npm run seed
npm run dev
npm run bot:dev
```

Run `npm run dev` and `npm run bot:dev` in separate terminals. On startup you
should see `Athena online as <name>` and the bot appears Online in Discord.

## Demo Commands

- `/athena-hello [user]`: hour-0 proof. DMs `hello` with a one-time consent line.
- `/athena-status [user]`: composes and sends a check-in DM from the target's live subgraph.
- `/athena-dispatch`: fetches the latest owner-grouped plan and sends every item not already marked `sent`.
- `/athena-ingest text:<project text>`: extracts graph changes from pasted project text and applies the resulting Delta.

For a safe demo, keep automatic plan dispatch off and use `/athena-dispatch` after reviewing
`http://localhost:3000/plan`. Missing identities are matched only when exactly one guild member
has the same username, global name, nickname or display name. Successful links are persisted;
`sent` receipts prevent duplicate DMs, while `unmatched` and `failed` items remain retryable.

Reply to the DM and the bot terminal logs only the Discord user id, message id,
and content length, then triages the reply. Noise and questions are acknowledged
without graph writes; supported updates and blockers post a `Delta` and report
their classification, change count, and contradiction count. Every
write carries `{ kind: 'discord_dm', ref: message.id, quote: message.content }`.

In server channels, Athena only replies when explicitly mentioned. This keeps
the main workflow focused on slash-command-triggered DMs.

The atlas sidebar can push a task immediately through `POST /api/discord/tasks`
or queue it with `POST /api/reminders`. The bot leases due items through the
protected worker routes, sends them to `DISCORD_TASK_CHANNEL_ID`, and records the
Discord message id. Delivery failures are retried up to three times.

## Track E

When `lib/mistral` lands, `mistral.ts` imports it automatically. Until then the
deterministic fallbacks keep the full loop working for the demo.
