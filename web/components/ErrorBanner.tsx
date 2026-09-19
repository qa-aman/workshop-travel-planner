"use client";
import { Alert } from "@mui/material";
import { useRunStore } from "@/store/run-store";

export function ErrorBanner() {
  const phase = useRunStore((s) => s.phase);
  const error = useRunStore((s) => s.error);

  if (phase !== "error" || !error) return null;

  return (
    <Alert severity="error" variant="outlined" sx={{ mb: 3, borderColor: "error.main", color: "error.main" }}>
      {error}
    </Alert>
  );
}
