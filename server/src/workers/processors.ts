import type { Job } from "bullmq";

import { saveJobHistory } from "../db/job-history";
import { saveJobState } from "../lib/job-store";
import { extractPdfText } from "../lib/pdf-parser";
import { generateTailoredResume } from "../services/generator.service";
import { matchResumeToJob } from "../services/job.service";
import { analyzeResumeText } from "../services/resume.service";

const setState = async (
	jobId: string,
	jobType: string,
	status: "pending" | "processing" | "completed" | "failed",
	result?: unknown,
	error?: string,
): Promise<void> => {
	await saveJobState({
		id: jobId,
		jobType,
		status,
		result,
		error,
		updatedAt: new Date().toISOString(),
	});
	await saveJobHistory({ jobId, jobType, status, result, error });
};

export const processResumeAnalysis = async (
	job: Job<{ jobId: string; resumeBuffer: string }>,
): Promise<void> => {
	const { jobId, resumeBuffer } = job.data;
	await setState(jobId, "resume-analysis", "processing");

	try {
		const text = await extractPdfText(Buffer.from(resumeBuffer, "base64"));
		const result = await analyzeResumeText(text);
		await setState(jobId, "resume-analysis", "completed", result);
	} catch (error) {
		await setState(jobId, "resume-analysis", "failed", undefined, (error as Error).message);
		throw error;
	}
};

export const processJobMatching = async (
	job: Job<{ jobId: string; resumeBuffer: string; jobDescription: string }>,
): Promise<void> => {
	const { jobId, resumeBuffer, jobDescription } = job.data;
	await setState(jobId, "job-matching", "processing");

	try {
		const text = await extractPdfText(Buffer.from(resumeBuffer, "base64"));
		const result = await matchResumeToJob(text, jobDescription);
		await setState(jobId, "job-matching", "completed", result);
	} catch (error) {
		await setState(jobId, "job-matching", "failed", undefined, (error as Error).message);
		throw error;
	}
};

export const processResumeGeneration = async (
	job: Job<{ jobId: string; linkedinBuffer: string; jobDescription: string }>,
): Promise<void> => {
	const { jobId, linkedinBuffer, jobDescription } = job.data;
	await setState(jobId, "resume-generation", "processing");

	try {
		const text = await extractPdfText(Buffer.from(linkedinBuffer, "base64"));
		const result = await generateTailoredResume(text, jobDescription);
		await setState(jobId, "resume-generation", "completed", result);
	} catch (error) {
		await setState(jobId, "resume-generation", "failed", undefined, (error as Error).message);
		throw error;
	}
};
