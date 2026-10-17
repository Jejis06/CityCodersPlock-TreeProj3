# TREE MONITOR (PŁOCK) — kontekst dla agentów AI

> Ten plik jest źródłem prawdy dla każdego agenta pracującego w repo. Jego kopia leży w `.cursorrules`.
> Przy każdej zmianie specyfikacji aktualizuj OBA pliki (`agents.md` i `.cursorrules`) w tym samym commicie.

Hackathon "Code the Future" (Płock, 30h). System ewidencji i zarządzania zielenią miejską dla Urzędu Miasta Płocka.
Pracujemy we dwóch (Osoba A, Osoba B) w modelu "Vibe Coding" na osobnych branchach — kod musi być modularny,
a każda zmiana ograniczona do własnej domeny, żeby unikać konfliktów w Git.

---

## 1. Architektura i stack

Monorepo:

| Katalog     | Zawartość |
|-------------|-----------|
| `/server`   | REST API: Node.js + Express + TypeScript + `cors` + lokalna baza **SQLite** przez wbudowany moduł `node:sqlite` (`DatabaseSync`). Cała logika biznesowa, filtrowanie uprawnień i MUTEX żyją tutaj. |
| `/client`   | React + Vite + TypeScript + TailwindCSS + komponenty w stylu `shadcn/ui` + ikony `lucide-react`. |
| `/database` | `init.sql` (schemat + słownik + seed), `species_dictionary.csv` (100 gatunków, źródło prawdy słownika), lokalny plik bazy `tree-monitor.db` (w `.gitignore`). |

### Baza danych: SQLite (lokalnie, bez chmury)
- Jeden plik `database/tree-monitor.db`. Zero instalacji, zero Dockera, zero kont — każdy z nas ma własną kopię, generowaną z `database/init.sql`.
- Sterownik: **`node:sqlite`** (wbudowany w Node, bez natywnych zależności do kompilacji). Wymagany **Node >= 22.13** (`"engines"` w `server/package.json`). NIE dodajemy `better-sqlite3`, Prismy ani innego ORM-a.
- Reset / utworzenie bazy: `sqlite3 database/tree-monitor.db < database/init.sql` albo `npm run db:reset` w `/server` (skrypt czyta `database/init.sql` i wykonuje go przez `db.exec`). Skrypt jest idempotentny i kasuje dane — świetny reset przed demo.
- Jedno połączenie na proces: `server/src/lib/db.ts` eksportuje instancję `db`. Zaraz po otwarciu: `PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;` (`journal_mode = WAL` ustawia `init.sql`).
- Zapytania wyłącznie przez `db.prepare(sql)` z parametrami nazwanymi (`:id`) — nigdy przez sklejanie stringów (SQL injection).
- UUID-y jako `TEXT`, generowane na serwerze przez `crypto.randomUUID()`.
- Daty jako `TEXT` ISO 8601 UTC (`new Date().toISOString()`, np. `2026-10-17T10:31:35.782Z`) — ten sam format co domyślne wartości w bazie, więc porównania tekstowe dat działają.
- Operacje wieloetapowe (np. zmiana statusu zadania + koloru drzewa) w transakcji: `db.exec('BEGIN')` … `db.exec('COMMIT')` / `ROLLBACK` w `catch` (helper `withTransaction(fn)` w `lib/db.ts`).
- Zmiany schematu: edytujemy `database/init.sql` (tylko addytywnie), commitujemy i obaj robimy `npm run db:reset`.

Zasady twarde:
- **Klient NIGDY nie dotyka bazy.** Klient rozmawia wyłącznie z `/server` przez `fetch` (wspólny helper `client/src/lib/api.ts`).
- Sekrety/konfiguracja tylko w `.env` (nigdy w repo). W repo trzymamy `server/.env.example` i `client/.env.example`.

Zmienne środowiskowe:
- `server/.env`: `PORT=4000`, `CORS_ORIGIN=http://localhost:5173`, `DB_PATH=../database/tree-monitor.db` (opcjonalne; domyślnie ta ścieżka)
- `client/.env`: `VITE_API_URL=` (puste = te same origin; w dev Vite proxy przekierowuje `/api` i `/uploads` na `http://localhost:4000`)

