const blockedPatterns: RegExp[] = [
	/ignore\s+previous\s+instructions/gi,
	/system\s+prompt/gi,
	/developer\s+message/gi,
	/<script/gi,
	/```/g,
];

export const sanitizeUserInput = (input: string): string => {
	let output = input.trim();
	for (const pattern of blockedPatterns) {
		output = output.replace(pattern, " ");
	}
	return output.replace(/\s+/g, " ").slice(0, 12000);
};
