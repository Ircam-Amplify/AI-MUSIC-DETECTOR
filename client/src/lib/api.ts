import axios from "axios";

export type UploadStatusResponse = {
  hasUploaded: boolean;
  uploadsRemaining: number | null;
};

export type AnalysisResponse = {
  ISAI: boolean;
  confidence: number;
  uploadsRemaining: number | null;
};

export async function checkUploadStatus(): Promise<UploadStatusResponse> {
  const response = await axios.get("/api/check-upload");
  return response.data;
}

export async function uploadAudio(file: File): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("audio", file);

  const response = await axios.post("/api/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}