Uruchomienie (z katalogu głównego): `npm run setup` (instaluje `/server` i `/client`), potem `npm run dev` (serwer :4000 + klient :5173).
Baza tworzy się automatycznie przy pierwszym starcie serwera, jeśli pliku nie ma. Reset: `npm run db:reset`.

### Silnik mapowy — WYŁĄCZNIE Geoportal (GUGiK), ZERO OpenStreetMap
- `react-leaflet` v5 + `leaflet` 1.9. Środek: Płock `[52.5463, 19.6885]`, `zoom={17}`, `maxZoom={21}`.
- **Zakaz używania OpenStreetMap** i jakichkolwiek innych kafli komercyjnych/społecznościowych. Tylko oficjalne usługi WMS GUGiK + lokalny podkład CAD.
- Konfiguracja warstw w jednym miejscu: `client/src/features/map/mapConfig.ts` (`MAP_CENTER`, `MAP_ZOOM`, `MAP_MAX_ZOOM`, definicje WMS).
- Warstwy w `LayersControl` (`client/src/features/map/MapLayers.tsx`):

| Typ | Nazwa w UI | URL | Parametry |
|-----|-----------|-----|-----------|
| BaseLayer (domyślna, `checked`) | Geoportal - Ortofotomapa HD | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution` | `layers="Raster"`, `format="image/jpeg"`, `transparent={false}`, `version="1.3.0"`, `maxZoom={21}`, `attribution="GUGiK Geoportal.gov.pl"` |
| BaseLayer | Geoportal - Mapa Topograficzna (TOPO) | `https://mapy.geoportal.gov.pl/wss/service/img/guest/TOPO/MapServer/WMSServer` | `layers="Raster"`, `format="image/png"`, `transparent={false}`, `maxZoom={21}`, `attribution="GUGiK Geoportal.gov.pl"` |
| Overlay (domyślnie `checked`) | Geoportal - Działki i Budynki (KIEG) | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | `layers="dzialki,numery_dzialek,budynki"`, `format="image/png"`, `transparent={true}`, `maxZoom={21}` |
| Overlay | Podkład projektowy CAD/DXF i Raster (Lokalny) | lokalny (`CadOverlay.tsx`) | wektorowy projekt Starego Rynku + przycisk "Wgraj podkład" (`.dxf`, `.geojson`/`.json`, `.png`/`.jpg`/`.webp`) |

- **Uwaga techniczna (sprawdzone):** usługa ORTO losowo zwraca `404` dla ok. połowy poprawnych żądań `GetMap` (niezależnie od wersji WMS) — kolejna próba zwykle się udaje. Dlatego `MapLayers.tsx` ma handler `tileerror`, który ponawia pobranie kafla (do 10 razy, z rosnącym opóźnieniem do 2 s). Nie usuwaj go. Wszystkie trzy usługi działają w `EPSG:3857`. Parametry WMS (`layers`, `format`, `transparent`, `version`) przekazujemy przez prop `params` komponentu `WMSTileLayer`.
- Każda warstwa musi mieć `maxZoom={21}` (domyślne 18 w Leaflet ucina zbliżenie).
- **Podkład CAD (lokalny):** domyślnie wyświetla symulowany projekt zagospodarowania Starego Rynku (obrys płyty, ścieżki, projektowane nasadzenia). Przycisk na mapie pozwala wgrać plik z dysku — przetwarzany wyłącznie w przeglądarce (nic nie leci na serwer):
  - `.dxf` → parsowany przez `dxf-parser` (encje `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE`), współrzędne CAD skalowane proporcjonalnie do ramki Starego Rynku (symulacja georeferencji),
  - `.geojson`/`.json` → `GeoJSON` (zakładamy WGS84),
  - raster `.png`/`.jpg`/`.webp` → `ImageOverlay` w ramce Starego Rynku, półprzezroczysty.
- **Punkty roślin (kontrast na ciemnej ortofotomapie):** `Marker` z `L.divIcon` (`client/src/features/map/TreeMarker.tsx`, style w `client/src/features/map/map.css`):
  - kropka w kolorze statusu z **grubą białą obwódką (3px)** i **cieniem** (`box-shadow`), drzewo = koło, krzew/bylina = zaokrąglony kwadrat,
  - **stała etykieta z kodem** (np. `D1/2026`) — biały "pill", ciemny pogrubiony tekst, cień,
  - kolory: `green #16a34a`, `yellow #f59e0b`, `red #dc2626`, `blue #2563eb` (stałe w `client/src/types/domain.ts`).
