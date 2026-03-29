import { Worker } from "bullmq";

import { logger } from "../lib/logger";
import { QUEUE_NAMES } from "../lib/queue";
import { redisConnection } from "../lib/redis";

import {
	processJobMatching,
	processResumeAnalysis,
	processResumeGeneration,
} from "./processors";

const workers = [
	new Worker(QUEUE_NAMES.resumeAnalysis, processResumeAnalysis, { connection: redisConnection }),
	new Worker(QUEUE_NAMES.jobMatching, processJobMatching, { connection: redisConnection }),
	new Worker(QUEUE_NAMES.resumeGeneration, processResumeGeneration, { connection: redisConnection }),
];

for (const worker of workers) {
	worker.on("ready", () => logger.info(`Worker ready for queue: ${worker.name}`));
	worker.on("failed", (job, error) => {
		logger.error(`Job failed on ${worker.name}`, job?.id, error.message);
	});
	worker.on("completed", (job) => {
		logger.info(`Job completed on ${worker.name}`, job.id);
	});
}

process.on("SIGINT", async () => {
	await Promise.all(workers.map((worker) => worker.close()));
	await redisConnection.quit();
	process.exit(0);
});
