import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../../api-server/package.json", import.meta.url));
const { build } = require("esbuild");

test("menu age-group helpers do not download API schemas or Zod", async () => {
  const result = await build({
    stdin: {
      contents: `export { teamFeatures, normalizeTeamAgeGroup, TEAM_AGE_GROUP_OPTIONS } from "@workspace/api-client-react";`,
      resolveDir: new URL("../", import.meta.url).pathname,
      sourcefile: "menu-features.ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
    minify: true,
  });
  const included = Object.entries(result.metafile.outputs).flatMap(([, output]) =>
    Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path),
  );
  assert.ok(included.some((path) => path.endsWith("/team-features.ts")));
  assert.ok(!included.some((path) => path.includes("/zod/") || path.includes("/zod@")));
  assert.ok(!included.some((path) => path.includes("api-zod/src/generated/")));
  assert.ok(result.outputFiles[0].contents.length < 10_000, "menu helpers should remain lightweight");

  const helpers = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  assert.equal(helpers.teamFeatures("U13").monitoring, false);
  assert.equal(helpers.teamFeatures("U14").monitoring, true);
  assert.equal(helpers.teamFeatures("U17").timekeeping, true);
  assert.equal(helpers.teamFeatures("U18").timekeeping, false);
  assert.equal(helpers.teamFeatures("Seniors").monitoring, true);
});