- Komponent `<TreeMap trees onTreeClick? addMode? onMapClick? className? />` jest reużywalny (urzędnik i wykonawca) i nie zawiera logiki ról. Na mapie jest też legenda kolorów (`MapLegend.tsx`).
- Pamiętaj o imporcie `leaflet/dist/leaflet.css` (robi to `features/map/map.css`).

---

## 2. Role i symulacja urządzeń (Semi-Mock Auth)

Brak logowania hasłem. Ekran `/` pozwala wybrać jedno z 3 kont. Wybrany `user` (`id`, `full_name`, `role`) trzymamy w stanie
(React Context `CurrentUserContext` + **`sessionStorage`** — nie `localStorage`, bo każda karta przeglądarki musi mieć własnego użytkownika, żeby zademonstrować MUTEX na dwóch urzędnikach).
Każde zapytanie HTTP do `/server` wysyła nagłówek **`x-user-id: <uuid>`**.

| Konto | UUID | Rola | Widok |
|-------|------|------|-------|
| Anna Kowalska (Urzędnik 1) | `11111111-1111-1111-1111-111111111111` | `official` | Desktop, pełny dostęp |
| Piotr Nowak (Urzędnik 2) | `22222222-2222-2222-2222-222222222222` | `official` | Desktop, demo MUTEX w drugiej karcie |
| Jan Zieliński (Wykonawca) | `33333333-3333-3333-3333-333333333333` | `contractor` | Symulator tabletu (przełącznik "Ramka Tabletu / Pełny ekran", duże przyciski dotykowe) |

Serwer: middleware `server/src/middleware/currentUser.ts` czyta `x-user-id`, pobiera użytkownika z tabeli `users`
i ustawia `req.user = { id, full_name, role }`. Brak/nieznany nagłówek → `401`. Middleware `requireRole('official')` → `403`.

### RESTRYKCJA BEZPIECZEŃSTWA (obowiązkowa)
Dla roli `contractor` każda odpowiedź API zawierająca drzewa lub zadania MUSI mieć usunięte pola:
`contract_number`, `contract_scan_url`, `funding_source` (dotyczy zarówno obiektów `trees`, jak i `tasks`, także zagnieżdżonych).
- Implementacja w jednym miejscu: `server/src/lib/sanitize.ts` (`sanitizeForRole(data, role)` — rekurencyjnie, także dla zagnieżdżonych obiektów/tablic; `stripSensitive(obj)`).
- Najlepiej nie pobierać tych kolumn w ogóle (`select` bez nich) dla wykonawcy, a dodatkowo przepuścić wynik przez sanitizer.
- Wykonawca nie może ich zobaczyć ani w UI, ani w DevTools → zakładka Network.

---

## 3. Kolory punktów i kategorie zadań

Każda roślina ma kod: `D{n}/{rok}` dla drzew (`type = 'tree'`), `K{n}/{rok}` dla krzewów/bylin (`type = 'shrub'`).
Numer `n` jest kolejny w obrębie prefiksu i roku. Generuje go serwer (`server/src/lib/treeCode.ts`) tym zapytaniem
(`:prefix` = `'D'`/`'K'`, `:year` = np. `'2026'`), w tej samej transakcji co `INSERT`; przy kolizji `UNIQUE(code)` — ponów próbę:
```sql
SELECT :prefix || (COALESCE(MAX(CAST(substr(code, 2, instr(code, '/') - 2) AS INTEGER)), 0) + 1) || '/' || :year AS code
FROM trees
WHERE substr(code, 1, 1) = :prefix AND substr(code, instr(code, '/') + 1) = :year;
```

`trees.status`:
| Status | Kolor | Znaczenie |
|--------|-------|-----------|
| `green`  | zielony `#16a34a` | zdrowe / stoi / wszystkie prace zatwierdzone |
| `yellow` | żółty/pomarańczowy `#f59e0b` | w trakcie prac pielęgnacyjnych lub zadanie czeka na zatwierdzenie |
| `red`    | czerwony `#dc2626` | przeznaczone do wycinki |
| `blue`   | niebieski `#2563eb` | do posadzenia / nowe nasadzenie |

