import { redisConnection } from "./redis";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobState {
	id: string;
	status: JobStatus;
	jobType: string;
	result?: unknown;
	error?: string;
	updatedAt: string;
}

const keyFor = (jobId: string): string => `job:state:${jobId}`;

export const saveJobState = async (state: JobState): Promise<void> => {
	await redisConnection.set(keyFor(state.id), JSON.stringify(state), "EX", 60 * 60 * 24);
};

export const loadJobState = async (jobId: string): Promise<JobState | null> => {
	const raw = await redisConnection.get(keyFor(jobId));
	if (!raw) {
		return null;
	}
	return JSON.parse(raw) as JobState;
};
