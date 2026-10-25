# SkyRewind Admin Backend Setup Instructions

## Overview
The admin backend is a separate service that runs on port 5004 and provides moderation capabilities:
- List and delete UAP reports (including photos and confirmations)
- List and delete chat messages
- View moderation log

**Security:** The admin service is accessible ONLY via `uap.mattjhagen.xyz` with Cloudflare Access PIN gate protection.

---

## Step 1: Install the Admin Service

1. **Copy the systemd unit file:**
   ```bash
   sudo cp /opt/skyrewind-merged/systemd/skyrewind-admin.service /etc/systemd/system/
   ```

2. **Reload systemd and enable the service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable skyrewind-admin.service
   ```

3. **Start the admin service:**
   ```bash
   sudo systemctl start skyrewind-admin.service
   ```

4. **Check status:**
   ```bash
   sudo systemctl status skyrewind-admin.service
   ```

   Should show `active (running)` on port 5004.

5. **Test locally:**
   ```bash
   curl http://localhost:5004/api/admin/stats
   ```

   Should return JSON with stats.

---

## Step 2: Configure Cloudflare Access PIN Gate

⚠️ **CRITICAL:** Do NOT route `uap.mattjhagen.xyz` to port 5004 until the Access gate is in place.

### Cloudflare Dashboard Steps:

1. **Go to Cloudflare Zero Trust Dashboard:**
   - Visit: https://one.dash.cloudflare.com/
   - Select your account

2. **Create Access Application:**
   - Navigate to **Access** → **Applications**
   - Click **Add an application**
   - Choose **Self-hosted**

3. **Configure Application:**
   - **Application name:** `SkyRewind Admin`
   - **Session duration:** `24 hours` (or your preference)
   - **Application domain:**
     - Subdomain: `uap`
     - Domain: `mattjhagen.xyz`
   - Click **Next**

4. **Configure Policy:**
   - **Policy name:** `Admin PIN Access`
   - **Action:** `Allow`
   - **Configure rules:**
     - Select **One-time PIN**
     - Email: Enter your admin email address(es)
   - Click **Next**

5. **Additional settings:**
   - **Accept all defaults** (CORS, cookie settings, etc.)
   - Click **Add application**

6. **Verify the application is created:**
   - You should see "SkyRewind Admin" in your Access applications list
   - Status should be "Active"

---

## Step 3: Update Cloudflare Tunnel Route

⚠️ **BACKUP FIRST:**
```bash
cp ~/.cloudflared/config.yml ~/.cloudflared/config.yml.bak-$(date +%Y%m%d-%H%M%S)
```

### Option A: Update via Cloudflare Dashboard (Recommended)

1. **Go to Cloudflare Dashboard:**
   - Visit https://dash.cloudflare.com/
   - Select your account → **Zero Trust** → **Networks** → **Tunnels**

2. **Find your tunnel** (`purepulse-r510` or similar)

3. **Edit the tunnel:**
   - Look for the `uap.mattjhagen.xyz` route (if it exists)
   - Or click **Add a public hostname**

4. **Configure the route:**
   - **Subdomain:** `uap`
   - **Domain:** `mattjhagen.xyz`
   - **Service:**
     - Type: `HTTP`
     - URL: `localhost:5004`
   - Click **Save**

5. **Verify the change:**
   - The tunnel should automatically update (no restart needed for dashboard changes)

### Option B: Update config.yml manually

Edit `~/.cloudflared/config.yml` and add:
```yaml
  # SkyRewind Admin (behind Cloudflare Access)
  - hostname: uap.mattjhagen.xyz
    service: http://localhost:5004
```

Then restart the tunnel:
```bash
sudo systemctl restart cloudflared.service
# or
sudo systemctl restart cloudflared-purepulse-r510.service
```

---

## Step 4: Verify Access

1. **Visit https://uap.mattjhagen.xyz**
   - You should be redirected to Cloudflare Access
   - Enter your email address
   - You'll receive a PIN code via email
   - Enter the PIN to access the admin panel

2. **Verify admin panel loads:**
   - Should show "⚠️ ADMIN PANEL" header
   - Stats should load (reports, chat, confirmations, modlog)
   - You should see lists of reports and chat messages

3. **Test moderation:**
   - Create a test report on https://mufonomaha.space
   - Verify it appears in the admin panel
   - Delete it from the admin panel
   - Verify it's removed from the public site
   - Check that the moderation log records the deletion

---

## Step 5: Verify Public Site Security

⚠️ **CRITICAL:** Verify that the public site does NOT have DELETE endpoints:

```bash
# This should return 404 or 405 (Method Not Allowed)
curl -X DELETE https://mufonomaha.space/api/sightings/1

