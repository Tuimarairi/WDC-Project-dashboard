# PCDFWDC Dashboard — Live KoboToolbox Integration

A live dashboard that automatically pulls ward development committee expenditure data from KoboToolbox every 10 minutes and publishes it to GitHub Pages.

**Live Dashboard:** `https://Tuimarairi.github.io/pcdfwdc-dashboard/`

---

## Quick Start

1. **Ensure you have a KoboToolbox API token**
   - Login to KoboToolbox → Account Settings → Security → Generate Token
   - Copy the token

2. **Add the token to GitHub Secrets**
   - Go to your repo Settings → Secrets and variables → Actions
   - New secret: `KOBO_API_TOKEN` = your KoboToolbox token

3. **That's it!**
   - The workflow automatically runs every 10 minutes
   - Dashboard updates silently
   - Share the link above with your team

---

## What This Does

- **Fetches** submissions from two KoboToolbox forms:
  - Ward Project Expenditure Form
  - Ward Operational Expenditure Form
- **Accumulates** all historical data (nothing is ever lost)
- **Regenerates** the dashboard HTML every 10 minutes
- **Publishes** to GitHub Pages (free hosting)
- **Provides** interactive map, charts, filtering, and tables

---

## How It Works

```
every 10 min → GitHub Actions triggers
    ↓
    node update-dashboard.js
    ↓
    Fetches data from KoboToolbox API
    ↓
    Regenerates index.html
    ↓
    Commits to repo (if changes)
    ↓
    GitHub Pages serves live dashboard
```

---

## Manual Update

Want to trigger an update manually instead of waiting for the scheduled run?

1. Go to the **Actions** tab in your repository
2. Click **"Update PCDFWDC Dashboard from KoboToolbox"** (on the left)
3. Click **Run workflow** → **Run workflow**

The dashboard will update within 30 seconds.

---

## View Workflow Runs

To see logs from each automated update:

1. Go to the **Actions** tab
2. Click a workflow run to see:
   - When it ran
   - How long it took
   - Number of records fetched
   - Success or error messages

---

## Troubleshooting

**Dashboard not updating?**
- Check GitHub Actions tab for error messages
- Verify `KOBO_API_TOKEN` secret is set correctly
- Make sure form names in `update-dashboard.js` match your KoboToolbox form names

**Want different update frequency?**
- Edit `.github/workflows/update.yml` line 7
- Change `'*/10 * * * *'` to your preferred cron interval
- Common: `*/5` (5 min), `*/15` (15 min), `0 * * * *` (hourly)

**Data looks stale?**
- Go to Actions tab and manually trigger a run
- Check KoboToolbox to confirm new submissions are coming in

---

## Files in This Repo

- **`index.html`** — The live dashboard (auto-generated, don't edit)
- **`update-dashboard.js`** — Fetches from KoboToolbox and regenerates index.html
- **`dashboard_template.html`** — Template for dashboard HTML generation
- **`.github/workflows/update.yml`** — GitHub Actions automation configuration
- **`package.json`** — Node.js dependencies (none currently)

---

## Customization

### Change update frequency
Edit `.github/workflows/update.yml`:
```yaml
schedule:
  - cron: '*/5 * * * *'  # Every 5 minutes instead of 10
```

### Change form names
If your KoboToolbox form names don't match, edit `update-dashboard.js` around line 66:
```javascript
const projectExpenditureForm = assets.results.find(a =>
  a.name.includes('YOUR_FORM_NAME')
);
```

### Add custom domain
If you have a domain, edit `.github/workflows/update.yml` to add a CNAME.

---

## Security Note

- Your KoboToolbox API token is stored as a GitHub Secret (encrypted, not visible in code)
- The workflow runs on GitHub's secure infrastructure
- The public dashboard link is read-only (no one can modify data via the dashboard)

---

## Support & Feedback

- **GitHub Issues:** Create an issue in this repository for bugs or feature requests
- **Questions:** Contact the dashboard maintainer

---

## Data Freshness

- Dashboard data is pulled **every 10 minutes** from KoboToolbox
- The latest data appears within 10 minutes of submission
- All historical submissions are preserved in the dashboard

---

**Made with ❤️ for PCDF Ward Development Committees**
