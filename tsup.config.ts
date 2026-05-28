import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/index.ts"],
  external: ["@alyldas/uniauth-core", "@alyldas/uniauth-express", "express"],
  format: ["esm"],
  sourcemap: true,
  target: "node22",
});
