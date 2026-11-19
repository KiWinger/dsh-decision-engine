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
			// 共享推送服务（DEC-063）：日报经 www-worker 的 Services.sendPush 发出。
			// 部署顺序：先 www-worker 后本 worker。
			WWW_SERVICES: bindings.worker({
				worker: "www-worker",
				exportName: "Services",
			}),
			DB: bindings.d1({
				name: "dsh-telemetry",
				id: "e828893a-5f98-444a-9082-71910bd705ae",
			}),
		},
			},
});
