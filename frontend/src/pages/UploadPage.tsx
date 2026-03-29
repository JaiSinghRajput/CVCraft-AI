import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { submitAnalyze, submitGenerate, submitMatch } from "../lib/api";

type JobKind = "analyze" | "match" | "generate";

const kindConfig: Record<JobKind, { title: string; fileLabel: string; fileKey: string }> = {
	analyze: { title: "Resume Analyzer", fileLabel: "Resume PDF", fileKey: "resume" },
	match: { title: "Job Matcher", fileLabel: "Resume PDF", fileKey: "resume" },
	generate: { title: "AI Resume Builder", fileLabel: "LinkedIn PDF", fileKey: "linkedin" },
};

export const UploadPage = () => {
	const [kind, setKind] = useState<JobKind>("analyze");
	const [file, setFile] = useState<File | null>(null);
	const [jobDescription, setJobDescription] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const navigate = useNavigate();

	const requiresJobDescription = useMemo(() => kind !== "analyze", [kind]);

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError("");

		if (!file) {
			setError("Please upload a PDF file.");
			return;
		}

		if (requiresJobDescription && jobDescription.trim().length < 20) {
			setError("Job description must be at least 20 characters.");
			return;
		}

		setLoading(true);
		try {
			let jobId = "";
			if (kind === "analyze") {
				jobId = (await submitAnalyze(file)).jobId;
			} else if (kind === "match") {
				jobId = (await submitMatch(file, jobDescription)).jobId;
			} else {
				jobId = (await submitGenerate(file, jobDescription)).jobId;
			}
			navigate(`/results/${jobId}`);
		} catch (requestError) {
			setError((requestError as Error).message || "Failed to submit job");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mx-auto max-w-4xl px-4 py-10">
			<header className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">AI Career Assistant</p>
				<h1 className="mt-2 text-3xl font-semibold text-slate-900">Upload Your Career Documents</h1>
				<p className="mt-2 text-slate-600">
					Analyze ATS score, compare fit against job roles, and generate tailored resumes.
				</p>
			</header>

			<form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<div className="grid gap-4 md:grid-cols-3">
					{(Object.keys(kindConfig) as JobKind[]).map((item) => (
						<button
							type="button"
							key={item}
							onClick={() => setKind(item)}
							className={`rounded-xl border px-4 py-3 text-left transition ${
								kind === item
									? "border-emerald-600 bg-emerald-50 text-emerald-800"
									: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
							}`}
						>
							<p className="font-medium">{kindConfig[item].title}</p>
						</button>
					))}
				</div>

				<div>
					<label className="mb-2 block text-sm font-medium text-slate-700">{kindConfig[kind].fileLabel}</label>
					<input
						type="file"
						accept="application/pdf"
						onChange={(event) => setFile(event.target.files?.[0] ?? null)}
						className="block w-full rounded-xl border border-slate-300 p-3"
					/>
				</div>

				{requiresJobDescription ? (
					<div>
						<label className="mb-2 block text-sm font-medium text-slate-700">Job Description</label>
						<textarea
							rows={8}
							value={jobDescription}
							onChange={(event) => setJobDescription(event.target.value)}
							className="w-full rounded-xl border border-slate-300 p-3"
							placeholder="Paste the target job description"
						/>
					</div>
				) : null}

				{error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

				<button
					disabled={loading}
					type="submit"
					className="rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
				>
					{loading ? "Submitting..." : "Run Analysis"}
				</button>
			</form>
		</div>
	);
};
