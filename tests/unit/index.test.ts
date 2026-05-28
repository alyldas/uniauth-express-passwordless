import { describe, expect, it } from "vitest";

import {
  UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY,
  type UniAuthExpressPasswordlessStrategy,
} from "../../src/index.js";

describe("package entrypoint", () => {
  it("exports the scaffold strategy marker", () => {
    const strategy: UniAuthExpressPasswordlessStrategy =
      UNI_AUTH_EXPRESS_PASSWORDLESS_STRATEGY;

    expect(strategy).toBe("express-passwordless");
  });
});
