import type { Express } from "express";
import type { Server } from "http";
import { createServer } from "http";
import session from "express-session";
import MemoryStore from "memorystore";
import multer from "multer";
import axios from "axios";

// Types
interface AnalysisResult {
  isAi: boolean;
  confidence: number;
}

interface IRCAMResponse {
  job_infos: {
    job_status: string;
    report_info?: {
      report: {
        resultList: AnalysisResult[];
      };
    };
  };
}

// Constants
const MemoryStoreSession = MemoryStore(session);
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const POLLING_INTERVAL = 5000; // 5 seconds

// Utility functions
function logStep(step: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${step}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function registerRoutes(app: Express): Server {
  // Session configuration
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

  // Multer configuration
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only audio files are allowed.'));
      }
    }
  });

  // Routes
  app.get("/api/check-upload", (_req, res) => {
    res.json({ hasUploaded: false });
  });

  app.post("/api/upload", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();

    try {
      if (!req.file) {
        throw new Error("No file uploaded");
      }

      // Log file details
      logStep("Starting file upload", {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      });

      // Authentication
      const { id_token } = await getAuthToken();
      const headers = createHeaders(id_token, "application/json");

      // File handling
      const fileId = await createStorageLocation(headers);
      await uploadFileToStorage(req.file, fileId, headers);
      const iasUrl = await getIasUrl(fileId, headers);

      // Analysis
      const jobId = await startAIDetection(iasUrl, headers);
      const result = await pollForResults(jobId, headers);

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

  return createServer(app);
}

// Helper functions for API calls
async function getAuthToken() {
  logStep("Getting IRCAM auth token");

  const payload = {
    client_id: process.env.IRCAM_CLIENT_ID,
    client_secret: process.env.IRCAM_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "api" // Adding required scope parameter
  };

  try {
    const response = await axios.post("https://api.ircamamplify.io/oauth/token", payload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.data.id_token) {
      throw new Error('No id_token received in response');
    }

    logStep("Auth token received", { tokenReceived: true });
    return response.data;
  } catch (error: any) {
    console.error('Auth token error:', {
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
  }
}

function createHeaders(token: string, contentType: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
    Accept: "application/json"
  };
}

async function createStorageLocation(headers: any) {
  logStep("Creating storage location");
  const response = await axios.post(
    "https://storage.ircamamplify.io/manager/",
    {},
    { headers }
  );
  return response.data.id;
}

async function uploadFileToStorage(file: Express.Multer.File, fileId: string, headers: any) {
  logStep("Uploading file to storage");
  const uploadHeaders = { ...headers, "Content-Type": file.mimetype };
  await axios.put(
    `https://storage.ircamamplify.io/${fileId}/${file.originalname}`,
    file.buffer,
    { headers: uploadHeaders }
  );
}

async function getIasUrl(fileId: string, headers: any) {
  logStep("Getting IAS URL");
  const response = await axios.get(
    `https://storage.ircamamplify.io/manager/${fileId}`,
    { headers }
  );
  return response.data.ias;
}

async function startAIDetection(iasUrl: string, headers: any) {
  logStep("Starting AI detection");
  const response = await axios.post(
    "https://api.ircamamplify.io/aidetector/",
    { audioUrlList: [iasUrl] },
    { headers }
  );
  return response.data.id;
}

async function pollForResults(jobId: string, headers: any): Promise<AnalysisResult> {
  let attempts = 0;
  while (true) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));

    logStep(`Checking job status (attempt ${attempts})`);
    const response = await axios.get<IRCAMResponse>(
      `https://api.ircamamplify.io/aidetector/${jobId}`,
      { headers }
    );

    const status = response.data.job_infos.job_status;
    if (status === "success") {
      const result = response.data.job_infos.report_info!.report.resultList[0];
      logStep("Analysis complete", result);
      return result;
    }

    if (status === "error") {
      throw new Error("Processing failed");
    }
  }
}