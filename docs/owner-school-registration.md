# Owner-only school registration

The public website offers school, teacher and student login. School registration
is available at `/owner` only after a password login and authenticator-app MFA.
The backend checks the exact configured Supabase user ID and a verified TOTP
factor with an `aal2` session on every registration request.

Existing portal logins and teacher/student invitation links are unchanged.
No application tables or RLS policies are changed. This implementation is for
the website; older mobile builds cannot register schools through the protected API.

## One-time setup (deployment operator)

1. In the **same Supabase project as the backend**, open Authentication > Users
   and manually create your owner user with a strong, unique password and a
   confirmed email. Do not create a public owner sign-up flow.
2. Copy that user's UUID. Configure the backend:

   ```dotenv
   OWNER_SUPABASE_USER_ID=<owner-user-uuid>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<existing-server-only-service-role-key>
   ```

   The existing backend Supabase configuration remains in use.
   `SUPABASE_ANON_KEY` may optionally be supplied for owner token verification.
   Never put a service-role key in the website or share it.
3. Configure the website build with public values from the same project:

   ```dotenv
   REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=<public-anon-key>
   REACT_APP_API_URL=https://<your-backend-host>
   ```

   These are build-time variables: changing them requires rebuilding the website.
   Supabase TOTP enrollment and verification must be enabled in the project's MFA
   settings. Do not change existing authentication settings or signup policies
   without checking whether other workflows depend on them.
4. Deploy the backend first, then rebuild and deploy the website.
   Ensure the hosting provider serves the SPA's `index.html` for `/owner`
   (a rewrite, not a redirect). Use HTTPS. The page uses pathname selection,
   not React Router; existing portal hash navigation is unchanged.
5. Visit `https://academix.now/owner`, sign in with the owner email/password,
   and scan the QR code with Google Authenticator, Microsoft Authenticator,
   or another TOTP app. Securely back up your authenticator. Enter its current
   six-digit code to finish enrollment.
6. Sign out and sign in again to confirm you can complete MFA before relying
   on this account for onboarding.

Missing owner configuration **disables registration**; it never falls back to
public or development-token access. Ordinary Supabase users and existing portal
accounts do not become owners merely by signing in.

## Registering a school

1. Open `https://academix.now/owner`.
2. Sign in with your **owner** email and password.
3. Enter the current six-digit code from your authenticator app.
4. Fill in the school name, branch, location, school administrator email and
   a new school password (at least eight characters).
5. Select **Send school verification code**. The code goes to the **school's
   email**, not necessarily your owner email. The existing email service must
   be configured and working.
6. Enter that email code and select **Verify & register school**.
   Codes expire after ten minutes and allow at most five incorrect attempts.
   To resend, choose **Change details / request a new code**, re-enter the school
   password and submit again (wait at least 30 seconds between requests).
7. Wait for the success message. You remain in the owner portal and can register
   another school; no school login token is returned to the owner page.
8. Give the school's administrator their credentials through a secure channel.
   They can sign in at the normal website using **School Login**.
9. Select **Owner sign out** when finished.

The owner session is memory-only, separate from `AcademiX.session`. Refreshing
the page requires signing in and completing MFA again. Token expiry also returns
you to owner sign-in; there is no silent refresh that bypasses that UI check.

The school email OTP proves access to the school's inbox. It is separate from
your owner authenticator code and never substitutes for owner MFA.

## Recovery if you lose the authenticator

Keep Supabase project/dashboard access protected with its own MFA and recovery
options. Only a trusted deployment operator with the server service-role key
should perform this recovery. Verify the owner's identity first.

From `backend/`, with the existing backend `.env` and
`OWNER_SUPABASE_USER_ID` configured:

```bash
npx ts-node scripts/reset_owner_mfa.ts --confirm-owner-mfa-reset
```

This removes TOTP factors only for the configured owner, not for other users.
The registration guard immediately rejects sessions without a verified TOTP
factor. Sign in at `/owner` and enroll a replacement authenticator immediately.
Do not implement a public "skip MFA" recovery endpoint.

For a lost password, use trusted Supabase user administration to set a new
password; do not share passwords or service-role credentials in support chats.

## Verification commands

```bash
cd backend
npx tsc --noEmit
node --test -r ts-node/register src/auth/owner-auth.test.ts

cd ../web
CI=true npm test -- --watchAll=false --runInBand src/components/OwnerPortal.test.jsx
npx eslint src/components/OwnerPortal.jsx src/components/RoleGateway.jsx src/ownerAuthClient.js src/api.js src/App.js
CI=false npm run build
```

The backend tests use isolated fake Supabase Auth responses and do not create
real accounts or schools. Before production onboarding, perform one real owner
login/MFA check and register a school you actually intend to create.
