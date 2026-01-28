import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

function pickLatestUserText(body) {
  return body?.query || body?.messages?.slice(-1)?.[0]?.content || '';
}

async function callGatewayOpenResponses({ input, user, agentId = 'main' }) {
  const url = process.env.CLAWDBOT_GATEWAY_URL; // e.g. http://127.0.0.1:18789
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN;
  if (!url || !token) throw new Error('Missing CLAWDBOT_GATEWAY_URL or CLAWDBOT_GATEWAY_TOKEN');

  const resp = await fetch(`${url.replace(/\/$/, '')}/v1/responses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-clawdbot-agent-id': agentId,
    },
    body: JSON.stringify({
      model: 'clawdbot',
      user,
      input,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Gateway /v1/responses failed: ${resp.status} ${resp.statusText} :: ${txt.slice(0, 500)}`);
  }

  const data = await resp.json();

  // Extract output_text (concatenate)
  let out = '';
  for (const item of data.output || []) {
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type === 'output_text' && typeof c.text === 'string') out += c.text;
      }
    }
  }
  return out.trim();
}

async function *callGatewayOpenResponsesStream({ input, user, agentId = 'main' }) {
  const url = process.env.CLAWDBOT_GATEWAY_URL;
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN;
  if (!url || !token) throw new Error('Missing CLAWDBOT_GATEWAY_URL or CLAWDBOT_GATEWAY_TOKEN');

  const resp = await fetch(`${url.replace(/\/$/, '')}/v1/responses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'x-clawdbot-agent-id': agentId,
    },
    body: JSON.stringify({
      model: 'clawdbot',
      user,
      input,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Gateway /v1/responses(stream) failed: ${resp.status} ${resp.statusText} :: ${txt.slice(0, 500)}`);
  }

  const decoder = new TextDecoder('utf-8');
  let buf = '';

  for await (const chunk of resp.body) {
    buf += decoder.decode(chunk, { stream: true });

    // SSE messages are separated by blank lines
    while (true) {
      const idx = buf.indexOf('\n\n');
      if (idx === -1) break;
      const rawMsg = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      const lines = rawMsg.split(/\r?\n/);
      let eventType = '';
      let dataLine = '';
      for (const l of lines) {
        if (l.startsWith('event:')) eventType = l.slice(6).trim();
        if (l.startsWith('data:')) dataLine += l.slice(5).trim();
      }

      if (!dataLine) continue;
      if (dataLine === '[DONE]') return;

      let data;
      try { data = JSON.parse(dataLine); } catch { continue; }

      // We only care about output text deltas
      if (eventType === 'response.output_text.delta') {
        const delta = data?.delta;
        if (typeof delta === 'string' && delta.length) yield delta;
      }
    }
  }
}

async function invokeGatewayTool({ tool, args }) {
  const url = process.env.CLAWDBOT_GATEWAY_URL;
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN;
  if (!url || !token) throw new Error('Missing CLAWDBOT_GATEWAY_URL or CLAWDBOT_GATEWAY_TOKEN');

  const resp = await fetch(`${url.replace(/\/$/, '')}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      // helps policy routing for messaging tools
      'x-clawdbot-message-channel': 'telegram',
    },
    body: JSON.stringify({ tool, args }),
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.ok) {
    const msg = data?.error?.message || `${resp.status} ${resp.statusText}`;
    throw new Error(`Gateway tool invoke failed (${tool}): ${msg}`);
  }
  return data.result;
}

// Webhook Conversation: Conversation Agent endpoint
app.post('/ha/conversation', async (req, res) => {
  try {
    const body = req.body || {};
    const query = pickLatestUserText(body);

    const deviceName = body?.device_info?.name || body?.device_id || 'unknown device';
    const conversationId = body?.conversation_id || 'unknown';
    const wantStream = Boolean(body?.stream);

    const user = `jay:ha_voice`; // one continuous Jay session across devices
    const agentId = process.env.CLAWDBOT_AGENT_ID || 'main';

    // In streaming mode, Webhook Conversation expects NDJSON lines like:
    //   {"type":"item","content":"..."}\n ... then {"type":"end"}\n
    if (wantStream) {
      res.status(200);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      // 1) Stream a short voice summary to HA
      const voiceInput = [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `VOICE REQUEST (Home Assistant)\n` +
                `device: ${deviceName}\n` +
                `conversation_id: ${conversationId}\n\n` +
                `Reply ONLY with a short, natural, TTS-friendly answer suitable for speaking aloud. ` +
                `No links. No code blocks. Keep it under ~2 sentences unless absolutely necessary.\n\n` +
                `Request: ${query}`,
            },
          ],
        },
      ];

      let streamedText = '';
      try {
        for await (const delta of callGatewayOpenResponsesStream({ input: voiceInput, user, agentId })) {
          streamedText += delta;
          res.write(`${JSON.stringify({ type: 'item', content: delta })}\n`);
        }
      } catch (e) {
        console.error('Streaming to HA failed:', e);
        // best-effort end
      }

      res.write(`${JSON.stringify({ type: 'end' })}\n`);
      res.end();

      // 2) Independently generate + send full Telegram answer (non-stream)
      setImmediate(async () => {
        try {
          const telegramInput = [
            {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    `You asked via voice: ${query}\n\n` +
                    `Context: voice originated from device: ${deviceName}.\n\n` +
                    `Provide your full normal answer as you would on Telegram (links/code/bullets allowed).`,
                },
              ],
            },
          ];

          const full = await callGatewayOpenResponses({ input: telegramInput, user, agentId });
          await invokeGatewayTool({
            tool: 'message',
            args: { action: 'send', channel: 'telegram', target: '160489990', message: full },
          });
        } catch (e) {
          console.error('Failed Telegram follow-up:', e);
        }
      });

      return;
    }

    // Non-streaming mode: single JSON call returns both telegram + voice
    const input = [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              `VOICE REQUEST (Home Assistant)\n` +
              `device: ${deviceName}\n` +
              `conversation_id: ${conversationId}\n\n` +
              `Treat the following request exactly as if Jay sent it to you on Telegram.\n` +
              `Return STRICT JSON with keys:\n` +
              `- telegram_message: string (full rich answer; include links/code/bullets if useful; must start with \"You asked via voice: ${query}\")\n` +
              `- voice_summary: string (short, natural, TTS-friendly; no links; no code blocks)\n\n` +
              `Request: ${query}`,
          },
        ],
      },
    ];

    const raw = await callGatewayOpenResponses({ input, user, agentId });

    let telegram_message = '';
    let voice_summary = '';
    try {
      const parsed = JSON.parse(raw);
      telegram_message = String(parsed.telegram_message || '');
      voice_summary = String(parsed.voice_summary || '');
    } catch {
      telegram_message = `You asked via voice: ${query}\n\n${raw}`;
      voice_summary = raw;
    }

    const spoken = (voice_summary || "I've sent you the full answer on Telegram.")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);

    res.json({ output: spoken });

    setImmediate(async () => {
      try {
        await invokeGatewayTool({
          tool: 'message',
          args: { action: 'send', channel: 'telegram', target: '160489990', message: telegram_message },
        });
      } catch (e) {
        console.error('Failed to send Telegram message:', e);
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ output: "Something went wrong. I've sent details to Telegram." });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3210;
app.listen(port, () => {
  console.log(`genie-voice-server listening on :${port}`);
});
