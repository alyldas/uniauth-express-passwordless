import {
  OtpChannel,
  UniAuthErrorCode,
  VerificationPurpose,
  type AuthPublicFacade,
  type EmailSender,
  type PublicAuthResult,
  type StartOtpChallengeResult,
  type UniAuthError,
  type VerificationId,
} from "@alyldas/uniauth-core";
import {
  asyncHandler,
  readBody,
  readOptionalMetadata,
  readOptionalString,
  readRequiredString,
  RequestValidationError,
  writeSessionCookie,
  type UniAuthSessionTransportOptions,
} from "@alyldas/uniauth-express";
import { Router, type Response } from "express";

export const UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY =
  "express-passwordless" as const;

export type UniAuthExpressPasswordlessStrategy =
  typeof UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY;

export interface UniAuthExpressPasswordlessOptions {
  readonly auth: AuthPublicFacade;
  readonly transport?: UniAuthSessionTransportOptions;
  readonly sessionExpiresAt?: () => Date;
  readonly emailOtpDebug?: UniAuthEmailOtpDebugOptions;
  readonly onEmailOtpStarted?: UniAuthEmailOtpStartedHook;
  readonly onEmailOtpSignInFailed?: UniAuthEmailOtpSignInFailedHook;
}

export interface UniAuthEmailOtpDebugOptions {
  readonly exposeCodeInStartResponse?: boolean;
  readonly resolveCode?: UniAuthEmailOtpDebugCodeResolver;
  readonly isProduction?: () => boolean;
}

export type UniAuthEmailOtpDebugCodeResolver = (
  input: UniAuthEmailOtpDebugCodeResolverInput,
) => string | undefined | Promise<string | undefined>;

export interface UniAuthEmailOtpDebugCodeResolverInput {
  readonly verificationId: VerificationId;
  readonly email: string;
  readonly expiresAt: Date;
  readonly delivery: string;
  readonly metadata?: Record<string, unknown>;
}

export type UniAuthEmailOtpStartedHook = (
  event: UniAuthEmailOtpStartedEvent,
) => void | Promise<void>;

export interface UniAuthEmailOtpStartedEvent {
  readonly verificationId: VerificationId;
  readonly email: string;
  readonly expiresAt: Date;
  readonly delivery: string;
  readonly metadata?: Record<string, unknown>;
}

export type UniAuthEmailOtpSignInFailureCategory =
  | "invalid_otp"
  | "rate_limited"
  | "policy_denied"
  | "invalid_input"
  | "unexpected";

export type UniAuthEmailOtpSignInFailedHook = (
  event: UniAuthEmailOtpSignInFailedEvent,
) => void | Promise<void>;

export interface UniAuthEmailOtpSignInFailedEvent {
  readonly verificationId: VerificationId;
  readonly category: UniAuthEmailOtpSignInFailureCategory;
  readonly reason: string;
  readonly error: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface UniAuthEmailOtpTestOutboxMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
}

export interface UniAuthEmailOtpTestOutbox {
  readonly sender: EmailSender;
  listMessages(): readonly UniAuthEmailOtpTestOutboxMessage[];
  findLatestCode(input: { readonly email: string }): string | undefined;
  clear(): void;
}