Kategorie i podkategorie zadań (`tasks.category` → `tasks.subcategory`), wymuszone CHECK-iem w bazie:
- `pielegnacja`: `nawozenie`, `podlewanie`, `przycinanie`
- `wycinka`: `wycinka`
- `nasadzanie`: `korowanie`, `palikowanie`

Etykiety PL do UI: Pielęgnacja / Wycinka / Nasadzanie; Nawożenie / Podlewanie / Przycinanie / Wycinka / Korowanie / Palikowanie.

`tasks.status`: `assigned` → `pending_approval` → `approved` | `rejected` (rejected wraca do wykonawcy i może znów przejść w `pending_approval`).

### Reguły zmiany statusu rośliny (logika na serwerze)
| Zdarzenie | `trees.status` |
|-----------|----------------|
| Zlecenie zadania `wycinka` | `red` |
| Zlecenie zadania `pielegnacja` | `yellow` |
| Zlecenie zadania `nasadzanie` | `blue` |
| Wykonawca zgłasza wykonanie (`pending_approval`) | `yellow` |
| Urzędnik zatwierdza (`approved`) | `green` |
| Urzędnik odrzuca (`rejected`) | kolor wg kategorii zadania (jak przy zleceniu) |
| Nowa roślina dodana z mapy | domyślnie `green` (lub `blue`, jeśli zaznaczono "do posadzenia") |

---

## 4. Przepływy biznesowe

### A. Urzędnik (Desktop)
1. **Mapa z filtrami:** gatunek, rok posadzenia, status (kolor), przypisany wykonawca, kategoria zadań. Filtrowanie po stronie serwera (query params `GET /api/trees`).
2. **Dodawanie rośliny:** tryb "Dodaj roślinę na mapie" → klik na mapie → modal: wyszukiwarka 100 gatunków (`GET /api/species?q=`), typ `tree`/`shrub`, podgląd auto-kodu (`GET /api/trees/next-code?type=`), adres/działka, rok posadzenia → `POST /api/trees` (kod nadaje serwer w momencie zapisu, podgląd jest tylko informacyjny).
3. **Karta ewidencyjna (Drawer/Sheet):** gatunek, kod, współrzędne, adres/działka, rok posadzenia, wykonawca;
   dane wrażliwe (tylko urzędnik): numer umowy, link do skanu PDF, dofinansowanie; pełna historia prac (zdjęcia, daty, komentarze, powody odrzuceń).
   Przycisk **"Zleć zadanie"**: kategoria → podkategoria, numer umowy, skan umowy (Semi-Mock: URL/nazwa pliku) → `POST /api/trees/:id/tasks`.
   Zadanie automatycznie przypisuje się do wykonawcy `33333333-3333-3333-3333-333333333333`, status drzewa zmienia się wg tabeli powyżej.
4. **Kolejka zatwierdzeń + MUTEX:** lista zadań `pending_approval` z danymi rośliny, rodzajem pracy, komentarzem i zdjęciem wykonawcy.
   - Klik w zadanie → `POST /api/tasks/:id/lock`. Serwer atomowo (jedno warunkowe `UPDATE`) ustawia `locked_by = user.id`, `locked_at = now`,
     jeśli zadanie jest wolne, już zablokowane przez tego samego użytkownika, lub blokada jest starsza niż **5 minut**. W przeciwnym razie `409 Conflict` z `locked_by_name`.
     Nie rób "najpierw SELECT, potem UPDATE" — to wyścig. Jedyne poprawne zapytanie:
     ```sql
     UPDATE tasks SET locked_by = :userId, locked_at = :now
     WHERE id = :taskId AND status = 'pending_approval'
       AND (locked_by IS NULL OR locked_by = :userId OR locked_at < :expiredBefore)
     RETURNING id;
     -- :now = new Date().toISOString(), :expiredBefore = new Date(Date.now() - 5 * 60_000).toISOString()
     -- brak wiersza => SELECT zadania + users.full_name posiadacza blokady => 409 (lub 404, gdy zadania nie ma)
     ```
   - Inny urzędnik widzi czerwoną kłódkę: *"Zablokowane przez: Anna Kowalska"* i zablokowane przyciski akcji. Kolejka odświeża się pollingiem co ~3–5 s.
   - Zamknięcie panelu bez decyzji → `POST /api/tasks/:id/unlock`.
   - **Zatwierdź** `POST /api/tasks/:id/approve`: `status = 'approved'`, `reviewed_by/at`, zdjęcie blokady (`locked_by = null, locked_at = null`), `trees.status = 'green'`.
   - **Odrzuć** `POST /api/tasks/:id/reject` (body: `{ reason }`, wymagane, niepuste): `status = 'rejected'`, `official_rejection_reason = reason`, zdjęcie blokady, zadanie wraca na listę "Do wykonania" wykonawcy.
   - Approve/reject wolno wykonać tylko posiadaczowi ważnej blokady (inaczej `409`).

