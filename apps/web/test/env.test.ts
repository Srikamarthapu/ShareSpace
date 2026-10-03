import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const configSource = fileURLToPath(new URL("../next.config.ts", import.meta.url));

describe("shared root environment configuration", () => {
  it.each([
    {
      name: "works without a root env file",
      root: false,
      app: false,
      deployment: false,
      value: null,
    },
    { name: "loads the root env file", root: true, app: false, deployment: false, value: "root" },
    {
      name: "loads root values after Next caches the app env",
      root: true,
      app: true,
      deployment: false,
      value: "app",
    },
    {
      name: "preserves deployment values",
      root: true,
      app: true,
      deployment: true,
      value: "deployment",
    },
  ])("$name", ({ root, app, deployment, value }) => {
    const directory = mkdtempSync(join(tmpdir(), "sharespace-env-test-"));
    try {
      const appDirectory = join(directory, "apps", "web");
      mkdirSync(appDirectory, { recursive: true });
      const config = join(appDirectory, "next.config.ts");
      copyFileSync(configSource, config);
      if (root) {
        writeFileSync(
          join(directory, ".env"),
          "SHARESPACE_TEST_VALUE=root\nSHARESPACE_TEST_ROOT_ONLY=loaded\n",
        );
      }
      if (app) writeFileSync(join(appDirectory, ".env.local"), "SHARESPACE_TEST_VALUE=app\n");

      const runner = join(directory, "verify.mjs");
      writeFileSync(
        runner,
        `
        import nextEnv from ${JSON.stringify(pathToFileURL(require.resolve("@next/env")).href)};
        ${app ? `nextEnv.loadEnvConfig(${JSON.stringify(appDirectory)}, process.env.NODE_ENV !== "production");` : ""}
        await import(${JSON.stringify(pathToFileURL(config).href)});
        console.log(JSON.stringify({
          value: process.env.SHARESPACE_TEST_VALUE ?? null,
          root: process.env.SHARESPACE_TEST_ROOT_ONLY ?? null,
        }));
      `,
      );
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: deployment ? "production" : "development",
      };
      delete environment.SHARESPACE_TEST_VALUE;
      delete environment.SHARESPACE_TEST_ROOT_ONLY;
      if (deployment) environment.SHARESPACE_TEST_VALUE = "deployment";
      const result = execFileSync(process.execPath, ["--import", require.resolve("tsx"), runner], {
        env: environment,
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(JSON.parse(result)).toEqual({ value, root: root ? "loaded" : null });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
