# Task Helper

A small home-screen web app for daily tasks, groups and recurring chores. Plain HTML/CSS/JS, no build step.

## How it works

- **Groups** hold tasks (Chores, Home Deep Clean, LED Development, LED Operations to start; add/rename/recolor in the Groups tab).
- **Chores** are tasks that repeat every N days *from the day you last did them*. When due, they appear on **Today** automatically and stay until done. Each shows "Last done …" and turns red when overdue.
- **Regular tasks** only appear on Today when you tap ☀. They stay there until done. Due dates are optional; tasks due within 2 days are suggested at the bottom of Today.
- Data is stored in the browser on each device. Use **More → Export backup** now and then.

## Run locally

```
python -m http.server 8000
```
Then open http://localhost:8000.

## Publish with GitHub Pages

1. Create a new **public** repo on GitHub (e.g. `task-manager`).
2. In this folder:
   ```
   git init
   git add .
   git commit -m "Task Helper v1"
   git branch -M main
   git remote add origin https://github.com/<you>/task-manager.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
4. After a minute it's live at `https://<you>.github.io/task-manager/`.
5. On your phone, open that URL, then add it to your home screen:
   - iPhone: Safari → Share → **Add to Home Screen**
   - Android: Chrome → ⋮ → **Add to Home screen** / **Install app**

## Shipping updates

Push changes as usual. The app shows the cached version first and fetches the new one in the background, so updates appear the **second** time you open it. If you change the list of files, bump `CACHE` in `sw.js`.

> Tasks added on your computer's browser and on your phone are separate. Use export/import to move them.
