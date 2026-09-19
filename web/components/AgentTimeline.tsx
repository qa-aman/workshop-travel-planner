"use client";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { FONT_MONO } from "@/app/providers";
import { AGENT_IDS, type AgentId, type AgentStatus } from "@/lib/types";
import { useRunStore } from "@/store/run-store";

const LABEL: Record<AgentId, string> = {
  orchestrator: "Orchestrator",
  "destination-research": "Destination research",
  logistics: "Logistics",
  budget: "Budget",
  review: "Review",
};

const STRIPE: Record<AgentStatus, string> = {
  waiting: "#C7C9D1",
  running: "#E8A23D",
  revising: "#7A5FB5",
  done: "#3C7A5B",
  failed: "#BD4B2C",
};

const STATUS_TEXT: Record<AgentStatus, string> = {
  waiting: "#8A8D97",
  running: "#B0742A",
  revising: "#6A4FA0",
  done: "#3C7A5B",
  failed: "#BD4B2C",
};

function fmtArgs(args: Record<string, unknown>) {
  return Object.values(args)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .slice(0, 3)
    .map((v) => JSON.stringify(v))
    .join(", ");
}

export function AgentTimeline() {
  const agents = useRunStore((s) => s.agents);
  const itinerary = useRunStore((s) => s.itinerary);

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" },
      }}
    >
      {AGENT_IDS.map((id) => {
        const a = agents[id];
        const running = a.status === "running";
        const revising = a.status === "revising";
        return (
          <Card
            key={id}
            variant="outlined"
            sx={{
              position: "relative",
              overflow: "hidden",
              opacity: a.status === "waiting" ? 0.75 : 1,
              transition: "opacity 200ms ease",
              "&::before": {
                content: '""',
                position: "absolute",
                insetBlock: 0,
                insetInlineStart: 0,
                width: 4,
                bgcolor: revising ? "transparent" : STRIPE[a.status],
                backgroundImage: revising
                  ? `repeating-linear-gradient(to bottom, ${STRIPE.revising} 0 7px, transparent 7px 12px)`
                  : "none",
                animation: running
                  ? "pulse-stripe 1.8s ease-in-out infinite"
                  : revising
                    ? "pulse-stripe-double 2.6s ease-in-out infinite"
                    : "none",
                "@media (prefers-reduced-motion: reduce)": { animation: "none" },
              },
            }}
          >
            <CardContent sx={{ pl: 2.5 }}>
              <Stack spacing={0.25} sx={{ mb: 1.25 }}>
                <Typography variant="subtitle2">{LABEL[id]}</Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: FONT_MONO, color: STATUS_TEXT[a.status], letterSpacing: "0.02em" }}
                >
                  {a.status}
                </Typography>
              </Stack>

              {a.toolCalls.length > 0 && (
                <Stack spacing={0.4} sx={{ mb: a.summary.length > 0 ? 1.25 : 0 }}>
                  {a.toolCalls.map((c, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      component="div"
                      sx={{ fontFamily: FONT_MONO, color: "text.secondary", lineHeight: 1.5 }}
                    >
                      {c.tool}({fmtArgs(c.args)})
                    </Typography>
                  ))}
                </Stack>
              )}

              {a.summary.length > 0 && (
                <Stack spacing={0.5}>
                  {a.summary.map((l, i) => (
                    <Typography key={i} variant="body2">
                      {l}
                    </Typography>
                  ))}
                </Stack>
              )}

              {id === "review" && itinerary && (
                <Stack spacing={0.4} sx={{ mt: 1.25 }}>
                  {itinerary.review.checks.map((c) => (
                    <Typography
                      key={c.id}
                      variant="body2"
                      sx={{ fontFamily: FONT_MONO, color: c.pass ? "success.main" : "error.main" }}
                    >
                      {c.pass ? "PASS" : "FAIL"}: {c.label}
                    </Typography>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
