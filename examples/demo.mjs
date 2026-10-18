import { acquireSnapshot } from "../src/snapshot.mjs";
import { createAtlas } from "../src/atlas.mjs";
import { fixture, SCOPE } from "../tests/fixtures.mjs";
const { request } = fixture();
const { snapshot, digest } = await acquireSnapshot(SCOPE, { request });
const atlas = createAtlas(snapshot, digest);
const match = atlas
  .query("search_symbols", { query: "target" })
  .data.items.find((x) => x.path === "src/core.py");
console.log(
  JSON.stringify(
    atlas.query("impact_preview", { symbolId: match.id }),
    null,
    2,
  ),
);