### B. Wykonawca (Tablet Simulator)
1. **Tablica zadań + mapa robocza:** zakładka "Do wykonania" (`assigned` + `rejected`, odrzucone z czerwono wyróżnionym powodem) i zakładka "Wykonane" (`pending_approval` + `approved`). Wykonawca widzi wyłącznie zadania, gdzie `assigned_to = req.user.id`.
2. **Realizacja zadania:** widok kategorii (np. *Pielęgnacja: Podlewanie*), zdjęcie (upload pliku albo wybór z gotowych zdjęć demo w `client/public/demo/photos/`), opcjonalny komentarz → **"Zgłoś wykonanie"** → `POST /api/tasks/:id/submit` → `pending_approval`, `completed_at = now()`, trafia do kolejki urzędnika.
   Upload: `POST /api/uploads` (multipart, `multer`) zapisuje plik w `server/uploads/` (w `.gitignore`) i zwraca `{ url: '/uploads/<plik>' }`; serwer serwuje katalog statycznie pod `/uploads`. Zdjęcia demo to po prostu URL-e `/demo/photos/*.svg` z `client/public`. W `<img>` używaj `assetUrl(url)` z `lib/api.ts`.
3. **Karta rośliny (widok ograniczony):** gatunek, lokalizacja, historia zabiegów — bez sekcji umów i finansowania (pola usunięte już na serwerze).

---

## 5. Kontrakt API (`/server`, prefiks `/api`)

Wszystkie endpointy (poza `/api/health` i `/api/users`) wymagają nagłówka `x-user-id`. Odpowiedzi JSON; błędy jako `{ "error": "komunikat" }`.

| Metoda | Ścieżka | Rola | Opis |
|--------|---------|------|------|
| GET  | `/api/health` | — | healthcheck |
| GET  | `/api/users` | — | 3 konta do ekranu wyboru ról |
| GET  | `/api/species?q=&type=` | any | słownik gatunków (wyszukiwanie po nazwie PL/łacińskiej/odmianie) |
| GET  | `/api/trees?species_id=&planting_year=&status=&contractor_id=&task_category=` | any | lista roślin do mapy (sanitizacja dla contractor) |
| GET  | `/api/trees/next-code?type=tree\|shrub` | official | podgląd kolejnego kodu |
| GET  | `/api/trees/:id` | any | karta rośliny + gatunek + wykonawca + historia `tasks` |
| POST | `/api/trees` | official | dodanie rośliny |
| POST | `/api/trees/:id/tasks` | official | zlecenie zadania (auto-przypisanie do wykonawcy) |
| GET  | `/api/tasks?status=a,b` | any | official: wszystkie (kolejka: `pending_approval` + info o blokadzie); contractor: tylko własne |
| POST | `/api/tasks/:id/submit` | contractor | zgłoszenie wykonania `{ photo_url, comment? }` |
| POST | `/api/tasks/:id/lock` | official | MUTEX — przejęcie blokady |
| POST | `/api/tasks/:id/unlock` | official | zwolnienie własnej blokady |
| POST | `/api/tasks/:id/approve` | official | zatwierdzenie |
| POST | `/api/tasks/:id/reject` | official | odrzucenie `{ reason }` |
| POST | `/api/uploads` | any | upload zdjęcia/skanu (multipart, pole `file`) → `{ url }` |

