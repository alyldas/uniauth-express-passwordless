# @alyldas/uniauth-express-passwordless

Passwordless-first Express strategy package for UniAuth.

This package sits on top of `@alyldas/uniauth-core`, `@alyldas/uniauth-express`, and `express`. It
provides focused passwordless sign-in routes without taking ownership of core authentication,
verification, session, delivery, database, or UI lifecycle.

## Installation

Configure GitHub Packages for the `@alyldas` scope before installing:

```sh
npm config set @alyldas:registry https://npm.pkg.github.com
npm install @alyldas/uniauth-express-passwordless @alyldas/uniauth-core @alyldas/uniauth-express express
```

## Usage

Mount the router at the path owned by the application. The package does not mount `/auth` by
itself.

```ts
import express from "express";
import {
  createEmailOtpTestOutbox,
  createUniAuthEmailOtpRouter,
} from "@alyldas/uniauth-express-passwordless";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const localEmailOutbox = isProduction ? undefined : createEmailOtpTestOutbox();

app.use(express.json());
app.use(
  "/auth",
  createUniAuthEmailOtpRouter({
    auth: auth.public,
    sessionExpiresAt: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    emailOtpDebug: localEmailOutbox
      ? {
          exposeCodeInStartResponse: true,
          resolveCode: ({ email }) =>
            localEmailOutbox.findLatestCode({ email }),
          isProduction: () => isProduction,
        }
      : undefined,
    transport: {
      cookie: {
        name: "session",
        options: {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      },
    },
  }),
);
```

`auth` must be the public UniAuth facade from application-owned UniAuth service setup. Configure
OTP email delivery in that service setup before mounting the router; this package calls the public
OTP facade and does not expose raw OTP secrets by default or own production sender lifecycle. The
core service owns OTP verification, delivery dispatch through its configured sender, identity
materialization, and session lifecycle.

The local outbox example is only for tests and local smoke flows. Wire `localEmailOutbox.sender` into
your UniAuth core email sender setup only outside production. Production delivery remains
application-owned through the core `EmailSender` configuration, for example SMTP, SES, Postmark, or
another provider client managed by the application.

## Routes

### `POST /email-otp/start`

Starts an email OTP sign-in challenge.

Request body:

```json
{
  "email": "user@example.com",
  "metadata": {
    "requestId": "request_123"
  }
}
```

Response body:

```json
{
  "verificationId": "verification_123",
  "expiresAt": "2026-01-01T00:05:00.000Z",
  "delivery": "email"
}
```

The response is neutral for account existence. It does not expose raw OTP secrets, secret hashes, or
internal verification fields.

For tests or local smoke flows, `emailOtpDebug.exposeCodeInStartResponse` can add a debug-only code
field:

```json
{
  "verificationId": "verification_123",
  "expiresAt": "2026-01-01T00:05:00.000Z",
  "delivery": "email",
  "debug": {
    "code": "123456"
  }
}
```

This requires explicit opt-in and an application-provided `resolveCode` function. The router rejects
debug code exposure when its production guard reports production. Passing only a resolver is not
enough; `exposeCodeInStartResponse` must also be `true`.

### `POST /email-otp/sign-in`

Finishes an email OTP sign-in challenge.

Request body:

```json
{
  "verificationId": "verification_123",
  "code": "123456",
  "metadata": {
    "requestId": "request_123"
  }
}
```

`secret` may be sent instead of `code`.

The response contains the safe public auth result returned by the UniAuth public facade. A session
cookie is written only when `transport.cookie` is configured. In that mode, `sessionToken` is omitted
from the JSON response so browser JavaScript does not receive the bearer token. Without cookie
transport, the safe response includes `sessionToken`, and the application owns how to store or
forward it. Request bodies do not control server time or session expiry; use `sessionExpiresAt` in
router options for application-owned expiry policy. The response does not expose token hashes,
password hashes, secret hashes, provider tokens, raw provider payloads, or internal metadata.

## Runtime Boundary

This package owns only the Express email OTP route surface.

Application code owns:

- UniAuth service construction
- email sender runtime configuration
- production email delivery provider integration
- session expiration policy
- SMTP or provider client lifecycle
- database lifecycle and migrations
- router mount path
- deployment-specific cookie options

This package does not own:

- core verification lifecycle
- core session lifecycle
- database persistence
- SMTP runtime
- UI
- roles or permissions
- admin authorization
- OAuth, Telegram, or MAX strategies

Email OTP is the first implemented passwordless runtime scope. Magic-link support is planned for a
later change and is not implemented here.

## Public API

```ts
import {
  UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY,
  createEmailOtpTestOutbox,
  createEmailOtpTestSender,
  createUniAuthEmailOtpRouter,
  type UniAuthEmailOtpDebugOptions,
  type UniAuthEmailOtpSignInFailedEvent,
  type UniAuthEmailOtpStartedEvent,
  type UniAuthExpressPasswordlessOptions,
} from "@alyldas/uniauth-express-passwordless";
```