export function createUniAuthEmailOtpRouter(
  options: UniAuthExpressPasswordlessOptions,
): Router {
  assertEmailOtpDebugAllowed(options.emailOtpDebug);

  const router = Router();

  router.post(
    "/email-otp/start",
    asyncHandler(async (request, response) => {
      const body = readBody(request.body);
      const email = readRequiredString(body, "email");
      const metadata = readOptionalMetadata(body);
      const result = await options.auth.otp.start({
        purpose: VerificationPurpose.SignIn,
        channel: OtpChannel.Email,
        target: email,
        metadata,
      });
      const event = toEmailOtpStartedEvent(result, email, metadata);

      await options.onEmailOtpStarted?.(event);

      response
        .status(202)
        .json(await toEmailOtpStartResponse(event, options.emailOtpDebug));
    }),
  );

  router.post(
    "/email-otp/sign-in",
    asyncHandler(async (request, response) => {
      const body = readBody(request.body);
      const verificationId = readRequiredString(
        body,
        "verificationId",
      ) as VerificationId;
      const metadata = readOptionalMetadata(body);
      let result: PublicAuthResult;

      try {
        result = await options.auth.otp.signIn({
          verificationId,
          secret: readEmailOtpSecret(body),
          channel: OtpChannel.Email,
          sessionExpiresAt: options.sessionExpiresAt?.(),
          metadata,
        });
      } catch (error) {
        await options.onEmailOtpSignInFailed?.(
          toEmailOtpSignInFailedEvent(error, verificationId, metadata),
        );
        throw error;
      }

      await sendPublicAuthResult(response, result, options);
    }),
  );

  return router;
}

export function createEmailOtpTestOutbox(): UniAuthEmailOtpTestOutbox {
  const messages: UniAuthEmailOtpTestOutboxMessage[] = [];

  return {
    sender: createEmailOtpTestSender(messages),
    listMessages: () => [...messages],
    findLatestCode: ({ email }) => {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (message?.to === email) {
          return findEmailOtpCode(message.text);
        }
      }

      return undefined;
    },
    clear: () => {
      messages.length = 0;
    },
  };
}

export function createEmailOtpTestSender(
  messages: UniAuthEmailOtpTestOutboxMessage[] = [],
): EmailSender {
  return {
    sendEmail: (input) => {
      messages.push(input);
      return Promise.resolve();
    },
  };
}

function toEmailOtpStartedEvent(
  input: StartOtpChallengeResult,
  email: string,
  metadata: Record<string, unknown> | undefined,
): UniAuthEmailOtpStartedEvent {
  return {
    verificationId: input.verificationId,
    expiresAt: input.expiresAt,
    delivery: input.delivery,
    email,
    ...(metadata ? { metadata } : {}),
  };
}

async function toEmailOtpStartResponse(
  input: UniAuthEmailOtpStartedEvent,
  debug: UniAuthEmailOtpDebugOptions | undefined,
): Promise<{
  readonly verificationId: VerificationId;
  readonly expiresAt: Date;
  readonly delivery: string;
  readonly debug?: {
    readonly code: string;
  };
}> {
  const response = {
    verificationId: input.verificationId,
    expiresAt: input.expiresAt,
    delivery: input.delivery,
  };

  const code = await resolveEmailOtpDebugCode(input, debug);

  return code ? { ...response, debug: { code } } : response;
}

async function resolveEmailOtpDebugCode(
  input: UniAuthEmailOtpStartedEvent,
  debug: UniAuthEmailOtpDebugOptions | undefined,
): Promise<string | undefined> {
  if (!debug?.exposeCodeInStartResponse || !debug.resolveCode) {
    return undefined;
  }

  if ((debug.isProduction ?? isNodeProduction)()) {
    throw new Error("Email OTP debug code exposure is disabled in production.");
  }

  return debug.resolveCode(input);
}

function assertEmailOtpDebugAllowed(
  debug: UniAuthEmailOtpDebugOptions | undefined,
): void {
  if (
    debug?.exposeCodeInStartResponse &&
    debug.resolveCode &&
    (debug.isProduction ?? isNodeProduction)()
  ) {
    throw new Error("Email OTP debug code exposure is disabled in production.");
  }
}

function isNodeProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readEmailOtpSecret(input: Record<string, unknown>): string {
  const secret = readOptionalString(input, "secret");

  if (secret) {
    return secret;
  }

  const code = readOptionalString(input, "code");

  if (code) {
    return code;
  }

  throw new RequestValidationError("secret or code is required.");
}

function toEmailOtpSignInFailedEvent(
  error: unknown,
  verificationId: VerificationId,
  metadata: Record<string, unknown> | undefined,
): UniAuthEmailOtpSignInFailedEvent {
  const { category, reason } = categorizeEmailOtpSignInFailure(error);

  return {
    verificationId,
    category,
    reason,
    error,
    ...(metadata ? { metadata } : {}),
  };
}