Struktura serwera:
```
server/src/
  index.ts                 # start: auto-inicjalizacja bazy (gdy brak schematu) + listen
  app.ts                   # Express: cors, json, /uploads, montowanie routerów (1 linia na domenę), obsługa błędów
  express.d.ts             # req.user
  types.ts                 # typy domenowe (wspólne, zmiany tylko addytywne)
  lib/config.ts            # PORT, CORS_ORIGIN, DB_PATH, ścieżki; ładuje server/.env (process.loadEnvFile)
  lib/db.ts                # node:sqlite (DatabaseSync), PRAGMA, queryAll/queryOne/execute, withTransaction(), nowIso()
  lib/http.ts              # HttpError(status, message, details?), getUser(req)
  lib/sanitize.ts          # sanitizeForRole(data, role) — głębokie usuwanie pól wrażliwych dla contractor
  lib/constants.ts         # LOCK_TIMEOUT_MINUTES = 5, CONTRACTOR_ID, TASK_SUBCATEGORIES, TREE_STATUS_FOR_CATEGORY
  lib/treeCode.ts          # nextTreeCode(type, year?) -> D{n}/{rok}, K{n}/{rok}
  middleware/currentUser.ts  # x-user-id -> req.user (401)
  middleware/requireRole.ts  # requireRole('official') (403)
  scripts/db-reset.ts      # npm run db:reset — wykonuje database/init.sql
  routes/users.ts          # Branch 0: GET /api/users (bez nagłówka)
  routes/species.ts        # Branch 0: GET /api/species?q=&type=
  routes/uploads.ts        # Branch 0: POST /api/uploads (multer -> server/uploads/)
  routes/trees.ts          # Osoba A (Branch 0 ma GET /api/trees z join gatunku i wykonawcy)
  routes/tasks.ts          # Osoba B (pusty router, już zamontowany pod /api/tasks)
```

Konwencje serwera:
- Handlery mogą rzucać `HttpError` (także w middleware) — Express 5 sam przekazuje wyjątki do globalnego handlera w `app.ts`. Błędy `CHECK`/`FOREIGN KEY` z SQLite zamieniane są na `400`.
- Kod SQL zawsze przez `queryAll/queryOne/execute` z parametrami nazwanymi (`{ id }` ↔ `:id`).
- Każda odpowiedź z drzewami/zadaniami przechodzi przez `sanitizeForRole(data, getUser(req).role)`.

---

## 6. Model danych (skrót — pełny schemat w `database/init.sql`)

- `users(id uuid, full_name, role 'official'|'contractor', device 'desktop'|'tablet')`
- `species_dictionary(id int, type 'tree'|'shrub', polish_name, latin_name, cultivar)` — 100 rekordów z CSV
- `trees(id uuid, code unique, type, species_id → species_dictionary, latitude, longitude, address, plot_number, planting_year, status, contractor_id → users, contract_number*, contract_scan_url*, funding_source*, notes, created_by, created_at, updated_at)`
- `tasks(id uuid, tree_id → trees, category, subcategory, status, assigned_to → users, created_by → users, contract_number*, contract_scan_url*, description, contractor_comment, contractor_photo_url, completed_at, official_rejection_reason, reviewed_by, reviewed_at, locked_by → users, locked_at, created_at, updated_at)`
- Typy SQLite: `TEXT` (uuid, daty ISO, enumy), `INTEGER`, `REAL` (współrzędne); tabele `STRICT`.
- Integralność w bazie: CHECK na enumy, parę kategoria/podkategoria, format kodu `D{n}/{rok}`/`K{n}/{rok}`, wymagany powód odrzucenia, spójność `locked_by`/`locked_at`; FK z `ON DELETE`; trigger aktualizujący `updated_at`.

`*` = pola wrażliwe, nigdy nie wysyłane do roli `contractor`.

---

## 7. Struktura klienta i podział pracy

