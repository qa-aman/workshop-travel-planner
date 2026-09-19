"use client";
import { Box, Container, Stack, Typography } from "@mui/material";
import { AgentTimeline } from "@/components/AgentTimeline";
import { RequestForm } from "@/components/RequestForm";

export default function Page() {
  return (
    <>
      <Box sx={{ bgcolor: "#152238", color: "#F6F3EA" }}>
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Typography variant="h4" component="h1" sx={{ color: "#F6F3EA" }}>
                AI Travel Planner
              </Typography>
              <Typography variant="body1" sx={{ color: "rgba(246, 243, 234, 0.7)", maxWidth: 560 }}>
                Five agents plan a trip together. Describe where you want to go and watch each one
                work.
              </Typography>
            </Stack>
            <RequestForm />
          </Stack>
        </Container>
      </Box>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
        <AgentTimeline />
      </Container>
    </>
  );
}
