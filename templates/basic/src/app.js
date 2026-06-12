
import http from "http";
import Aether from "@aetherframework/middleware";

const { AetherPipeline } = Aether;
const pipeline = new AetherPipeline();

pipeline.use((ctx, next) => {
    if (ctx.url === "/") {
        return ctx.json({ message: 'Hello from Aether Framework!', success: true });
    }
});

const server = http.createServer(async (req, res) => {
  try {
    await pipeline.handle(req, res);
  } catch (err) {
    console.error("Pipeline Error:", err.message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        success: false,
        error: "Internal Server Error",
        message: err.message,
        timestamp: Date.now()
      }));
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AetherFramework Server running on http://localhost:${PORT}`);
});
