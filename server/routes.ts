import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import multer from "multer";
import axios from "axios";
const MemoryStoreSession = MemoryStore(session);

function logStep(step: string, data?: any) {
  console.log(`[${new Date().toISOString()}] ${step}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

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
  app.get("/api/check-upload", async (_req, res) => {
    res.json({ hasUploaded: false });
  });

  // Handle file upload and IRCAM API integration
  app.post("/api/upload", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) {
        throw new Error("No file uploaded");
      }

      logStep("Starting file upload", {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      });

      // Get auth token
      logStep("Getting IRCAM auth token");
      const authResponse = await axios.post("https://api.ircamamplify.io/oauth/token", {
        client_id: process.env.IRCAM_AMPLIFY_CLIENT_ID,
        client_secret: process.env.IRCAM_AMPLIFY_CLIENT_SECRET,
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

      res.json({
        ISAI: result.isAi,
        confidence: result.confidence
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