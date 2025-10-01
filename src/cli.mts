#!/usr/bin/env node
import { Command } from "commander";
import ICAL from "ical.js";
import fs from "fs/promises";
import path from "path";
import process from "process";
import { formatInTimeZone } from "date-fns-tz";

const program = new Command();

type Opts = {
  output: string;
  filter?: string;
  invert?: boolean;
  caseSensitive?: boolean;
  title?: string;
  includeSummary?: boolean;
  includeMeta?: boolean;
  includeDesc?: boolean;
  debug?: boolean;
};

type EventItem = {
  uid?: string;
  summary: string;
  description: string;
  location: string;
  start: Date | null;
  end: Date | null;
};

program
  .name("ical-print")
  .description(
    "Fetch an iCal/webcal URL, filter events by regex, and write a printable HTML file."
  )
  .argument("iCal subscription URL (webcal:// or https://)")
  .option(
    "-o, --output <file>",
    "Output HTML file in the outputs/ directory",
    "calendar.html"
  )
  .option(
    "-f, --filter <pattern>",
    "Regex pattern to filter events (applies to summary, description, location)"
  )
  .option("--invert", "Invert filter (exclude matched events)", false)
  .option(
    "--case-sensitive",
    "Make regex case-sensitive (default is case-insensitive)",
    false
  )
  .option("--title <title>", "Title for printed document", "Calendar")
  .option("--include-summary", "Include event summary", false)
  .option("--include-meta", "Include event metadata (location, time)", true)
  .option("--include-desc", "Include event description", false)
  .option("--debug", "Enable debug logging", false)
  .action(async (url: string, opts: Opts) => {
    if (!opts.debug) {
      console.debug = () => {};
    }
    console.debug("Starting ical-print", { url, opts });

    const icalText = await fetchICal(url);
    console.debug("Fetched iCal", { icalText });

    const events = parseICal(icalText);
    console.debug("Parsed events", { count: events.length });

    const matcher = opts.filter
      ? makeMatcher(opts.filter, opts.caseSensitive)
      : null;

    const filtered = applyFilter(events, matcher, opts.invert);
    console.debug("Filtered events", {
      count: filtered.length,
      matcher,
      invert: opts.invert,
    });

    const sorted = sortEvents(filtered);
    console.debug("Sorted events");

    const html = renderHTML(opts.title || "Calendar", sorted, opts);
    console.debug("Rendered HTML");

    const outPath = path.resolve(
      `${process.cwd()}/output`,
      opts.output || "calendar.html"
    );
    await fs.writeFile(outPath, html, "utf8");
    if (opts.debug) {
      console.debug();
    }
    console.debug(
      `Wrote ${filtered.length} of ${events.length} events from ${url}`
    );
    console.log(outPath);
  })
  .parse(process.argv);

function normalizeUrl(url?: string) {
  if (!url) return url;
  return url.replace(/^webcal:/i, "https:");
}

async function fetchICal(url: string) {
  const normalized = normalizeUrl(url) as string;
  const res = await fetch(normalized);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${normalized}: ${res.status} ${res.statusText}`
    );
  }
  return await res.text();
}

function parseICal(icalText: string): EventItem[] {
  const jcal = ICAL.parse(icalText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent") || [];
  const events: EventItem[] = vevents
    .map((v: any) => {
      try {
        const ev = new ICAL.Event(v);
        return {
          uid: ev.uid,
          summary: ev.summary || "",
          description: ev.description || "",
          location: ev.location || "",
          start: ev.startDate ? ev.startDate.toJSDate() : null,
          end: ev.endDate ? ev.endDate.toJSDate() : null,
        } as EventItem;
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean) as EventItem[];
  return events;
}

function makeMatcher(pattern?: string, caseSensitive?: boolean) {
  if (!pattern) return null;
  const flags = caseSensitive ? undefined : "i";
  return new RegExp(pattern, flags);
}

function applyFilter(
  events: EventItem[],
  matcher: RegExp | null,
  invert?: boolean
) {
  if (!matcher) return events;
  return events.filter((e) => {
    const hay = `${e.summary}\n${e.description}\n${e.location}`;
    const matched = matcher.test(hay);
    return invert ? !matched : matched;
  });
}

/**
 * Sort events by start date ascending, then summary in place
 * @param events Event items to sort
 * @returns
 */
function sortEvents(events: EventItem[]) {
  return events.sort((a, b) => {
    if (!a.start && b.start) return 1;
    if (a.start && !b.start) return -1;
    if (a.start && b.start) return a.start.valueOf() - b.start.valueOf();
    return (a.summary || "").localeCompare(b.summary || "");
  });
}

const currentTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

function groupByMonth(events: EventItem[]) {
  events.sort((a, b) => {
    const ta = a.start ? a.start.getTime() : Number.POSITIVE_INFINITY;
    const tb = b.start ? b.start.getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return (a.summary || "").localeCompare(b.summary || "");
  });

  const groups: { groupKey: string; events: EventItem[] }[] = [];
  events.forEach((ev) => {
    const groupKey = ev.start
      ? formatInTimeZone(ev.start, currentTimeZone, "MMMM yyyy")
      : "Unknown";
    let currentGroup = groups.at(-1);
    if (!currentGroup || currentGroup.groupKey !== groupKey) {
      currentGroup = { groupKey: groupKey, events: [] };
      groups.push(currentGroup);
    }
    currentGroup.events.push(ev);
  });

  return groups;
}

function formatTime(date: Date | null) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderHTML(title: string, events: EventItem[], opts: Opts) {
  const grouped = groupByMonth(events);
  const css = `
    body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin: 1rem; color: #111; }
    h1 { text-align: center; margin-bottom: 0.5rem; }
    .group { margin-top: 1rem; page-break-inside: avoid; }
    .group > h2 { margin-block-start: 1.2rem; margin-block-end: 0.4rem; }
    .date { page-break-inside: avoid; margin-block-start: 0.4rem; margin-block-end: 0.2rem; }
    .event { border-bottom: 1px solid #ddd; padding: 0.3rem 0; page-break-inside: avoid; }
    .summary { font-weight: 600; }
    .meta { color: #555; font-size: 0.95rem; }
    .hidden { display: none; }
    @media print {
      body { margin: 0.4in; }
      .event { page-break-inside: avoid; }
    }
  `;

  const bodyHtml = grouped
    .map((g) => {
      const eventsHtml = g.events
        .map((ev) => {
          const start = ev.start ? formatTime(ev.start) : "";
          const end = ev.end ? formatTime(ev.end) : "";
          const timeRange =
            start || end ? `${start}${end ? " – " + end : ""}` : "";
          return `

        <div class="event">
           <h3 class="date">${
             ev.start
               ? formatInTimeZone(
                   ev.start,
                   currentTimeZone,
                   "EEEE, MMMM d, yyyy hh:mm a"
                 )
               : "?"
           }</h3>
          <div class="summary ${
            opts.includeSummary ? "" : "hidden"
          }">${escapeHtml(ev.summary)}</div>
          <div class="meta ${opts.includeMeta ? "" : "hidden"}">${escapeHtml(
            ev.location
          )} ${timeRange ? " • " + timeRange : ""}</div>
          ${
            ev.description
              ? `<div class="desc ${
                  opts.includeDesc ? "" : "hidden"
                }">${escapeHtml(ev.description)}</div>`
              : ""
          }
        </div>
      `;
        })
        .join("\n");
      return `<section class="group"><h2>${escapeHtml(
        g.groupKey
      )}</h2>${eventsHtml}</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${css}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
