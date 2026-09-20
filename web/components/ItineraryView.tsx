"use client";
import { Alert, Box, Card, CardContent, Chip, Divider, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { Slot } from "@/lib/types";
import { useRunStore } from "@/store/run-store";
import { FONT_MONO } from "@/app/providers";

const usd = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);

const SOURCE_COLOR: Record<NonNullable<Slot["source"]>, string> = {
  tool: "#5B6270",
  seed: "#5B6270",
  estimate: "#E8A23D",
  "could not verify": "#BD4B2C",
};

function SourceChip({ source }: { source?: Slot["source"] }) {
  if (!source) return null;
  const color = SOURCE_COLOR[source];
  return (
    <Chip
      size="small"
      label={source}
      sx={{
        fontFamily: FONT_MONO,
        fontSize: "0.7rem",
        height: 20,
        color,
        bgcolor: "transparent",
        border: `1px solid ${color}`,
      }}
    />
  );
}

export function ItineraryView() {
  const it = useRunStore((s) => s.itinerary);
  if (!it) return null;

  const over = !it.budget.within_budget;
  const headroomUsd = it.budget.limit_usd - it.budget.total_usd;
  const showHeadroom = !over && it.budget.total_usd < 0.75 * it.budget.limit_usd;
  const headroomPct = showHeadroom ? Math.round((headroomUsd / it.budget.limit_usd) * 100) : 0;

  return (
    <Stack spacing={4} sx={{ mt: 1 }}>
      <Box>
        <Typography variant="h5" component="h2">
          {it.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Generated on {it.generated_on}. Budget {usd(it.brief.budget_usd)}. Likes: {it.brief.likes.join(", ")}.
          Avoids: {it.brief.avoids.join(", ")}.
        </Typography>
      </Box>

      {it.warnings && it.warnings.length > 0 && (
        <Alert severity="warning">
          <Stack spacing={0.5}>
            {it.warnings.map((w, i) => (
              <Typography key={i} variant="body2">
                {i + 1}. {w}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Where you will stay
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
          {it.stays.map((s) => (
            <Card key={s.city} variant="outlined">
              <CardContent>
                <Typography variant="subtitle1">
                  {s.city}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    {s.nights} nights, {s.area}
                  </Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {s.why}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Stack spacing={0.5}>
                  {s.examples.map((e, i) => (
                    <Typography key={i} variant="body2">
                      {e.url ? (
                        <Link href={e.url} target="_blank" rel="noopener noreferrer">
                          {e.name}
                        </Link>
                      ) : (
                        e.name
                      )}
                      {e.rating != null && (
                        <Typography component="span" variant="caption" sx={{ fontFamily: FONT_MONO, color: "text.secondary", ml: 1 }}>
                          {e.rating.toFixed(1)}
                        </Typography>
                      )}
                    </Typography>
                  ))}
                </Stack>
                {s.est_nightly_usd != null && (
                  <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: "text.secondary", display: "block", mt: 1 }}>
                    about {usd(s.est_nightly_usd)} per night, estimate
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {it.intercity.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            Between cities
          </Typography>
          <Stack spacing={1}>
            {it.intercity.map((r, i) => (
              <Card key={i} variant="outlined">
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ fontFamily: FONT_MONO }}>
                      {r.from} to {r.to}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {r.mode}
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: FONT_MONO, color: "text.secondary" }}>
                      {r.duration_min} min
                      {r.fare_usd != null ? `, about ${usd(r.fare_usd)}` : ""}
                    </Typography>
                    <Chip
                      size="small"
                      label={r.source}
                      sx={{ fontFamily: FONT_MONO, fontSize: "0.7rem", height: 20, color: "#5B6270", bgcolor: "transparent", border: "1px solid #5B6270" }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Day by day
        </Typography>
        <Stack spacing={2}>
          {it.days.map((d) => (
            <Card key={d.day} variant="outlined">
              <CardContent>
                <Typography variant="h6" component="h3">
                  Day {d.day}: {d.city}, {d.area}
                  {d.date && (
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1, fontFamily: FONT_MONO }}>
                      {d.date}
                    </Typography>
                  )}
                </Typography>
                <Divider sx={{ my: 1.5 }} />
                <Stack spacing={1.5}>
                  {d.slots.map((s, i) => (
                    <Stack key={i} direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                      <Typography
                        variant="caption"
                        sx={{ fontFamily: FONT_MONO, color: "text.secondary", minWidth: 76, pt: 0.25, letterSpacing: "0.02em" }}
                      >
                        {s.when}
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          <Typography variant="body1">{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.kind}
                            {s.transit_min_from_prev != null ? `, ${s.transit_min_from_prev} min from previous` : ""}
                          </Typography>
                          <SourceChip source={s.source} />
                        </Stack>
                        {s.why && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                            {s.why}
                          </Typography>
                        )}
                        <Typography variant="body2" sx={{ mt: 0.25 }}>
                          Crowds: {s.crowd_tactic}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontFamily: FONT_MONO, whiteSpace: "nowrap" }}>
                        {usd(s.est_cost_usd)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            How we handled crowds
          </Typography>
          <Stack spacing={0.75}>
            {it.crowd_strategy.map((c, i) => (
              <Typography key={i} variant="body2">
                {i + 1}. {c}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Budget
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell align="right">USD</TableCell>
                <TableCell>Basis</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {it.budget.lines.map((l) => (
                <TableRow key={l.category}>
                  <TableCell sx={{ textTransform: "capitalize" }}>{l.category}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: FONT_MONO }}>
                    {usd(l.usd)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {l.basis}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <Typography variant="subtitle2">Total</Typography>
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ fontFamily: FONT_MONO, color: over ? "error.main" : "success.main", fontWeight: 700 }}
                >
                  {usd(it.budget.total_usd)}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    vs limit {usd(it.budget.limit_usd)}
                    {over ? `, over by ${usd(it.budget.total_usd - it.budget.limit_usd)}` : ""}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {showHeadroom && (
            <Typography variant="body2" sx={{ mt: 1, color: "success.main", fontFamily: FONT_MONO }}>
              Under budget by {usd(headroomUsd)}, about {headroomPct}% headroom
            </Typography>
          )}
          {over && it.budget.alternatives && it.budget.alternatives.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Ways to bring it under budget:
              </Typography>
              <Stack spacing={0.5}>
                {it.budget.alternatives.map((a, i) => (
                  <Typography key={i} variant="body2">
                    {i + 1}. {a}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          {it.budget.fx && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block", fontFamily: FONT_MONO }}>
              {it.budget.fx.rate === null
                ? "FX could not verify"
                : `1 USD = ${it.budget.fx.rate} ${it.budget.fx.currency ?? "could not verify"} on ${it.budget.fx.date}`}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