```
client/src/
  main.tsx, index.css        # Branch 0: Tailwind v4 (@import 'tailwindcss'), alias '@/' -> src/
  app/App.tsx                # Branch 0: routing (react-router): / , /official, /official/queue, /contractor
  app/CurrentUserContext.tsx # Branch 0: useCurrentUser(), login/logout, sessionStorage, homePathForRole()
  app/RequireRole.tsx        # Branch 0: ochrona tras wg roli
  app/layouts/               # Branch 0: OfficialLayout (header + nawigacja), AppBrand
  app/pages/RoleSelectPage.tsx   # Branch 0: ekran wyboru 3 kont
  app/pages/OfficialMapPage.tsx  # Osoba A: strona mapy urzędnika (sidebar na filtry + TreeMap)
  lib/api.ts                 # Branch 0: api.get/post/patch/delete/upload, ApiError, assetUrl(); x-user-id automatycznie
  lib/utils.ts               # Branch 0: cn(), formatDateTime()
  types/domain.ts            # Branch 0: typy + etykiety PL + kolory statusów + TASK_SUBCATEGORIES + speciesLabel()
  components/shared/         # Branch 0: Button (size="touch" dla tabletu), Card, Badge, FormControls (Input/Textarea/Select/Label),
                             #           Dialog, Sheet (radix), StatusDot, TabletFrame, Feedback (Spinner/ErrorMessage/EmptyState)
  features/map/              # Osoba A: TreeMap, MapLayers (Geoportal), TreeMarker, MapLegend, mapConfig, useTrees, cad/*
  features/tree-card/        # Osoba A: TreeQuickInfo (Branch 0) -> pełna karta w Sheet + formularz "Zleć zadanie"
  features/approval-queue/   # Osoba B: ApprovalQueuePage (placeholder z Branch 0) -> kolejka, MUTEX, approve/reject
  features/contractor/       # Osoba B: ContractorPage (ramka tabletu + mapa z Branch 0) -> lista zadań, zgłaszanie wykonania
```

Komponenty mapy (`features/map`) muszą być reużywalne przez wykonawcę: `<TreeMap trees={...} onTreeClick={...} />` bez logiki ról w środku.
Z-index: Leaflet używa do 1000 — nakładki nad mapą `z-[1001]`, Dialog/Sheet `z-[2000]+`.

Zasoby demo (w `client/public/demo/`, serwowane statycznie): `photos/*.svg` (zdjęcia z realizacji, używane w seedzie),
`contracts/UM-ZZ-2026-*.pdf` (skany umów), `cad/stary-rynek-projekt.dxf` (przykładowy plik do przycisku "Wgraj z dysku").

### Harmonogram branchy
1. `main` (Branch 0 — wspólny, **GOTOWE**): setup `/server` i `/client`, połączenie z lokalną bazą SQLite (`lib/db.ts`, `npm run db:reset`), upload plików, przełącznik 3 kont, layout urzędnika i ramka tabletu, mapa Geoportalu z punktami roślin (`GET /api/trees`), podkład CAD.
2. `feat/map-and-filters` (Osoba A) ‖ `feat/contractor-tablet-view` (Osoba B)
3. `feat/tree-card-and-task-creator` (Osoba A) ‖ `feat/approval-queue-mutex` (Osoba B)

### Zasady Git (anti-konflikt)
- Każdy branch modyfikuje tylko swój katalog `features/*` i swój plik `server/src/routes/*`.
- Pliki wspólne (`components/shared`, `types`, `lib/*`, `app/*` poza `OfficialMapPage.tsx`, `server/src/app.ts`, `server/src/lib/*`, `server/src/types.ts`, `database/*`, `agents.md`) — zmiany tylko **addytywne** i małe; nie refaktoruj ani nie przeformatowuj cudzego kodu.
- Routery są już zamontowane w `server/src/app.ts` (po jednej linii na domenę), więc feature-branche zwykle nie muszą go ruszać.
- Przed pushem: `npm run typecheck` (root) musi przechodzić.
- Nowe zależności npm dodawaj tylko w swoim branchu i opisz w commicie; nie aktualizuj wersji istniejących pakietów.
- Małe commity, opisowe wiadomości (`feat(map): ...`, `feat(queue): ...`, `fix(server): ...`). Przed merge: `git pull --rebase origin main`.

---

## 8. Konwencje kodu
- TypeScript `strict`. Bez `any` (wyjątkowo `unknown` + zawężanie).
- Nazwy kolumn/pól API w `snake_case` (1:1 z bazą), nazwy zmiennych/komponentów w `camelCase`/`PascalCase`.
- UI w języku polskim; kod, identyfikatory i nazwy plików po angielsku.
- Statusy, kategorie i kolory w jednym miejscu: `client/src/types/domain.ts` i `server/src/lib/constants.ts`.
- Komponenty w stylu shadcn/ui (Tailwind + `class-variance-authority` + `clsx`/`tailwind-merge` przez `cn()`), ikony `lucide-react`.
- Obsługa błędów: każdy endpoint w `try/catch`, sensowne kody HTTP (400/401/403/404/409/500).
- Nie generuj kodu poza zakresem bieżącego branchu bez pytania.
