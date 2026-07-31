# Track D - Athena Discord Bot

The hands of Athena. Reads a person's slice of the graph, DMs them their work,
listens for the reply, and writes what it learns back through `POST /api/delta`.
It holds no state: everything comes from the graph, everything goes back to it.

## Files

| File | Job |
| --- | --- |
| `index.ts` | Entry point: login, intents, event wiring, command registration. |
| `config.ts` | Reads env; required keys and token redaction. |
| `api.ts` | HTTP client for the Track A routes (`GET /api/person/:id`, `POST /api/delta`). |
| `mistral.ts` | Track E seam: imports `lib/mistral` if present, else deterministic fallbacks for `triageReply`, `extractDelta`, and `composeDM`. |
| `flows.ts` | Outbound check-in plus inbound reply handling: triage, extract, post. |
| `commands.ts` | `/athena-hello` and `/athena-status` slash commands. |
| `scheduler.ts` | Optional `setInterval` check-in loop, disabled by default. |

## Setup

1. Discord Developer Portal -> your application -> Bot:
   - Reset Token and paste the new token into `.env` as `DISCORD_BOT_TOKEN`.
   - Never paste the token into chat or commit it. `.env` is gitignored.
   - Under Privileged Gateway Intents, enable Message Content Intent.
2. OAuth2 -> URL Generator:
   - Scopes: `bot` and `applications.commands`.
   - Bot permission: Send Messages.
   - Open the generated URL and invite the bot to your server.
3. Put your server guild id in `.env` as `DISCORD_GUILD_ID`.
   - Discord -> User Settings -> Developer -> Developer Mode.
   - Right-click the server -> Copy Server ID.

## Env

Required:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

Optional:

- `API_BASE_URL` (default `http://localhost:3000`)
- `CHECKIN_INTERVAL_MS` (default `0`, scheduler off)
- `CHECKIN_USER_IDS` (comma-separated Discord user ids for scheduled check-ins)

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

Reply to the DM and the bot terminal logs the Discord user id, message id, and
content, then triages the reply and, unless it is noise, posts a `Delta`. Every
write carries `{ kind: 'discord_dm', ref: message.id, quote: message.content }`.

In server channels, Athena only replies when explicitly mentioned. This keeps
the main workflow focused on slash-command-triggered DMs.

## Track E

When `lib/mistral` lands, `mistral.ts` imports it automatically. Until then the
deterministic fallbacks keep the full loop working for the demo.
