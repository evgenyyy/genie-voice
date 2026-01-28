# Architecture: HA Voice → Genie (Telegram-style) with dual outputs

## Requirement recap

- Voice requests coming from Home Assistant should be treated **as if Jay sent them on Telegram**.
  - i.e. Genie’s *full* capabilities/tooling should be available.
- Output must split:
  1) **Telegram (full)**: the normal long-form answer (can include links, code, bullet points).
  2) **Home Assistant voice (short)**: a natural, TTS-friendly summary.

## Key constraint

Webhook Conversation’s **Conversation Agent** expects a single textual response back to HA.
So: the webhook endpoint must return **only** the voice summary to HA, while also separately sending the long answer to Telegram.

## Proposed flow (recommended)

### 1) HA pipeline

- HA does STT locally/within HA (existing pipeline).
- HA uses **Webhook Conversation** as the Conversation Agent.
- Webhook URL points at: `POST /ha/conversation` on `genie-voice-server`.

## HA setup checklist (Jay LAN)

- Genie box IP: `192.168.1.183`
- Conversation Agent webhook URL: `http://192.168.1.183:3210/ha/conversation`
- Output Field: `output`
- Timeout: start with `60s` (can reduce once stable)

- In Webhook Conversation config, set **Output Field** to `output` (default).

### 2) genie-voice-server (bridge)

On each request it will:

1. Build a prompt like:
   - “Jay asked via voice (device: Kitchen Satellite): <query>”
   - “Send the *full* answer to Telegram.”
   - “Return ONLY a short voice summary.”

2. Call Clawdbot Gateway **OpenResponses** endpoint:
   - `POST /v1/responses`
   - with `x-clawdbot-agent-id: main`
   - auth bearer token

3. The agent run is allowed to:
   - call tools (e.g. check email, search, etc.)
   - send Telegram messages via the built-in `message.send` tool

4. Bridge extracts the final `output_text` and returns it to HA as:

```json
{ "output": "<voice summary>" }
```

### 3) Telegram output format

The *agent* should send a Telegram message like:

- Title/first line: `You asked via voice: <query>`
- Then the full answer.

This keeps voice interactions searchable in Telegram.

## Session + context

- Use OpenResponses `user` to derive a stable session key **for Jay** (shared across devices).
  - Example: `user: "jay"` (or `"jay:ha_voice"`).
- Still include `device_id` / `device_info` in the prompt so Genie can infer room-context.
- Optional: include `conversation_id` so repeated turns stay coherent across turns.

## Security

- Secure `/ha/conversation` with Basic Auth (Webhook Conversation supports it).
- Only expose the bridge endpoint on LAN or behind Tailscale.
- Gateway `/v1/responses` is a powerful capability: keep it **private** and token-protected.

## Dependencies / config changes

The Gateway OpenResponses endpoint is **disabled by default**.

We will need to enable:

```json5
{
  gateway: {
    http: {
      endpoints: {
        responses: { enabled: true }
      }
    }
  }
}
```

Approved by Jay (2026-01-28): we can enable this endpoint; still keep it LAN/private + token-protected.

## Why this approach

- Minimal HA changes.
- Keeps audio (STT/TTS) inside HA for reliability.
- Gives Genie full tool access and the same behavior as Telegram.
- Returns TTS-friendly output without losing rich content.
