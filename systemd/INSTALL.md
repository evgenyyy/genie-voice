# Install genie-voice as a systemd service

## 1) Install deps

```bash
cd /home/evgeny/clawd/genie-voice/server
npm install
```

## 2) Create env file

Copy the example and fill in values:

```bash
cp /home/evgeny/clawd/genie-voice/server/.env.example /home/evgeny/clawd/genie-voice/server/.env
nano /home/evgeny/clawd/genie-voice/server/.env
```

Required:
- `CLAWDBOT_GATEWAY_URL` (e.g. `http://127.0.0.1:18789`)
- `CLAWDBOT_GATEWAY_TOKEN`
- `PORT=3210`

## 3) Install service

```bash
sudo cp /home/evgeny/clawd/genie-voice/systemd/genie-voice.service /etc/systemd/system/genie-voice.service
sudo systemctl daemon-reload
sudo systemctl enable --now genie-voice
```

## 4) Check logs

```bash
sudo systemctl status genie-voice --no-pager
journalctl -u genie-voice -f
```

## 5) HA config

Webhook URL:
- `http://192.168.1.183:3210/ha/conversation`

Output field:
- `output`

Timeout (initial):
- `60s`
