# Notify

Notify is a collaborative study tool built for university classes. Students pool their learning materials — lecture notes, PDFs, recordings, YouTube videos, articles — and Notify automatically extracts the text from each one and compiles everything into a single master document per topic. The idea is that a whole class studying together produces better study material than any one person alone.

## Why it works

University studying has a fundamental coordination problem. Every student in the same lecture takes different notes, records from different seats, catches different things, and misses different points — but they're all trying to learn the same material. Notify turns that fragmented effort into something shared.

**For students:**

- **Miss a class?** Your classmates' notes, recordings, and slides are already in the collection. You're not starting from scratch or texting five people.
- **Sitting in the back?** Audio quality drops fast with distance. Students closer to the front can record on behalf of the whole class — everyone benefits from the best recording in the room, not just whoever sat closest.
- **Stop scrambling, start listening.** When you know the class is recording and uploading, you can actually pay attention in lecture instead of racing to write everything down. The notes get made collectively.
- **Reliable study material before exams.** The master document is compiled from every source the class contributed — no gaps from the one session someone's notes got thin, no conflicting information left unresolved.
- **Everything in one place.** PDFs, lecture slides, YouTube videos, recorded audio, handwritten notes, web readings — all extracted, all searchable, all compiled into a single document per topic.
- **Can't write fast enough?** Some people follow lectures fine but fall behind the moment they have to write. They can listen fully and rely on classmates who write well — and vice versa.
- **Different sources covering the same concept differently.** One student uploads the professor's slides, another uploads a YouTube video that explains it better, another adds their handwritten summary. The compiler draws from all of them. No single source is perfect; together they fill each other's gaps.
- **Group projects and labs.** When a lab group splits tasks, everyone's findings get pooled into one document. No more chasing teammates for their section the night before it's due.
- **Two sections, one class.** If a course runs multiple sections — whether taught by the same professor or different ones — both sections can share a Notify class. If one professor explains the material better than the other, everyone benefits from the better explanation regardless of which section they're enrolled in.
- **Catching what slides miss.** Professors often say the most useful things off-script — "this is exactly what I'm putting on the exam" — and it never makes it into anyone's written notes. Recordings catch it.
- **International students and non-native speakers.** Following a fast lecture in a second language is exhausting. A clean compiled transcript after the fact is a real equalizer.
- **Students with disabilities.** Students who are hard of hearing, have ADHD, or have conditions that affect note-taking benefit from the class's collective record without having to self-identify or request special accommodations.
- **Revisiting old topics.** When exam season arrives and week two's content suddenly matters again, the master document is already there. No digging through four different notebooks from three months ago.
- **Drops right into how students already organise.** Classes naturally form Discord servers, group chats, and study groups. Notify's short join code is designed for exactly this — drop it in the server and everyone's in. No email invites, no admin approval, no friction.

**For professors:**

- Encourages active participation and peer learning without any extra work on their end.
- Students who engage with the material collaboratively retain more.
- The class naturally produces a shared record of the course — useful when students have questions about what was covered.

## Background

The original version was built during my first year of university as a side project to solve a real problem: everyone in a class has different notes and resources, but there was no good way to combine them. That MVP was presented at the Canadian Tech Summit. This repository is the production rewrite — rebuilt from scratch with a proper architecture, background job pipeline, and role-based access controls.

## How it works

1. **Classes** — A class has a join code. Members have one of four roles: owner, admin, contributor, or viewer. Every permission in the system (who can upload, delete, compile, kick, ban, etc.) is configurable per class. The owner can transfer ownership to another member, and can kick, ban, or invite members by email.

2. **Topics** — Each class has topics (e.g. "Midterm 1", "Chapter 4"). Topics are the unit of organisation.

3. **Collection** — Members contribute sources to a topic's collection. Sources can be:
   - PDFs, text files, markdown files
   - Images (handwriting OCR via Mistral)
   - Audio recordings (speech-to-text via Mistral)
   - YouTube videos (transcript extraction)
   - Web articles (scraped)
   - Word documents (.docx)

   Each source shows a processing status. Extracted text can be manually edited. Sources can be pinned as a "source of truth" — pinned sources are always prioritised by the compiler and trusted over conflicting information from unpinned ones.

4. **Extraction** — When a source is added, a Temporal workflow kicks off in the background to extract its text. Each source shows a processing status and can be re-extracted once done.

5. **Compilation** — Once sources are ready, the collection is compiled into a master document by Gemini. Compilation is configurable:
   - **Output type** — prose, bullet points, or both
   - **Depth** — concise, standard, or detailed
   - **Conflict resolution** — trust pinned sources, trust the majority, or flag all conflicts
   - **Fact checking** — none, flag suspicious claims, or replace them
   - **Inline sources** — optionally attribute each claim to its source

   Compilation is incremental by default — only new sources are merged into the existing document rather than recompiling everything from scratch. The last three compiled documents are kept per topic. Master documents can be manually edited after compilation and exported as a PDF (rendered via Puppeteer).

6. **Notifications** — Members receive in-app and email notifications for: new master documents, role changes, kicks, bans, class invites, and digest summaries. Every notification type can be toggled per class or globally.

7. **Activity log** — Every class and topic has a full audit log: uploads, compilations, role changes, settings edits, kicks, bans, and more. Logs older than four months are automatically pruned.

## External APIs

| Service                                | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| **Google Gemini** (`gemini-2.5-flash`) | Compiles source text into master documents           |
| **Mistral**                            | OCR for images/handwriting; speech-to-text for audio |
| **AWS S3**                             | File storage for uploaded sources and compiled PDFs  |
| **Cloudflare R2**                      | Avatar image storage                                 |
| **Resend**                             | Transactional email (auth, invites, notifications)   |
| **Sentry**                             | Error tracking and performance monitoring            |
| **PostHog**                            | Product analytics                                    |
| **YouTube Transcript API**             | Extracts transcripts from YouTube video URLs         |

## Tech stack

- **Next.js 16** (App Router, Server Actions)
- **PostgreSQL** + **Drizzle ORM**
- **Temporal** — durable workflow engine for the extraction and compilation pipeline
- **Tailwind CSS v4**
- **better-auth** — authentication (email/password with email verification)
- **Puppeteer** — headless PDF generation for master documents

## Development

```bash
npm install
npm run dev
```

Requires a PostgreSQL database, AWS S3 bucket, Cloudflare R2 bucket, and a running Temporal server. Copy `.env.example` to `.env.local` and fill in the values.

### Scripts

| Command             | Description                                   |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Start the Next.js dev server                  |
| `npm run lint`      | Run ESLint                                    |
| `npm run db:push`   | Push schema changes to the database (Drizzle) |
| `npm run db:studio` | Open Drizzle Studio                           |
| `npm run temporal`  | Start a local Temporal dev server             |
| `npm run worker`    | Start the Temporal worker                     |

### Running locally

The full local setup requires three processes running in parallel:

```bash
npm run temporal   # terminal 1 — Temporal dev server
npm run worker     # terminal 2 — workflow/activity worker
npm run dev        # terminal 3 — Next.js
```
