import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", external: ["electron"], sourcemap: true };
await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.js", format: "esm" });
await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs", format: "cjs" });
console.log("electron main + preload built");
