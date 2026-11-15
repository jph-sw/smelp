# Sign in and out

A person signs in with email and password, gets sent to sign-in when they open the app signed out, and signs out from the account menu.

## Sub-features

- `auth-redirect`: opening `/` signed out shows the sign-in form.
- `auth-signin`: correct credentials land on the workspace home.
- `auth-wrong`: a wrong password shows an error and no session.
- `auth-signout`: `Sign Out` in the account menu ends the session.

## How to get to it (user POV)

- Open `/` or `/signin` while signed out.
- Press the `Account menu` button (the avatar letter, top right), then the menuitem `Sign Out`.

## Driving it with smelp-verify

Preconditions:

- The baseline seed. Run the journey with `--fresh`, so it starts with no session.

Steps:

- **Redirect.** `page.goto("/")`. The page shows the text `Sign in`, `textbox "Email"`, `textbox "Password"` and `button "Sign in"`.
- **Wrong password.** Fill `Email` with `seed.account.email` and `Password` with `wrong-password-123`, then press `Sign in`. An error toast or `alert` appears and you stay on the sign-in form. Snapshot the exact text and add it here.
- **Sign in.** Fill `Password` with `seed.account.password` and press `Sign in`. The workspace home loads with `heading "Verify Team"` (level 1) and `region "My work"`.
- **Sign out.** `getByRole("button", { name: "Account menu" }).click()`. `menu "Account menu"` shows group `vera`, with the menuitems `Account`, `Instance settings` and `Sign Out`. Press `Sign Out`. The sign-in form is back.
- **Proof.** Screenshots of each state. After sign-out, `page.request.post("/rpc/auth/me", { data: { json: {} } })` no longer returns the account.

## Gotchas

- Without `--fresh`, the journey starts signed in and `/signin` redirects away.
- In a signed-in journey, signing out saves the dead session back to the run. Later journeys then start signed out. Sign out only in `--fresh` journeys, or launch a new run afterwards.
- Sign-in allows 10 attempts per account and 50 per IP every 15 minutes, held in memory. A journey that tries many wrong passwords can lock out the seeded account until you launch a new run.
- The session cookie is `Secure`, which Chromium accepts on `localhost` only. Keep using the `localhost` `BASE` the run gives you, not `127.0.0.1`.
