import Redis from "ioredis";

import { env } from "./env";

export const redisConnection = new Redis(env.redisUrl, {
	maxRetriesPerRequest: null,
	enableReadyCheck: true,
});
