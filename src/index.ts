import type { AuthPublicFacade, EmailSender } from "@alyldas/uniauth-core";
import type { UniAuthSessionTransportOptions } from "@alyldas/uniauth-express";

export const UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY =
  "express-passwordless" as const;

export type UniAuthExpressPasswordlessStrategy =
  typeof UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY;

export interface UniAuthExpressPasswordlessOptions {
  readonly auth: AuthPublicFacade;
  readonly transport?: UniAuthSessionTransportOptions;
  readonly emailOtp?: UniAuthExpressPasswordlessEmailOtpOptions;
}

export interface UniAuthExpressPasswordlessEmailOtpOptions {
  readonly sender: EmailSender;
}
