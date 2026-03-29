import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3001);

const server = createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ service: "cvcraft-ai-server", status: "running" }));
});

server.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
});
