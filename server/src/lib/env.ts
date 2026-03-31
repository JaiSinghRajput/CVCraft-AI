import dotenv from "dotenv";

dotenv.config();

const toInt = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
	port: toInt(process.env.PORT, 3001),
	redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
	openAiApiKey: process.env.OPENAI_API_KEY ?? "",
	openAiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
	openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
	githubToken: process.env.GITHUB_TOKEN ?? "",
	maxUploadMb: toInt(process.env.MAX_UPLOAD_MB, 6),
	rateLimitPoints: toInt(process.env.RATE_LIMIT_POINTS, 30),
	rateLimitDurationSec: toInt(process.env.RATE_LIMIT_DURATION_SEC, 60),
	databaseUrl: process.env.DATABASE_URL ?? "",
	clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
};
