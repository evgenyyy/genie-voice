# genie-voice

Design + implementation notes for wiring **Home Assistant Voice/Assist pipelines** to **Genie** via the **Webhook Conversation** integration.

Status: proposal + reference implementation draft. No live system changes.

## Goals

- Treat HA voice requests as if Jay sent them on **Telegram** (full Genie capabilities).
- Split output:
  - **Telegram (full)**: normal answer w/ links, code, bullets, etc.
  - **Home Assistant voice (short)**: TTS-friendly summary text only.

## Relevant existing pieces

- HA already has voice pipelines set up.
- Prior wiring: HA → n8n via webhook.
- Integration: https://github.com/EuleMitKeule/webhook-conversation

## Quick architecture (recommended)

### Dual-output bridge: HA Conversation → webhook → Gateway agent run

1. HA does **STT** as it does today (pipeline).
2. HA routes the text request to a **Webhook Conversation Agent**.
3. Webhook hits `genie-voice-server` (`POST /ha/conversation`).
4. Bridge calls **Clawdbot Gateway** `POST /v1/responses` to run the normal `main` agent.
5. The agent:
   - sends the **full** response to Telegram (via tool)
   - returns a **short** summary as plain text
6. Bridge returns `{ "output": "<short summary>" }` to HA.

This matches your requirement: voice behaves like Telegram, but HA only gets the short spoken response.

## What Webhook Conversation sends (conversation)

From the integration docs, a conversation request looks like:

```json
{
  "conversation_id": "abc123",
  "user_id": "...",
  "language": "en-US",
  "agent_id": "conversation.webhook_agent",
  "device_id": "...",
  "device_info": {"name": "Kitchen Voice Satellite", "manufacturer": "...", "model": "..."},
  "messages": [{"role": "user", "content": "..."}],
  "query": "latest user message",
  "exposed_entities": [{"entity_id": "light.living_room", "name": "Living Room Light", "state": "on"}],
  "system_prompt": "optional additional system instructions",
  "stream": false
}
```

## Repo contents

- `docs/ARCHITECTURE.md` — detailed design + security + required gateway config
- `server/` — reference Node server implementing `/ha/conversation`
- `fixtures/` — sample payloads for testing

## Implementation plan

1. Enable Gateway OpenResponses endpoint (`/v1/responses`) — **requires explicit approval**.
2. Deploy `genie-voice-server` on the Genie box (LAN-only).
3. Configure HA Webhook Conversation agent to point at `http://<genie-box>:3210/ha/conversation`.
4. Test with one pipeline/device.
5. Iterate on prompt + summarisation style.

## Open questions

1. Do we key the agent session per **device** (kitchen vs living room) or per **Jay**?
2. Do we want streaming responses in HA (Webhook Conversation supports it) or keep it simple?
