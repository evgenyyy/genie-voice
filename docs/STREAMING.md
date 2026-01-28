# Streaming protocol (Webhook Conversation)

Webhook Conversation “Enable Response Streaming” does **not** use SSE.

When `stream: true` in the request payload, Home Assistant expects the webhook response body to be **newline-delimited JSON** (NDJSON), where each line is a JSON object.

Supported chunk types (as implemented by the integration):

- **item**: emit incremental assistant text

```json
{"type":"item","content":"Hello"}
```

- **end**: stop streaming

```json
{"type":"end"}
```

Notes:
- HTTP status must be **200**.
- Content-Type can be `application/json; charset=utf-8`.
- Each chunk must be valid JSON on its own line.
- The HA side concatenates `content` from `item` chunks.

References:
- Source: `custom_components/webhook_conversation/entity.py` (`_send_payload_streaming`).
- Example n8n workflow: `examples/simple_n8n_workflow.json` in the upstream repo.
