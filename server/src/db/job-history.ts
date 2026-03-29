import type { JobStatus } from "../lib/job-store";
import { prisma } from "./prisma";

export const saveJobHistory = async (input: {
	jobId: string;
	jobType: string;
	status: JobStatus;
	result?: unknown;
	error?: string;
}): Promise<void> => {
	await prisma.jobHistory.upsert({
		where: { jobId: input.jobId },
		create: {
			jobId: input.jobId,
			jobType: input.jobType,
			status: input.status,
			resultJson: input.result === undefined ? null : JSON.stringify(input.result),
			errorMessage: input.error ?? null,
		},
		update: {
			jobType: input.jobType,
			status: input.status,
			resultJson: input.result === undefined ? null : JSON.stringify(input.result),
			errorMessage: input.error ?? null,
		},
	});
};
