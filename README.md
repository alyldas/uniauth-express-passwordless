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
import { createUniAuthEmailOtpRouter } from "@alyldas/uniauth-express-passwordless";

const app = express();

app.use(express.json());
app.use(
  "/auth",
  createUniAuthEmailOtpRouter({
    auth: auth.public,
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

`auth` must be the public UniAuth facade from application-owned UniAuth service setup. The core
service owns OTP verification, identity materialization, and session lifecycle.

## Routes

### `POST /email-otp/start`

Starts an email OTP sign-in challenge.

Request body:

```json
{
  "email": "user@example.com",
  "now": "2026-01-01T00:00:00.000Z",
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

### `POST /email-otp/sign-in`

Finishes an email OTP sign-in challenge.

Request body:

```json
{
  "verificationId": "verification_123",
  "code": "123456",
  "sessionExpiresAt": "2026-01-02T00:00:00.000Z",
  "metadata": {
    "requestId": "request_123"
  }
}
```

`secret` may be sent instead of `code`.

The response contains the safe public auth result returned by the UniAuth public facade. If cookie
transport is configured, the route writes the session cookie through `@alyldas/uniauth-express`
transport helpers. The response does not expose token hashes, password hashes, secret hashes,
provider tokens, raw provider payloads, or internal metadata.

## Runtime Boundary

This package owns only the Express email OTP route surface.

Application code owns:

- UniAuth service construction
- email sender runtime configuration
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
  createUniAuthEmailOtpRouter,
  type UniAuthExpressPasswordlessOptions,
} from "@alyldas/uniauth-express-passwordless";
```
