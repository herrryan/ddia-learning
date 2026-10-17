# DDIA Study Guide

A static, offline-capable study guide website for *Designing Data-Intensive Applications* by Martin Kleppmann (O'Reilly, 2017).

The guide contains original study notes written in plain language, not excerpts from the book. Use the notes alongside your copy of the book.

## What the site contains

| Area | Content |
| --- | --- |
| 12 chapter pages | Overview, big ideas, section-by-section notes with comparison tables and callouts, key terms, pitfalls, cross-chapter connections, and open review questions with a saved answer box |
| Parallel notes (`#/notes` & `N` key) | Side-by-side right-hand notes dock (with 1 or 2 parallel editors alongside any chapter) plus a dedicated 1–3 column parallel workspace (`#/notes`), section-linked notes, Markdown preview, and `.md` export |
| Flashcards | 26–30 cards per chapter; mark each card *Got it* or *Still learning*; filter, shuffle, keyboard shortcuts |
| Quizzes | 12 multiple-choice questions per chapter with explanations; best score saved |
| Glossary | 117 terms, each linked to the chapters where the concept matters |
| Themes | 8 cross-cutting ideas traced through the chapters |
| Study plan | A 7-week pacing plan with weekly goals |
| Search | Press `/` or `Cmd+K` to search chapters, sections, terms, glossary, themes, and personal notes |

Progress (studied chapters, personal notes, card marks, quiz scores, written answers, theme) lives in the browser's `localStorage` under the key `ddia-study-guide.v1`. Nothing leaves the machine.

## Run the site

Option A — open the file directly:

1. Open [`site/index.html`](site/index.html) in a browser.

Option B — serve the directory (recommended for consistent behaviour):

```sh
cd site
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

The site has no build step and no runtime dependencies. Fonts load from Google Fonts when online and fall back to system fonts offline.

## Project layout

```
site/
├── index.html              # single-page shell; loads content then app scripts
├── css/styles.css          # design tokens (light/dark), layout, components, print styles
└── js/
    ├── content/
    │   ├── registry.js     # DDIA.registerChapter / DDIA.registerGlossary API
    │   ├── book.js         # parts, cross-cutting themes, study plan, fallback titles
    │   ├── ch01.js … ch12.js   # one content file per chapter
    │   └── glossary.js     # glossary entries
    ├── markup.js           # HTML escaping and the two inline markers (**bold**, `code`)
    ├── store.js            # localStorage progress store and progress calculation
    ├── views.js            # page renderers (home, chapter, flashcards, quiz, glossary, themes, plan)
    └── app.js              # hash router, sidebar nav, search, theme toggle
```

## Edit the content

Each chapter file calls `DDIA.registerChapter({...})` with this shape:

```js
DDIA.registerChapter({
  number: 5, part: 2, title: "Replication", tagline: "...", studyMinutes: 90,
  overview: ["paragraph", "paragraph"],
  bigIdeas: ["...", "..."],
  sections: [{ id: "kebab-id", title: "...", body: ["..."], keyPoints: ["..."],
               table: { caption, columns: [...], rows: [[...]] },     // optional
               callout: { kind: "insight" | "pitfall" | "example", text: "..." },  // optional
               systems: ["PostgreSQL"] }],                            // optional
  terms: [{ term, definition }],
  pitfalls: ["..."],
  connections: [{ chapter: 9, note: "..." }],
  flashcards: [{ front, back }],
  quiz: [{ question, choices: ["a", "b", "c", "d"], answer: 0, explanation }],
  reviewQuestions: ["..."]
});
```

Inside strings, only `**bold**` and `` `code` `` are interpreted. Paragraphs are separate array items.

Routes: `#/`, `#/chapter/5`, `#/chapter/5/notes/<section-id>`, `#/chapter/5/flashcards`, `#/chapter/5/quiz`, `#/glossary`, `#/themes`, `#/plan`.