function categorizeEmailOtpSignInFailure(error: unknown): {
  readonly category: UniAuthEmailOtpSignInFailureCategory;
  readonly reason: string;
} {
  if (isUniAuthErrorLike(error)) {
    if (
      error.code === UniAuthErrorCode.VerificationNotFound ||
      error.code === UniAuthErrorCode.VerificationExpired ||
      error.code === UniAuthErrorCode.VerificationConsumed ||
      error.code === UniAuthErrorCode.VerificationInvalidSecret
    ) {
      return { category: "invalid_otp", reason: error.code };
    }

    if (error.code === UniAuthErrorCode.RateLimited) {
      return { category: "rate_limited", reason: error.code };
    }

    if (error.code === UniAuthErrorCode.PolicyDenied) {
      return { category: "policy_denied", reason: error.code };
    }

    if (error.code === UniAuthErrorCode.InvalidInput) {
      return { category: "invalid_input", reason: error.code };
    }

    return { category: "unexpected", reason: error.code };
  }

  return { category: "unexpected", reason: "unknown_error" };
}

function isUniAuthErrorLike(error: unknown): error is UniAuthError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}

function findEmailOtpCode(input: string): string | undefined {
  return /\b\d{4,12}\b/u.exec(input)?.[0];
}

async function sendPublicAuthResult(
  response: Response,
  result: PublicAuthResult,
  options: UniAuthExpressPasswordlessOptions,
): Promise<void> {
  if (options.transport?.cookie) {
    await writeSessionCookie(response, result.sessionToken, options.transport);
  }

  response
    .status(200)
    .json(toPublicAuthResponse(result, !options.transport?.cookie));
}

type UniAuthPasswordlessAuthResponse = Omit<
  PublicAuthResult,
  "sessionToken"
> & {
  readonly sessionToken?: string;
};

function toPublicAuthResponse(
  result: PublicAuthResult,
  includeSessionToken: boolean,
): UniAuthPasswordlessAuthResponse {
  return {
    user: {
      id: result.user.id,
      ...(result.user.displayName
        ? { displayName: result.user.displayName }
        : {}),
      ...(result.user.email ? { email: result.user.email } : {}),
      ...(result.user.phone ? { phone: result.user.phone } : {}),
      createdAt: result.user.createdAt,
      updatedAt: result.user.updatedAt,
      ...(result.user.disabledAt ? { disabledAt: result.user.disabledAt } : {}),
    },
    identity: {
      id: result.identity.id,
      provider: result.identity.provider,
      status: result.identity.status,
      ...(result.identity.email ? { email: result.identity.email } : {}),
      ...(result.identity.emailVerified !== undefined
        ? { emailVerified: result.identity.emailVerified }
        : {}),
      ...(result.identity.phone ? { phone: result.identity.phone } : {}),
      ...(result.identity.phoneVerified !== undefined
        ? { phoneVerified: result.identity.phoneVerified }
        : {}),
      ...(result.identity.trustLevel
        ? { trustLevel: result.identity.trustLevel }
        : {}),
      createdAt: result.identity.createdAt,
      updatedAt: result.identity.updatedAt,
      ...(result.identity.disabledAt
        ? { disabledAt: result.identity.disabledAt }
        : {}),
    },
    session: {
      id: result.session.id,
      status: result.session.status,
      createdAt: result.session.createdAt,
      expiresAt: result.session.expiresAt,
      ...(result.session.revokedAt
        ? { revokedAt: result.session.revokedAt }
        : {}),
      ...(result.session.lastSeenAt
        ? { lastSeenAt: result.session.lastSeenAt }
        : {}),
    },
    ...(includeSessionToken ? { sessionToken: result.sessionToken } : {}),
    isNewUser: result.isNewUser,
    isNewIdentity: result.isNewIdentity,
  };
}
