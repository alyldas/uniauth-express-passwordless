# @alyldas/uniauth-express-passwordless

Passwordless-first Express strategy package for UniAuth.

This package is intended to sit on top of `@alyldas/uniauth-core`, `@alyldas/uniauth-express`, and
`express`. It provides the package boundary for public passwordless sign-in flows without taking
ownership of core authentication behavior.

## Status

This first release is scaffold-only. It does not register routes and does not implement OTP or
magic-link runtime logic yet.

## Purpose

`@alyldas/uniauth-express-passwordless` is the Express strategy package for passwordless-first
public sign-in. The intended initial runtime flow is email OTP first. Magic-link support is planned
for a later package change.

Applications remain responsible for constructing UniAuth services, mounting Express routers,
providing senders, and configuring runtime delivery behavior.

## Boundaries

This package does not own:

- database lifecycle or persistence
- SMTP runtime or provider client lifecycle
- UI
- roles or permissions
- core verification lifecycle
- session lifecycle
- passwordless business rules implemented by `@alyldas/uniauth-core`

Application code owns delivery senders and runtime configuration. This package should call public
UniAuth facades and Express adapter contracts when runtime routes are added later.

## Installation

```sh
npm config set @alyldas:registry https://npm.pkg.github.com
npm install @alyldas/uniauth-express-passwordless @alyldas/uniauth-core @alyldas/uniauth-express express
```

## Public API

The current scaffold exports strategy metadata and option types only:

```ts
import {
  UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY,
  type UniAuthExpressPasswordlessOptions,
} from "@alyldas/uniauth-express-passwordless";
```

Runtime route factories will be added in a later PR.
