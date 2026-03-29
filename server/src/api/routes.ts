import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { saveJobHistory } from "../db/job-history";
import { env } from "../lib/env";
import { loadJobState, saveJobState } from "../lib/job-store";
import { defaultJobOptions, queues } from "../lib/queue";

const router = Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: env.maxUploadMb * 1024 * 1024,
		files: 1,
	},
	fileFilter: (_req, file, cb) => {
		if (file.mimetype !== "application/pdf") {
			cb(new Error("Only PDF files are allowed"));
			return;
		}
		cb(null, true);
	},
});

const enqueuePending = async (jobId: string, jobType: string): Promise<void> => {
	await saveJobState({
		id: jobId,
		jobType,
		status: "pending",
		updatedAt: new Date().toISOString(),
	});
	await saveJobHistory({ jobId, jobType, status: "pending" });
};

const parseBody = <T extends z.ZodTypeAny>(res: Response, schema: T, input: unknown): z.infer<T> | null => {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
		return null;
	}
	return parsed.data;
};

router.post("/analyze", upload.single("resume"), async (req: Request, res: Response) => {
	if (!req.file) {
		res.status(400).json({ error: "Resume PDF is required" });
		return;
	}

	const jobId = randomUUID();
	await enqueuePending(jobId, "resume-analysis");

	await queues.resumeAnalysis.add(
		"resume-analysis",
		{ jobId, resumeBuffer: req.file.buffer.toString("base64") },
		{ ...defaultJobOptions, jobId },
	);

	res.status(202).json({ jobId, status: "pending" });
});

const matchSchema = z.object({
	jobDescription: z.string().min(20).max(12000),
});

router.post("/match", upload.single("resume"), async (req: Request, res: Response) => {
	if (!req.file) {
		res.status(400).json({ error: "Resume PDF is required" });
		return;
	}

	const body = parseBody(res, matchSchema, req.body);
	if (!body) {
		return;
	}

	const jobId = randomUUID();
	await enqueuePending(jobId, "job-matching");

	await queues.jobMatching.add(
		"job-matching",
		{ jobId, resumeBuffer: req.file.buffer.toString("base64"), jobDescription: body.jobDescription },
		{ ...defaultJobOptions, jobId },
	);

	res.status(202).json({ jobId, status: "pending" });
});

const generateSchema = z.object({
	jobDescription: z.string().min(20).max(12000),
});

router.post("/generate", upload.single("linkedin"), async (req: Request, res: Response) => {
	if (!req.file) {
		res.status(400).json({ error: "LinkedIn PDF is required" });
		return;
	}

	const body = parseBody(res, generateSchema, req.body);
	if (!body) {
		return;
	}

	const jobId = randomUUID();
	await enqueuePending(jobId, "resume-generation");

	await queues.resumeGeneration.add(
		"resume-generation",
		{ jobId, linkedinBuffer: req.file.buffer.toString("base64"), jobDescription: body.jobDescription },
		{ ...defaultJobOptions, jobId },
	);

	res.status(202).json({ jobId, status: "pending" });
});

router.get("/jobs/:id", async (req: Request, res: Response) => {
	const jobId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const state = await loadJobState(jobId);
	if (!state) {
		res.status(404).json({ error: "Job not found" });
		return;
	}
	res.status(200).json(state);
});

export { router as apiRouter };
