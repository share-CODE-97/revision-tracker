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
  { id: "01_squares-cubes", title: "SQUARES & CUBES (1–35)", page: "revision/01_squares-cubes.html" },
  { id: "02_table",   title: "TABLE ( 1 - 30 )", page: "revision/02_table.html"         },
  { id: "03_magadha-dynasties", title: "ANCIENT DYNASTIES (KING)",  page: "revision/03_magadha-dynasties.html"},
  { id: "04_medival-history", title: "MEDIVAL HISTORY", page: "revision/04_medival-history.html" },
  { id: "05_akbar-campaigns", title: "AKBAR MELETRY CAMPAIGNS", page: "revision/05_akbar-campaigns.html"},
  { id: "06_anglo-wars", title: "ANGLO WAR  ( 18th AND 19th )", page: "revision/06_anglo-wars.html"},
  { id: "07_foreign-crops", title: "FOREIGN CROPS IN INDIA",page: "revision/07_foreign-crops.html"},
  { id: "08_cropping-seasons", title: "CROPPING SEASONS",page: "revision/08_cropping-seasons.html"},
  { id: "09_alloys-ores", title: "ALLOYS AND ORES",page: "revision/09_alloys-ores.html"},
  { id: "10_india_minerals", title: "MINERALS OF INDIA",page: "revision/10_india_minerals.html"},
  { id: "11_indian-rivers", title: "INDIAN RIVER SYSTEM",page: "revision/11_indian-rivers.html"},
  { id: "12_grasslands-world", title: "GRASSLANDS OF THE WORLD",page: "revision/12_grasslands-world.html"},
  { id: "13_mountains-volcanoes", title: "MOUNTAIN AND VOLCANOES",page: "revision/13_mountains-volcanoes.html"},
  { id: "14_world-geography", title: "WORLD GEOGRAPHY",page: "revision/14_world-geography.html"},
  { id: "15_physical-geography", title: "PHYSICAL GEOGRAPHY",page: "revision/15_physical-geography.html"},
  { id: "16_science-capsule", title: "SCIENCE CAPSULE",page: "revision/16_science-capsule.html"},
  { id: "17_international_organization", title: "INTERNATIONAL ORGANIZATIONS",page: "revision/17_international_organization.html"},
  { id: "18_socio_religious_movement", title: "SOCIO-RELIGIOUS MOVEMENTS",page: "revision/18_socio_religious_movement.html"},
  { id: "19_foreign_travellers", title: "FOREIGN TRAVELLERS",page: "revision/19_foreign_travellers.html"},
  { id: "20_modern_india_1857_1947_overview", title: "MODERN INDIA (1857-1947): OVERVIEW",page: "revision/20_modern_india_1857_1947_overview.html"},
  { id: "21_viceroys", title: "VICEROYS OF INDIA",page: "revision/21_viceroys.html"},
  { id: "22_president_of_india", title: "PRESIDENT OF INDIA",page: "revision/22_president_of_india.html"}
  
  

/* above of this line is Perfect */





];