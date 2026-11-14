# IIT Roorkee Academic Super App: clickable prototype

A clickable prototype of a campus app for IIT Roorkee students and TAs. It covers attendance, mark-attendance, leave, timetable, courses, study material, assignments (student and TA views), noticeboard, course chatrooms, collaboration posts, profile, digital ID card and the login and password-reset flows.

It runs entirely in the browser on dummy data. Any enrollment number, password and OTP will log you in.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## How it's built

The screens were designed in Claude Design and live unchanged in `src/screens/*.dc.html`. Each file has an HTML template plus a small logic class.

- `vite.config.js` compiles each screen file into a JavaScript module at build time.
- `src/runtime/dc.js` renders the screens with React and handles state, `{{bindings}}`, `<sc-if>`, `<sc-for>` and `<dc-import>`.
- `src/App.jsx` is the shell. It handles navigation between screens (`#/ScreenName` URLs, so the browser Back button works) and shows a phone frame with a screen list on desktop. On a phone, the app fills the screen.
- `src/screens/screens.json` sets the start screen and the order and titles of the desktop screen list.

To change a screen, edit its `.dc.html` file. The format is plain HTML with `{{bindings}}`, and the logic lives in the `<script type="text/x-dc">` block at the bottom.

## Images

The IIT Roorkee logo and the profile photo are loaded from `public/images/`:

- `public/images/iitr-logo.png`
- `public/images/profile-photo.webp`. This is the same image used in the design. The screens crop it with the same offsets.

Until those files exist, placeholder images are shown.

## Deploy

The site is static, so it can go on any static host. On Vercel, import this repo and keep the defaults (framework: Vite, build: `npm run build`, output: `dist`).
