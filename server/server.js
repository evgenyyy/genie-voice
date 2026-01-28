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

  // Extract output_text
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

// Webhook Conversation: Conversation Agent endpoint
app.post('/ha/conversation', async (req, res) => {
  try {
    const body = req.body || {};
    const query = pickLatestUserText(body);

    const deviceName = body?.device_info?.name || body?.device_id || 'unknown device';
    const conversationId = body?.conversation_id || 'unknown';

    // This is the key prompt: act like a Telegram message, but produce two outputs.
    // We instruct the agent to send full answer to Telegram (via tool), and return ONLY voice summary as plain text.
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
              `Treat the following request exactly as if Jay sent it to you on Telegram, so all your capabilities/tools are available.\n\n` +
              `1) First, send Jay a Telegram message that starts with: \"You asked via voice: ${query}\" and then provide your full normal answer (links/code allowed).\n` +
              `2) Then, return ONLY a short, natural, TTS-friendly summary (no links, no code blocks), suitable to be spoken out loud.\n\n` +
              `Request: ${query}`
          }
        ],
      },
    ];

    const user = `ha_voice:${body?.device_id || 'unknown'}:${body?.user_id || 'unknown'}`;
    const voiceSummary = await callGatewayOpenResponses({ input, user, agentId: process.env.CLAWDBOT_AGENT_ID || 'main' });

    // Webhook Conversation will read this field as output (configurable)
    res.json({ output: voiceSummary || "I've sent you the full answer on Telegram." });
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
