# Notify

Notify is a collaborative study tool built for university classes. Students pool their learning materials — lecture notes, PDFs, recordings, YouTube videos, articles — and Notify automatically extracts the text from each one and compiles everything into a single master document per topic. The idea is that a whole class studying together produces better study material than any one person alone.

## Background

The original version was built during my first year of university as a side project to solve a real problem: everyone in a class has different notes and resources, but there was no good way to combine them. That MVP was presented at the Canadian Tech Summit. This repository is the production rewrite — rebuilt from scratch with a proper architecture, background job pipeline, and role-based access controls.

## How it works

1. **Classes** — A class has a join code. Members have one of four roles: owner, admin, contributor, or viewer. Every permission in the system (who can upload, delete, compile, kick, etc.) is configurable per class.

2. **Topics** — Each class has topics (e.g. "Midterm 1", "Chapter 4"). Topics are the unit of organisation.

3. **Collection** — Members contribute sources to a topic's collection. Sources can be:
   - PDFs, text files, markdown files
   - Images (handwriting OCR — coming soon)
   - Audio recordings (speech-to-text — coming soon)
   - YouTube videos (transcript extraction)
   - Web articles (scraped)
   - Word documents (.docx — coming soon)
   - Public Google Docs / Google Slides (coming soon)

4. **Extraction** — When a source is added, a Temporal workflow kicks off in the background to extract its text. Each source shows a processing status and can be inspected, edited, or re-extracted once done.

5. **Compilation** — Once sources are ready, the collection is compiled into a master document for the topic. Every ready source is included.

## Tech stack

- **Next.js 16** (App Router, Server Actions)
- **PostgreSQL** + **Drizzle ORM**
- **Temporal** — durable workflow engine for the extraction pipeline
- **AWS S3** — file storage
- **better-auth** — authentication

## Development

```bash
npm install
npm run dev
```

Requires a PostgreSQL database, AWS S3 bucket, and a running Temporal server. Copy `.env.example` to `.env.local` and fill in the values.