# This should still work (public GET)
curl https://mufonomaha.space/api/sightings
```

If the DELETE request succeeds, the public endpoint was NOT properly removed. Stop and check `backend/app.py`.

---

## Troubleshooting

### Admin service won't start:
```bash
sudo journalctl -u skyrewind-admin.service -n 50
```

Common issues:
- Port 5004 already in use: `lsof -i :5004`
- Database not initialized: Check `/opt/skyrewind-merged/data/sightings.db` exists
- Import errors: Check `/opt/skyrewind-merged/venv/bin/python` works

### Cloudflare Access not prompting for PIN:
- Check that the Access application is "Active" in the dashboard
- Verify the domain matches exactly: `uap.mattjhagen.xyz`
- Try in an incognito window to bypass cached sessions
- Check Cloudflare Access logs in the dashboard

### Tunnel not routing to admin service:
```bash
# Check if tunnel is running
systemctl status cloudflared.service

# Check tunnel config
cat ~/.cloudflared/config.yml | grep -A 2 "uap.mattjhagen.xyz"

# Test locally first
curl http://localhost:5004/api/admin/stats
```

### Admin panel shows CORS errors:
- This is normal if accessing via IP instead of domain
- Always use https://uap.mattjhagen.xyz (not http://localhost:5004)
- The Cloudflare tunnel handles HTTPS termination

---

## Service Management

**Start/stop/restart admin service:**
```bash
sudo systemctl start skyrewind-admin.service
sudo systemctl stop skyrewind-admin.service
sudo systemctl restart skyrewind-admin.service
```

**View logs:**
```bash
sudo journalctl -u skyrewind-admin.service -f
```

**Check both services:**
```bash
systemctl status skyrewind-merged-web.service
systemctl status skyrewind-admin.service
```

---

## Security Notes

1. **Access Gate is Required:**
   - The admin service has NO authentication of its own
   - Cloudflare Access PIN gate is the ONLY security layer
   - NEVER expose port 5004 directly to the internet

2. **Moderation Log:**
   - All deletions are logged to `/opt/skyrewind-merged/data/moderation_log.jsonl`
   - This is append-only and cannot be deleted from the admin UI
   - Back this up regularly

3. **IP Blocking:**
   - Currently not implemented (no identity system)
   - Future: Can be added once OAuth is implemented

4. **Two Services:**
   - Public site: `mufonomaha.space` → localhost:5003 (NO DELETE endpoints)
   - Admin site: `uap.mattjhagen.xyz` → localhost:5004 (ALL moderation endpoints)
   - They are completely separate services

---

## Files Created/Modified

**New files:**
- `/opt/skyrewind-merged/backend/admin_app.py` - Admin backend
- `/opt/skyrewind-merged/admin-frontend/index.html` - Admin UI
- `/opt/skyrewind-merged/systemd/skyrewind-admin.service` - Systemd unit
- `/opt/skyrewind-merged/ADMIN-SETUP-INSTRUCTIONS.md` - This file

**Modified files:**
- `/opt/skyrewind-merged/backend/app.py` - Removed public DELETE endpoint

**Created at runtime:**
- `/opt/skyrewind-merged/data/moderation_log.jsonl` - Moderation log

---

## What's Next

After verifying admin access works:

1. **Test moderation workflow:**
   - Create test reports on public site
   - Delete them from admin panel
   - Verify they disappear from public site
   - Check moderation log records actions

2. **Create test chat messages:**
   - Post messages on public site
   - Delete from admin panel
   - Verify they disappear

3. **Bookmark the admin URL:**
   - https://uap.mattjhagen.xyz
   - Save the Cloudflare Access PIN email for quick access

4. **Monitor logs:**
   - Moderation log: `cat /opt/skyrewind-merged/data/moderation_log.jsonl`
   - Service logs: `journalctl -u skyrewind-admin.service -f`

---

**Admin backend is ready for production use once Cloudflare Access PIN gate is configured.**
