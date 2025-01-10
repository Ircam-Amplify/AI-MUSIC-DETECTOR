import { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, CheckCircle, XCircle, Loader2, PlayCircle, PauseCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { checkUploadStatus, uploadAudio, type AnalysisResponse, type UploadStatusResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import WaveSurfer from "wavesurfer.js";

export function Home() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const { data: uploadStatus } = useQuery<UploadStatusResponse>({
    queryKey: ["/api/check-upload"],
  });

  useEffect(() => {
    if (waveformRef.current && currentFile) {
      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4f46e5',
        progressColor: '#312e81',
        cursorWidth: 0,
        height: 80,
        normalize: true,
      });

      const fileUrl = URL.createObjectURL(currentFile);
      wavesurferRef.current.load(fileUrl);

      wavesurferRef.current.on('finish', () => {
        setIsPlaying(false);
      });

      return () => {
        URL.revokeObjectURL(fileUrl);
        wavesurferRef.current?.destroy();
      };
    }
  }, [currentFile]);

  const togglePlayPause = () => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.pause();
      } else {
        wavesurferRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: uploadAudio,
    onSuccess: (data) => {
      setIsUploading(false);
      setProgress(100);
      setAnalysisResult(data);
    },
    onError: (error: Error) => {
      setIsUploading(false);
      setProgress(0);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message,
      });
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length !== 1) {
      toast({
        variant: "destructive",
        title: "Invalid upload",
        description: "Please upload a single audio file",
      });
      return;
    }

    const file = acceptedFiles[0];
    if (!file.type.startsWith("audio/")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload an audio file",
      });
      return;
    }

    if (uploadStatus?.hasUploaded) {
      toast({
        variant: "destructive",
        title: "Upload limit reached",
        description: "You have reached the maximum number of uploads allowed",
      });
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setAnalysisResult(null);
    setCurrentFile(file);

    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 1000);

    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      clearInterval(interval);
    }
  }, [uploadMutation, toast, uploadStatus?.hasUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.ogg']
    },
    disabled: isUploading || uploadStatus?.hasUploaded,
    maxFiles: 1,
  });

  const resetAnalysis = () => {
    setAnalysisResult(null);
    setCurrentFile(null);
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-2xl font-bold mb-6">Audio Analysis</h1>

            {analysisResult ? (
              <div className="text-center p-6">
                <div className="mb-8">
                  <div className={cn(
                    "w-32 h-32 mx-auto rounded-full border-8 flex items-center justify-center transition-colors",
                    analysisResult.ISAI ? "border-red-500/20" : "border-green-500/20"
                  )}>
                    {analysisResult.ISAI ? (
                      <XCircle className="w-16 h-16 text-red-500 animate-in zoom-in duration-300" />
                    ) : (
                      <CheckCircle className="w-16 h-16 text-green-500 animate-in zoom-in duration-300" />
                    )}
                  </div>
                  <div className="mt-6">
                    <h2 className={cn(
                      "text-2xl font-bold mb-2",
                      analysisResult.ISAI ? "text-red-500" : "text-green-500"
                    )}>
                      {analysisResult.ISAI ? "AI Generated" : "Human Created"}
                    </h2>
                    <div className="relative mb-4">
                      <div className="text-4xl font-bold text-primary">
                        {analysisResult.confidence}%
                      </div>
                      <p className="text-sm text-gray-500 mt-1">Confidence Score</p>
                    </div>
                    {currentFile && (
                      <p className="text-sm text-gray-600 mb-4">
                        File: {currentFile.name}
                      </p>
                    )}
                  </div>
                </div>

                {currentFile && (
                  <div className="mb-6" ref={waveformRef} />
                )}

                <button
                  onClick={resetAnalysis}
                  className="mt-4 w-full px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
                >
                  Analyze Another File
                </button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-primary bg-primary/5" : "border-gray-300",
                  (isUploading || uploadStatus?.hasUploaded) && "cursor-not-allowed opacity-50"
                )}
              >
                <input {...getInputProps()} />
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="text-sm text-gray-600 mb-4">Processing your audio file...</p>
                    <Progress value={progress} className="h-2 w-full max-w-xs" />
                  </div>
                ) : uploadStatus?.hasUploaded ? (
                  <div className="text-center">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-sm text-gray-600">
                      You have reached the maximum number of uploads allowed
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-600">
                      {isDragActive
                        ? "Drop the audio file here"
                        : "Drag and drop an audio file, or click to select"}
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}