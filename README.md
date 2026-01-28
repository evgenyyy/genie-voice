# genie-voice

Design + implementation notes for wiring **Home Assistant Voice/Assist pipelines** to **Genie** via the **Webhook Conversation** integration.

Status: proposal + reference implementation draft. No live system changes.

## Goals

- Route Home Assistant **conversation agent** requests (from voice satellites / Assist pipeline) to Genie for processing.
- Return an assistant response that Home Assistant will speak via **TTS**.
- Optionally: provide webhook-backed **STT** and/or **TTS** endpoints (but keep HA-native/Edge TTS if preferred).

## Relevant existing pieces

- HA already has voice pipelines set up.
- Prior wiring: HA → n8n via webhook.
- Integration: https://github.com/EuleMitKeule/webhook-conversation

## Quick architecture (recommended)

### Option A (simplest): HA Conversation → Webhook → Genie → text response → HA TTS

1. Install **Webhook Conversation** integration in HA.
2. Create a **Conversation Agent** entry pointing to a webhook endpoint.
3. Endpoint receives payload (messages, exposed_entities, device info, language, etc.).
4. Genie processes and returns JSON: `{ "output": "..." }` (field name configurable).
5. HA continues pipeline and uses the pipeline’s configured **TTS** to speak.

This keeps TTS in HA (Edge/Cloud/local) and uses Genie only for reasoning + response.

### Option B: Full external: HA Conversation + STT + TTS all webhooks

Webhook Conversation also supports:
- **STT webhook** (HA sends base64 audio, endpoint returns transcript)
- **TTS webhook** (HA sends text, endpoint returns audio bytes)

This is useful if you want a single external “voice brain” service, but it’s more moving parts.

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
  "exposed_entities": [{"entity_id": "light.living_room", "name": "Living Room Light", "state": "on", "aliases": ["main light"], "area_id": "living_room", "area_name": "Living Room"}],
  "system_prompt": "optional additional system instructions",
  "stream": false
}
```

## Proposal: how Genie should respond

### Minimal response

Return 200 JSON with a single field:

```json
{ "output": "Sure — turning on the living room lights." }
```

Where `output` matches the integration’s configured Output Field.

### (Optional) structured “tool use”

If we want Genie to actually *do* HA actions, we can extend the webhook endpoint to:

- detect intent
- call HA services via existing HA tooling (e.g., HA-MCP) **from the Genie side**
- then return a natural-language confirmation to HA

We should avoid live execution until you approve.

## Implementation plan

1. Create a small HTTP service (Node/Express or Fastify) that implements:
   - `POST /ha/conversation` → returns `{output: string}`
   - (optional) `POST /ha/stt` and `POST /ha/tts`
2. Secure it:
   - Basic Auth (supported by the integration)
   - HTTPS (reverse proxy) or put it behind an internal network
3. Configure HA:
   - Add Webhook Conversation agent entry → point at `/ha/conversation`
   - Select that agent in the desired voice pipeline
4. Add logging + replay fixtures so we can iterate safely.

## Open questions (need your preference)

1. Do we keep **TTS inside HA** (Edge TTS / Cloud) and only route conversation to Genie? (Recommended)
2. Should Genie be allowed to execute HA actions automatically, or only respond with suggestions?
3. Where should the webhook endpoint live: on the Genie box, in n8n, or both?

---

Next: add a `server/` reference implementation + example HA payload fixtures.
