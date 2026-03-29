import { PrismaClient } from "@prisma/client";

declare global {
	// eslint-disable-next-line no-var
	var __cvcraftPrisma__: PrismaClient | undefined;
}

const createClient = (): PrismaClient =>
	new PrismaClient({
		log: ["warn", "error"],
	});

export const prisma = globalThis.__cvcraftPrisma__ ?? createClient();

if (process.env.NODE_ENV !== "production") {
	globalThis.__cvcraftPrisma__ = prisma;
}
