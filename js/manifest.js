/* ============================================================================
 * manifest.js — SINGLE SOURCE OF TRUTH for revision subjects
 * ----------------------------------------------------------------------------
 * This is THE ONLY FILE you need to edit when adding / removing / renaming a
 * revision subject. Everything else (dashboard, search, recent-views,
 * storage seeding, subject page) adapts automatically.
 *
 * ── HOW TO ADD A NEW REVISION SUBJECT ──────────────────────────────────────
 *   1. Create an HTML file at:  revision/<your-id>.html
 *      (Copy revision/maths.html as a starting template.)
 *
 *   2. Add ONE entry to the REVISIONS array below:
 *
 *          { id: "chemistry", title: "Chemistry", page: "revision/chemistry.html" }
 *
 *      Rules:
 *        • `id`    — must be UNIQUE, lowercase, no spaces. Used as the
 *                    localStorage key AND in the URL hash of the subject view.
 *        • `title` — what the user sees on screen.
 *        • `page`  — relative path to the revision HTML file.
 *
 *   3. (Recommended) Add the new page to PRECACHE_URLS in service-worker.js
 *      so it works offline. Bump CACHE_VERSION there too.
 *
 *   4. Reload the app. The new subject appears everywhere automatically.
 *
 * ── HOW TO REMOVE A SUBJECT ────────────────────────────────────────────────
 *   Just delete its entry below. Any saved progress for that id stays in
 *   localStorage harmlessly (so you can re-add it later without data loss).
 *
 * ── HOW TO REORDER SUBJECTS ────────────────────────────────────────────────
 *   The dashboard "ALL REVISIONS" list renders in the order of this array.
 *   Drag entries up/down to reorder.
 * ==========================================================================*/

const REVISIONS = [
  { id: "maths",   title: "Maths",           page: "revision/maths.html"           },
  { id: "physics", title: "Physics",         page: "revision/physics.html"         },
  { id: "history", title: "History",         page: "revision/history.html"         },
  { id: "table",   title: "Table",           page: "revision/table.html"           },
  { id: "cube",    title: "Cube",            page: "revision/cube.html"            },
  { id: "medival", title: "Medival History", page: "revision/medival-history.html" }
];