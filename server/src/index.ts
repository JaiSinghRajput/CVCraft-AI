import cors from "cors";
import express from "express";

import { apiRouter } from "./api/routes";
import { rateLimitMiddleware } from "./api/middleware/rate-limit";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

const app = express();

app.use(
	cors({
		origin: env.clientOrigin,
		credentials: false,
	}),
);
app.use(express.json({ limit: "1mb" }));
app.use(rateLimitMiddleware);

app.get("/health", (_req, res) => {
	res.status(200).json({ status: "ok" });
});

app.use("/api", apiRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	logger.error("Unhandled server error", error);
	res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
	logger.info(`API server listening on http://localhost:${env.port}`);
});
