import { Queue } from "bullmq";

import { redisConnection } from "./redis";

export const QUEUE_NAMES = {
	resumeAnalysis: "resume-analysis",
	jobMatching: "job-matching",
	resumeGeneration: "resume-generation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const queues = {
	resumeAnalysis: new Queue(QUEUE_NAMES.resumeAnalysis, { connection: redisConnection }),
	jobMatching: new Queue(QUEUE_NAMES.jobMatching, { connection: redisConnection }),
	resumeGeneration: new Queue(QUEUE_NAMES.resumeGeneration, { connection: redisConnection }),
};

export const defaultJobOptions = {
	attempts: 3,
	backoff: {
		type: "exponential" as const,
		delay: 1000,
	},
	removeOnComplete: {
		age: 60 * 60 * 24,
		count: 1000,
	},
	removeOnFail: {
		age: 60 * 60 * 24 * 3,
	},
};
