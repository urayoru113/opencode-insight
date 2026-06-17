import { defineConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "es2022",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  esbuildPlugins: [
    solidPlugin({
      solid: {
        generate: "universal",
        moduleName: "@opentui/solid",
      },
    }),
  ],
  external: [
    "@opencode-ai/plugin",
    "@opencode-ai/plugin/tui",
    "@opencode-ai/sdk/v2",
    "@opentui/core",
    "@opentui/solid",
    "solid-js",
  ],
});
