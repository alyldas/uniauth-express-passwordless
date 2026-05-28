import {
  OtpChannel,
  VerificationPurpose,
  type AuthPublicFacade,
  type PublicAuthResult,
  type VerificationId,
} from "@alyldas/uniauth-core";
import {
  asyncHandler,
  readBody,
  readOptionalDate,
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
}

export function createUniAuthEmailOtpRouter(
  options: UniAuthExpressPasswordlessOptions,
): Router {
  const router = Router();

  router.post(
    "/email-otp/start",
    asyncHandler(async (request, response) => {
      const body = readBody(request.body);
      const result = await options.auth.otp.start({
        purpose: VerificationPurpose.SignIn,
        channel: OtpChannel.Email,
        target: readRequiredString(body, "email"),
        now: readOptionalDate(body, "now"),
        metadata: readOptionalMetadata(body),
      });

      response.status(202).json(toEmailOtpStartResponse(result));
    }),
  );

  router.post(
    "/email-otp/sign-in",
    asyncHandler(async (request, response) => {
      const body = readBody(request.body);
      const result = await options.auth.otp.signIn({
        verificationId: readRequiredString(
          body,
          "verificationId",
        ) as VerificationId,
        secret: readEmailOtpSecret(body),
        channel: OtpChannel.Email,
        now: readOptionalDate(body, "now"),
        sessionExpiresAt: readOptionalDate(body, "sessionExpiresAt"),
        metadata: readOptionalMetadata(body),
      });

      await sendPublicAuthResult(response, result, options);
    }),
  );

  return router;
}

function toEmailOtpStartResponse(input: {
  readonly verificationId: VerificationId;
  readonly expiresAt: Date;
  readonly delivery: string;
}): {
  readonly verificationId: VerificationId;
  readonly expiresAt: Date;
  readonly delivery: string;
} {
  return {
    verificationId: input.verificationId,
    expiresAt: input.expiresAt,
    delivery: input.delivery,
  };
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

async function sendPublicAuthResult(
  response: Response,
  result: PublicAuthResult,
  options: UniAuthExpressPasswordlessOptions,
): Promise<void> {
  await writeSessionCookie(response, result.sessionToken, options.transport);
  response.status(200).json(toPublicAuthResponse(result));
}

function toPublicAuthResponse(result: PublicAuthResult): PublicAuthResult {
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
    sessionToken: result.sessionToken,
    isNewUser: result.isNewUser,
    isNewIdentity: result.isNewIdentity,
  };
}
