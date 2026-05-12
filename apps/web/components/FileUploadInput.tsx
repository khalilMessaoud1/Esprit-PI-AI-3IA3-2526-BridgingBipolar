"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { resolveMediaUrl } from "../lib/mediaUrl";

type Props = {
  label?: string;
  /** Required unless `deferred` is true (pick file only; upload happens later). */
  onUpload?: (url: string) => void;
  accept?: string;
  preview?: string;
  className?: string;
  /** If true, only pick a file and show preview; parent uploads after auth (e.g. signup). */
  deferred?: boolean;
  onDeferredFile?: (file: File | null) => void;
  strings?: {
    uploading: string;
    clickToUpload: string;
    dragHint: string;
  };
};

export default function FileUploadInput({
  label,
  onUpload,
  accept = "image/*",
  preview,
  className,
  deferred = false,
  onDeferredFile,
  strings = {
    uploading: "Uploading…",
    clickToUpload: "Click to upload",
    dragHint: "or drag and drop"
  }
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blobRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(preview || "");

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (preview === undefined) return;
    if (preview === null || preview === "") {
      setPreviewUrl("");
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      return;
    }
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setPreviewUrl(preview);
  }, [preview]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    const objectUrl = URL.createObjectURL(file);
    blobRef.current = objectUrl;
    setPreviewUrl(objectUrl);

    if (deferred) {
      onDeferredFile?.(file);
      setUploading(false);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const token =
        typeof window !== "undefined" ? localStorage.getItem("bb_token") : null;

      const uploadResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/upload/file`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        }
      );

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(error || "Upload failed");
      }

      const { url } = await uploadResponse.json();
      onUpload?.(url);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload file. Please try again.");
      setPreviewUrl(preview || "");
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={clsx("flex w-full flex-col gap-2", className)}>
      {label && <label className="text-sm text-textSecondary">{label}</label>}

      {previewUrl && (
        <div className="relative mb-2 h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
          <img
            src={resolveMediaUrl(previewUrl)}
            alt="Preview"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={clsx(
          "rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm transition-colors",
          "hover:border-primary hover:bg-slate-50",
          uploading && "cursor-not-allowed opacity-50",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        )}
      >
        {uploading ? (
          <span className="text-textSecondary">{strings.uploading}</span>
        ) : (
          <>
            <p className="font-medium text-textPrimary">{strings.clickToUpload}</p>
            <p className="text-xs text-textSecondary">{strings.dragHint}</p>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        disabled={uploading}
        className="hidden"
      />
    </div>
  );
}
