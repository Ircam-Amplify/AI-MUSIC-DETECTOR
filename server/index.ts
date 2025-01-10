import 'dotenv/config';
import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { log } from "./vite";

// Environment variable validation and logging
const envGroups = {
  api: ['IRCAM_CLIENT_ID', 'IRCAM_CLIENT_SECRET'],
  database: ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE'],
  server: ['NODE_ENV', 'PORT']
};

function logEnvironmentStatus() {
  console.log('\n=== Environment Variables Status ===');

  // Log each group of variables
  for (const [group, vars] of Object.entries(envGroups)) {
    console.log(`\n${group.toUpperCase()} Configuration:`);
    console.log('─'.repeat(30));

    vars.forEach(varName => {
      const status = process.env[varName] 
        ? '✓ Set'
        : process.env.NODE_ENV === 'production' 
          ? '✗ MISSING (Required in production)'
          : '○ Not set';

      const padding = ' '.repeat(Math.max(0, 20 - varName.length));
      console.log(`${varName}${padding} │ ${status}`);
    });
  }

  // Additional production checks
  if (process.env.NODE_ENV === 'production') {
    console.log('\nProduction Environment Checks:');
    console.log('─'.repeat(30));
    const missingRequired = [...envGroups.api, ...envGroups.database]
      .filter(v => !process.env[v]);

    if (missingRequired.length > 0) {
      console.log('⚠️  Missing required variables:');
      missingRequired.forEach(v => console.log(`   - ${v}`));
      throw new Error('Missing required environment variables in production');
    } else {
      console.log('✓ All required variables are set');
    }
  }

  console.log('\n===================================\n');
}

// Log environment status at startup
logEnvironmentStatus();

// Initialize Express app
const app = express();

// CORS configuration
if (process.env.NODE_ENV === 'development') {
  app.use(cors({
    origin: ['http://localhost:5000', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
} else {
  // In production, only allow our own domain
  app.use(cors({
    origin: true, // This will reflect the request origin if it matches our domain
    credentials: true
  }));
}

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

  // Start server with configurable port
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`Server running on port ${PORT}`);
  });
})();