import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Download, Trash2, Loader2 } from "lucide-react";
import { uploadFile } from "@/services/SupabaseService";
import { toast } from "sonner";

export default function FileUploadButton({
  fileUrl,
  onFileUpload,
  onFileDelete,
  buttonSize = "sm",
  label = "Upload File",
  isLoading = false,
  disabled = false,
}) {
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    try {
      const uploadedFile = await uploadFile(file);
      onFileUpload(uploadedFile.file_url);
      toast.success("File uploaded successfully");
    } catch (err) {
      toast.error("Failed to upload file");
    }
  };

  const handleDownload = () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank");
    }
  };

  return (
    <div className="flex gap-1 items-center">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileSelect}
        className="hidden"
      />
      {!fileUrl ? (
        <Button
          size={buttonSize}
          variant="outline"
          className="gap-1 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || disabled}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {label}
        </Button>
      ) : (
        <>
          <Button
            size={buttonSize}
            variant="outline"
            className="gap-1 text-xs"
            onClick={handleDownload}
            disabled={disabled}
          >
            <Download className="w-3 h-3" /> Download
          </Button>
          <Button
            size={buttonSize}
            variant="ghost"
            className="gap-1 text-xs text-destructive hover:text-destructive"
            onClick={() => onFileDelete()}
            disabled={disabled}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </>
      )}
    </div>
  );
}