"use client";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useRunStore } from "@/store/run-store";

export function ReviseForm() {
  const [text, setText] = useState("");
  const slug = useRunStore((s) => s.slug);
  const phase = useRunStore((s) => s.phase);
  const revise = useRunStore((s) => s.revise);

  if (!slug) return null;

  return (
    <Stack spacing={1.5} sx={{ mt: 4, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <Typography variant="subtitle2">Revise this trip</Typography>
      <Typography variant="body2" color="text.secondary">
        Dates changed, ending early, or extending the trip. Describe the change, the same slug ({slug}) gets updated in place.
      </Typography>
      <TextField
        multiline
        minRows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. push the trip back by a week"
        fullWidth
      />
      <Button
        variant="contained"
        disabled={phase === "running" || text.trim().length < 5}
        onClick={() => void revise(slug, text)}
        sx={{ alignSelf: "flex-start" }}
      >
        {phase === "running" ? "Revising..." : "Revise trip"}
      </Button>
      {phase === "error" && <Alert severity="error">Revision failed, see the agent timeline above.</Alert>}
    </Stack>
  );
}
