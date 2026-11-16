import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	build: {
		command: "node build.mjs && node make-bundle.mjs",
	},
});
