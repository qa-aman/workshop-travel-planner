"use client";
import { Button, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useRunStore } from "@/store/run-store";

const EXAMPLE = "Plan a 5-day trip to Japan. Tokyo + Kyoto. $3,000 budget. Love food and temples, hate crowds.";
const LAST_RUN_SLUG = "sample-japan";

const fieldSx = {
  "& .MuiInputLabel-root": { color: "rgba(246, 243, 234, 0.65)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#E8A23D" },
  "& .MuiOutlinedInput-root": {
    color: "#F6F3EA",
    "& fieldset": { borderColor: "rgba(246, 243, 234, 0.3)" },
    "&:hover fieldset": { borderColor: "rgba(246, 243, 234, 0.55)" },
    "&.Mui-focused fieldset": { borderColor: "#E8A23D" },
  },
};

export function RequestForm() {
  const [text, setText] = useState(EXAMPLE);
  const phase = useRunStore((s) => s.phase);
  const start = useRunStore((s) => s.start);
  const loadTrip = useRunStore((s) => s.loadTrip);
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <Stack spacing={2}>
      <TextField
        multiline
        minRows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        label="Your trip request"
        fullWidth
        sx={fieldSx}
      />
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
        <Button
          variant="contained"
          size="large"
          disabled={phase === "running"}
          onClick={() => void start(text)}
          sx={{
            alignSelf: "flex-start",
            bgcolor: "#E8A23D",
            color: "#152238",
            "&:hover": { bgcolor: "#D9922E" },
            "&.Mui-disabled": { bgcolor: "rgba(232, 162, 61, 0.35)", color: "rgba(21, 34, 56, 0.6)" },
          }}
        >
          {phase === "running" ? "Planning..." : "Plan my trip"}
        </Button>
        {isDev && (
          <Button
            variant="outlined"
            size="large"
            disabled={phase === "running"}
            onClick={() => void loadTrip(LAST_RUN_SLUG)}
            sx={{
              alignSelf: "flex-start",
              borderColor: "rgba(246, 243, 234, 0.4)",
              color: "#F6F3EA",
              "&:hover": { borderColor: "#F6F3EA", bgcolor: "rgba(246, 243, 234, 0.08)" },
            }}
          >
            Load last run (dev)
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
