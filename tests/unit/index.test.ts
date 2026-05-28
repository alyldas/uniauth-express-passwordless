import type { AuthPublicFacade, PublicAuthResult } from "@alyldas/uniauth-core";
import { UniAuthError, UniAuthErrorCode } from "@alyldas/uniauth-core";
import {
  createUniAuthErrorHandler,
  REQUEST_CANNOT_BE_COMPLETED_MESSAGE,
  TOO_MANY_AUTH_ATTEMPTS_MESSAGE,
} from "@alyldas/uniauth-express";
import type { Request, Response, Router } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  createUniAuthEmailOtpRouter,
  UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY,
  type UniAuthExpressPasswordlessStrategy,
} from "../../src/index.js";

describe("package entrypoint", () => {
  it("exports the strategy marker", () => {
    const strategy: UniAuthExpressPasswordlessStrategy =
      UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY;

    expect(strategy).toBe("express-passwordless");
  });
});

describe("createUniAuthEmailOtpRouter", () => {
  it("calls the auth service and returns a neutral start response", async () => {
    const auth = createAuthFacade();
    auth.otp.start.mockResolvedValue({
      verificationId: "verification_123",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      delivery: "email",
      secret: "123456",
      secretHash: "hashed-secret",
      metadata: { internal: true },
    } as never);

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/start",
      body: {
        email: " user@example.com ",
        now: "2026-01-01T00:00:00.000Z",
        metadata: { requestId: "request_123" },
      },
    });

    expect(auth.otp.start).toHaveBeenCalledWith({
      purpose: "sign-in",
      channel: "email",
      target: "user@example.com",
      metadata: { requestId: "request_123" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.body).toEqual({
      verificationId: "verification_123",
      expiresAt: new Date("2026-01-01T00:05:00.000Z"),
      delivery: "email",
    });
    expect(JSON.stringify(response.body)).not.toContain("secret");
    expect(JSON.stringify(response.body)).not.toContain("secretHash");
    expect(JSON.stringify(response.body)).not.toContain("metadata");
  });

  it("returns a safe sign-in response", async () => {
    const auth = createAuthFacade();
    auth.otp.signIn.mockResolvedValue(createUnsafeAuthResult());

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/sign-in",
      body: {
        verificationId: "verification_123",
        code: "123456",
        now: "2026-01-01T00:00:00.000Z",
        sessionExpiresAt: "2026-01-02T00:00:00.000Z",
        metadata: { requestId: "request_123" },
      },
    });

    expect(auth.otp.signIn).toHaveBeenCalledWith({
      verificationId: "verification_123",
      secret: "123456",
      channel: "email",
      metadata: { requestId: "request_123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: "user_123",
        displayName: "User",
        email: "user@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      identity: {
        id: "identity_123",
        provider: "email-otp",
        status: "active",
        email: "user@example.com",
        emailVerified: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      session: {
        id: "session_123",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      sessionToken: "session-token",
      isNewUser: false,
      isNewIdentity: false,
    });
  });

  it("writes the session cookie when cookie transport is configured", async () => {
    const auth = createAuthFacade();
    auth.otp.signIn.mockResolvedValue(createUnsafeAuthResult());

    const response = await invokeRouter(
      createUniAuthEmailOtpRouter({
        auth,
        transport: {
          cookie: {
            name: "uniauth_session",
            encode: (token) => `encoded:${token}`,
            options: { secure: true },
          },
        },
      }),
      {
        path: "/email-otp/sign-in",
        body: {
          verificationId: "verification_123",
          secret: "123456",
        },
      },
    );

    expect(response.cookies).toEqual([
      {
        name: "uniauth_session",
        value: "encoded:session-token",
        options: {
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: true,
        },
      },
    ]);
    expect(response.body).not.toHaveProperty("sessionToken");
  });

  it("does not write a session cookie when cookie transport is not configured", async () => {
    const auth = createAuthFacade();
    auth.otp.signIn.mockResolvedValue(createUnsafeAuthResult());

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/sign-in",
      body: {
        verificationId: "verification_123",
        secret: "123456",
      },
    });

    expect(response.cookies).toEqual([]);
    expect(response.body).toEqual({
      user: {
        id: "user_123",
        displayName: "User",
        email: "user@example.com",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      identity: {
        id: "identity_123",
        provider: "email-otp",
        status: "active",
        email: "user@example.com",
        emailVerified: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      session: {
        id: "session_123",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      sessionToken: "session-token",
      isNewUser: false,
      isNewIdentity: false,
    });
    expect(response.body).toMatchObject({ sessionToken: "session-token" });
  });

  it("uses application-owned session expiration configuration", async () => {
    const auth = createAuthFacade();
    auth.otp.signIn.mockResolvedValue(createUnsafeAuthResult());

    await invokeRouter(
      createUniAuthEmailOtpRouter({
        auth,
        sessionExpiresAt: () => new Date("2026-01-03T00:00:00.000Z"),
      }),
      {
        path: "/email-otp/sign-in",
        body: {
          verificationId: "verification_123",
          secret: "123456",
          sessionExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    );

    expect(auth.otp.signIn).toHaveBeenCalledWith({
      verificationId: "verification_123",
      secret: "123456",
      channel: "email",
      sessionExpiresAt: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  it("does not expose internal auth fields", async () => {
    const auth = createAuthFacade();
    auth.otp.signIn.mockResolvedValue(createUnsafeAuthResult());

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/sign-in",
      body: {
        verificationId: "verification_123",
        secret: "123456",
      },
    });

    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("secretHash");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("providerTokens");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("metadata");
  });

  it("maps malformed input to a validation error response", async () => {
    const auth = createAuthFacade();

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/sign-in",
      body: {
        verificationId: "verification_123",
      },
      mapErrors: true,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: REQUEST_CANNOT_BE_COMPLETED_MESSAGE,
    });
    expect(auth.otp.signIn).not.toHaveBeenCalled();
  });

  it("maps service errors through the UniAuth error handler", async () => {
    const auth = createAuthFacade();
    auth.otp.start.mockRejectedValue(
      new UniAuthError(UniAuthErrorCode.RateLimited, "Rate limited."),
    );

    const response = await invokeRouter(createUniAuthEmailOtpRouter({ auth }), {
      path: "/email-otp/start",
      body: {
        email: "user@example.com",
      },
      mapErrors: true,
    });

    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({ error: TOO_MANY_AUTH_ATTEMPTS_MESSAGE });
  });
});

function createAuthFacade(): AuthPublicFacade & {
  readonly otp: {
    readonly start: ReturnType<typeof vi.fn>;
    readonly signIn: ReturnType<typeof vi.fn>;
  };
} {
  return {
    otp: {
      start: vi.fn(),
      resend: vi.fn(),
      signIn: vi.fn(),
    },
  } as unknown as AuthPublicFacade & {
    readonly otp: {
      readonly start: ReturnType<typeof vi.fn>;
      readonly signIn: ReturnType<typeof vi.fn>;
    };
  };
}

function createUnsafeAuthResult(): PublicAuthResult {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const expiresAt = new Date("2026-01-02T00:00:00.000Z");

  return {
    user: {
      id: "user_123",
      displayName: "User",
      email: "user@example.com",
      createdAt,
      updatedAt: createdAt,
      metadata: { internal: true },
      passwordHash: "hashed-password",
    },
    identity: {
      id: "identity_123",
      provider: "email-otp",
      status: "active",
      email: "user@example.com",
      emailVerified: true,
      createdAt,
      updatedAt: createdAt,
      providerTokens: { accessToken: "provider-token" },
      providerPayload: { raw: true },
      metadata: { internal: true },
    },
    session: {
      id: "session_123",
      status: "active",
      createdAt,
      expiresAt,
      tokenHash: "hashed-token",
      metadata: { internal: true },
    },
    sessionToken: "session-token",
    isNewUser: false,
    isNewIdentity: false,
    secretHash: "hashed-secret",
  } as unknown as PublicAuthResult;
}

async function invokeRouter(
  router: Router,
  input: {
    readonly path: string;
    readonly body: unknown;
    readonly mapErrors?: boolean;
  },
): Promise<{
  readonly statusCode: number;
  readonly body: unknown;
  readonly cookies: readonly {
    readonly name: string;
    readonly value: string;
    readonly options: unknown;
  }[];
}> {
  let statusCode = 200;
  let body: unknown;
  const cookies: {
    readonly name: string;
    readonly value: string;
    readonly options: unknown;
  }[] = [];

  const request = {
    method: "POST",
    url: input.path,
    originalUrl: input.path,
    headers: {},
    body: input.body,
  } as Request;
  const response = {
    status(value: number) {
      statusCode = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
    cookie(name: string, value: string, options: unknown) {
      cookies.push({ name, value, options });
      return this;
    },
    headersSent: false,
  } as Response;

  await new Promise<void>((resolve, reject) => {
    const next = (error?: unknown): void => {
      if (!error) {
        resolve();
        return;
      }

      if (!input.mapErrors) {
        reject(toError(error));
        return;
      }

      createUniAuthErrorHandler()(error, request, response, (mappedError) => {
        reject(toError(mappedError));
      });
      resolve();
    };

    response.json = ((value: unknown) => {
      body = value;
      resolve();
      return response;
    }) as Response["json"];

    router(request, response, next);
  });

  return { statusCode, body, cookies };
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error("Unknown router error.");
}
