import axios from "axios";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface JobResponse<T = unknown> {
	id: string;
	status: JobStatus;
	jobType: string;
	result?: T;
	error?: string;
	updatedAt: string;
}

const api = axios.create({
	baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api",
	timeout: 30000,
});

export const submitAnalyze = async (resume: File): Promise<{ jobId: string; status: JobStatus }> => {
	const form = new FormData();
	form.append("resume", resume);
	const response = await api.post("/analyze", form);
	return response.data as { jobId: string; status: JobStatus };
};

export const submitMatch = async (
	resume: File,
	jobDescription: string,
): Promise<{ jobId: string; status: JobStatus }> => {
	const form = new FormData();
	form.append("resume", resume);
	form.append("jobDescription", jobDescription);
	const response = await api.post("/match", form);
	return response.data as { jobId: string; status: JobStatus };
};

export const submitGenerate = async (
	linkedin: File,
	jobDescription: string,
	githubUsername?: string,
): Promise<{ jobId: string; status: JobStatus }> => {
	const form = new FormData();
	form.append("linkedin", linkedin);
	form.append("jobDescription", jobDescription);
	if (githubUsername?.trim()) {
		form.append("githubUsername", githubUsername.trim());
	}
	const response = await api.post("/generate", form);
	return response.data as { jobId: string; status: JobStatus };
};

export const fetchJob = async <T>(jobId: string): Promise<JobResponse<T>> => {
	const response = await api.get(`/jobs/${jobId}`);
	return response.data as JobResponse<T>;
};
