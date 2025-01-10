import express from "express";
import { registerRoutes } from "./routes";
import { log } from "./vite";

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let responseBody: Record<string, any> | undefined;

  // Capture JSON response
  const originalResJson = res.json;
  res.json = function (body, ...args) {
    responseBody = body;
    return originalResJson.apply(res, [body, ...args]);
  };

  // Log on response finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (responseBody) {
        logLine += ` :: ${JSON.stringify(responseBody)}`;
      }
      log(logLine.length > 80 ? logLine.slice(0, 79) + "…" : logLine);
    }
  });

  next();
});

// Initialize server
(async () => {
  const server = registerRoutes(app);

  // Error handling middleware
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // Setup development environment
  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  }

  // Start server
  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
