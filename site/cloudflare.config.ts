import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "dsh-worker",
		compatibilityDate: "2026-10-26",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "worker/bundle.js",
		observability: {
			enabled: true,
			logs: {
				enabled: true,
				invocationLogs: true,
			},
		},
		triggers: [
			triggers.scheduled({
				schedule: "42 10 * * *",
			}),
		],
		env: {
			DB: bindings.d1({
				name: "dsh-telemetry",
				id: "e828893a-5f98-444a-9082-71910bd705ae",
			}),
		},
			},
});
