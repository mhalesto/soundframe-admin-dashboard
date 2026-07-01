# SoundFrame Admin Dashboard

Static GitHub Pages dashboard for SoundFrame admin operations.

## What it does

- Signs in with Firebase Auth.
- Calls the admin-only Firebase Functions in `soundframe-ios`.
- Shows live AI usage, video usage, provider cost, recent events, and 14-day charts.
- Lets an admin raise or clear a user's monthly AI credit and video clip limits.

## Admin access

The dashboard is safe to host publicly because every privileged operation is checked server-side. A signed-in Firebase UID must either:

- be listed in the `SOUNDFRAME_ADMIN_UIDS` Functions parameter, or
- have a Firebase Auth custom claim of `soundframeAdmin: true` or `admin: true`.

If the dashboard says the current UID is not admin, add that UID in the SoundFrame Functions dotenv file and redeploy:

```sh
cd ~/Documents/GitHub/soundframe-ios
printf '\nSOUNDFRAME_ADMIN_UIDS=PASTE_UID_HERE\n' >> functions/.env.soundframe-1b8d4
npm --prefix functions run build
firebase deploy --only functions --project soundframe-1b8d4
```

If the dotenv file already contains `SOUNDFRAME_ADMIN_UIDS`, edit that line instead of adding a duplicate.

## GitHub Pages

Serve from the repository root on the `main` branch.
