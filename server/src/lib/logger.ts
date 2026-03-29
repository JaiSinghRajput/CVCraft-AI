export const logger = {
	info: (...args: unknown[]): void => {
		console.log("[INFO]", ...args);
	},
	error: (...args: unknown[]): void => {
		console.error("[ERROR]", ...args);
	},
	warn: (...args: unknown[]): void => {
		console.warn("[WARN]", ...args);
	},
};
