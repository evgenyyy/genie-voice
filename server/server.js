import express from 'express';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Minimal reference endpoint compatible with Webhook Conversation (Conversation Agent)
app.post('/ha/conversation', async (req, res) => {
  const body = req.body || {};
  const query = body.query || (body.messages?.slice(-1)?.[0]?.content ?? '');

  // TODO: replace with real Genie call (Clawdbot webhook / local gateway endpoint)
  const output = `Heard: ${query}`;

  res.json({ output });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3210;
app.listen(port, () => {
  console.log(`genie-voice-server listening on :${port}`);
});
