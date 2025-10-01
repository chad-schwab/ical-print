# ical-print

Fetch an iCal/webcal subscription, filter events with a regex, and produce a printable HTML schedule.

## Requirements

- Node.js v24 (use nvm: `nvm use 24`)
- Internet access for fetching webcal/https URLs

## Instal

Install

```sh
npm install
```

Link

```sh
npm link
```

## Quick usage

```sh
npm run cli --  "webcal://www.mycalendar/xyz" --filter "Game" --output my-calendar.html

or

ical-print "webcal://www.mycalendar/xyz" --filter "Game" --output my-calendar.html
```

## Advanced Usage

```sh
npm run cli -- --help

or

ical-print --help
```
