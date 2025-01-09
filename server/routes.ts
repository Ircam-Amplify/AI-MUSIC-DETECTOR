import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import multer from "multer";
import { db } from "@db";
import { uploads } from "@db/schema";
import axios from "axios";
import { eq, count } from "drizzle-orm";

const MemoryStoreSession = MemoryStore(session);

function logStep(step: string, data?: any) {
  console.log(`[${new Date().toISOString()}] ${step}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Maximum uploads per session in production
const MAX_UPLOADS_PER_SESSION = 5;

export function registerRoutes(app: Express): Server {
  // Session middleware
  app.use(
    session({
      secret: "audio-analysis-secret",
      resave: false,
      saveUninitialized: true,
      store: new MemoryStoreSession({
        checkPeriod: 86400000 // 24 hours
      }),
      cookie: { secure: process.env.NODE_ENV === "production" }
    })
  );

  // File upload configuration
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (_req, file, cb) => {
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only audio files are allowed.'));
      }
    }
  });

  // Check if user has already uploaded
  app.get("/api/check-upload", async (req, res) => {
    try {
      const sessionId = req.session.id;
      logStep("Checking upload status", { sessionId });

      // Count user's uploads
      const uploadCount = await db.select({
        value: count()
      }).from(uploads)
        .where(eq(uploads.sessionId, sessionId))
        .execute()
        .then(result => result[0]?.value ?? 0);

      // In development, unlimited uploads
      const uploadsRemaining = process.env.NODE_ENV === 'production'
        ? Math.max(0, MAX_UPLOADS_PER_SESSION - uploadCount)
        : null;

      const hasUploaded = process.env.NODE_ENV === 'production' && uploadCount >= MAX_UPLOADS_PER_SESSION;

      logStep("Upload status result", { hasUploaded, uploadsRemaining });
      res.json({ hasUploaded, uploadsRemaining });
    } catch (error) {
      console.error('Check upload error:', error);
      res.status(500).json({ error: 'Failed to check upload status' });
    }
  });

  // Handle file upload and IRCAM API integration
  app.post("/api/upload", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) {
        throw new Error("No file uploaded");
      }

      const sessionId = req.session.id;
      const ipAddress = req.ip;

      // In production, check upload limit
      if (process.env.NODE_ENV === 'production') {
        const uploadCount = await db.select({
          value: count()
        }).from(uploads)
          .where(eq(uploads.sessionId, sessionId))
          .execute()
          .then(result => result[0]?.value ?? 0);

        if (uploadCount >= MAX_UPLOADS_PER_SESSION) {
          throw new Error(`Upload limit reached (${MAX_UPLOADS_PER_SESSION} files per session)`);
        }
      }

      logStep("Starting file upload", {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        sessionId
      });

      // Get auth token
      logStep("Getting IRCAM auth token");
      const authResponse = await axios.post("https://api.ircamamplify.io/oauth/token", {
        client_id: process.env.IRCAM_CLIENT_ID,
        client_secret: process.env.IRCAM_CLIENT_SECRET,
        grant_type: "client_credentials"
      });

      const idToken = authResponse.data.id_token;
      logStep("Received auth token");

      const headers = {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      };

      // Create storage location
      logStep("Creating storage location");
      const storageResponse = await axios.post(
        "https://storage.ircamamplify.io/manager/",
        {},
        { headers }
      );
      const fileId = storageResponse.data.id;
      logStep("Storage location created", { fileId });

      // Upload file
      const uploadHeaders = {
        ...headers,
        "Content-Type": req.file.mimetype
      };

      logStep("Uploading file to storage");
      await axios.put(
        `https://storage.ircamamplify.io/${fileId}/${req.file.originalname}`,
        req.file.buffer,
        { headers: uploadHeaders }
      );
      logStep("File uploaded successfully");

      // Get IAS URL
      logStep("Getting IAS URL");
      const iasResponse = await axios.get(
        `https://storage.ircamamplify.io/manager/${fileId}`,
        { headers }
      );
      const iasUrl = iasResponse.data.ias;
      logStep("Received IAS URL", { iasUrl });

      // Process with AI detector
      logStep("Starting AI detection");
      const processResponse = await axios.post(
        "https://api.ircamamplify.io/aidetector/",
        { audioUrlList: [iasUrl] },
        { headers }
      );
      const jobId = processResponse.data.id;
      logStep("AI detection job created", { jobId });

      // Poll for results
      let result;
      let attempts = 0;
      while (true) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));

        logStep(`Checking job status (attempt ${attempts})`);
        const statusResponse = await axios.get(
          `https://api.ircamamplify.io/aidetector/${jobId}`,
          { headers }
        );

        const status = statusResponse.data.job_infos.job_status;
        logStep("Job status", { status, attempt: attempts });

        if (status === "success") {
          const report = statusResponse.data.job_infos.report_info.report;
          result = report.resultList[0]; // Get the first result since we only upload one file
          logStep("Analysis complete", result);
          break;
        } else if (status === "error") {
          throw new Error("Processing failed");
        }
      }

      // Save to database
      logStep("Saving to database");
      await db.insert(uploads).values([{
        sessionId,
        ipAddress,
        fileName: req.file.originalname,
        fileId,
        isAi: result.isAi,
        confidenceScore: String(result.confidence),
        createdAt: new Date()
      }]);
      logStep("Database entry created");

      // Get updated upload count
      const newUploadCount = await db.select({
        value: count()
      }).from(uploads)
        .where(eq(uploads.sessionId, sessionId))
        .execute()
        .then(result => result[0]?.value ?? 0);

      const uploadsRemaining = process.env.NODE_ENV === 'production'
        ? Math.max(0, MAX_UPLOADS_PER_SESSION - newUploadCount)
        : null;

      res.json({
        ISAI: result.isAi,
        confidence: result.confidence,
        uploadsRemaining
      });
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('Upload error:', {
        error: error.message,
        processingTime: `${processingTime}ms`,
        response: error.response?.data
      });
      res.status(500).json({
        error: error.message || 'Upload failed',
        details: error.response?.data
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}