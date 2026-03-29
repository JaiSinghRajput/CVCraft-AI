import { RateLimiterMemory } from "rate-limiter-flexible";
import type { NextFunction, Request, Response } from "express";

import { env } from "../../lib/env";

const limiter = new RateLimiterMemory({
	points: env.rateLimitPoints,
	duration: env.rateLimitDurationSec,
});

export const rateLimitMiddleware = async (
	req: Request,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	try {
		const key = req.ip ?? "anonymous";
		await limiter.consume(key);
		next();
	} catch {
		res.status(429).json({
			error: "Too many requests",
			message: "Rate limit exceeded. Please try again shortly.",
		});
	}
};
