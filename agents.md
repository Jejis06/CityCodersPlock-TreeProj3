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

### Silnik mapowy — WYŁĄCZNIE Geoportal (GUGiK), ZERO OpenStreetMap (z lokalnym cachem SQLite `/api/wms/:layer`)
- `react-leaflet` v5 + `leaflet` 1.9. Środek: Płock `[52.5463, 19.6885]`, `zoom={17}`, `maxNativeZoom={18}`, `maxZoom={21}`, `tileSize={512}`.
- **Zakaz używania OpenStreetMap** i jakichkolwiek innych kafli komercyjnych/społecznościowych. Tylko oficjalne usługi WMS GUGiK + lokalny podkład CAD.
- **Lokalne API kafelkowe i trwały cache SQLite (`database/wms-cache.db`, `server/src/lib/wmsCache.ts`, `server/src/routes/wms.ts`):**
  - Klient odpytuje nasze lokalne endpointy `/api/wms/basemap`, `/api/wms/orto`, `/api/wms/kieg`, `/api/wms/kiut` (publiczne, bez `x-user-id`, żeby działały w tagach `<img>` Leafletu oraz przez proxy Vite na iPadzie).
  - Przy trafieniu w cache (`HIT`) serwer zwraca kafelek z `database/wms-cache.db` w `< 1 ms` (`Cache-Control: public, max-age=604800, immutable`).
  - Przy braku kafelka (`MISS`) serwer pobiera go z GUGiK przez kolejkę z limitem współbieżności (max 6 jednoczesnych zapytań na host GUGiK), deduplikacją w locie (`inFlight`) i automatycznym retry po stronie serwera, po czym zapisuje kafelek na stałe w `database/wms-cache.db`.
  - Pre-fetching map całego Płocka i okolic drzew: `npm run map:prefetch` (`server/src/scripts/map-prefetch.ts`).
- Konfiguracja warstw w jednym miejscu: `client/src/features/map/mapConfig.ts` (`MAP_CENTER`, `MAP_ZOOM`, `MAP_MAX_NATIVE_ZOOM`, `MAP_MAX_ZOOM`, `MAP_TILE_SIZE`, definicje WMS).
- Warstwy w `LayersControl` (`client/src/features/map/MapLayers.tsx`):

| Typ | Nazwa w UI | Lokalny URL (proxy → GUGiK WMS) | Parametry |
|-----|-----------|--------------------------------|-----------|
| BaseLayer (domyślna, `checked`) | Geoportal - Mapa Uliczna (GUGiK BaseMap) | `/api/wms/basemap` → `https://mapy.geoportal.gov.pl/wss/ext/OSM/BaseMap/service` | `layers="osm"`, `format="image/png"`, `transparent={false}`, `version="1.1.1"`, `tileSize={512}`, `minZoom={10}`, `maxNativeZoom={18}`, `maxZoom={21}` |
| BaseLayer | Geoportal - Ortofotomapa HD | `/api/wms/orto` → `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution` | `layers="Raster"`, `format="image/jpeg"`, `transparent={false}`, `version="1.3.0"`, `tileSize={512}`, `maxNativeZoom={18}`, `maxZoom={21}` |
| Overlay (domyślnie `checked`) | Geoportal - Działki i Budynki (KIEG) | `/api/wms/kieg` → `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | `layers="dzialki,numery_dzialek,budynki"`, `format="image/png"`, `transparent={true}`, `tileSize={512}`, `maxNativeZoom={18}`, `maxZoom={21}` |
| Overlay (domyślnie wyłączony) | Geoportal - Uzbrojenie terenu (KIUT) | `/api/wms/kiut` → `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu` | `layers="przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_cieplowniczy,przewod_telekomunikacyjny"`, `format="image/png"`, `transparent={true}`, `tileSize={512}`, `maxNativeZoom={18}`, `maxZoom={21}` (moduł `KiutOverlay.tsx`) |
| Overlay | Podkład projektowy CAD/DXF i Raster (Lokalny) | lokalny (`CadOverlay.tsx`) | wektorowy projekt Starego Rynku (tylko wpis w `LayersControl`; pływający panel „Podkład CAD / raster (lokalny)” z przyciskiem „Wgraj z dysku” został usunięty) |

- **Uwaga techniczna (sprawdzone):** usługa ORTO losowo zwraca `404` dla ok. połowy poprawnych żądań `GetMap` — retry realizuje zarówno serwer (`wmsCache.ts`), jak i handler `tileerror` w `GeoportalWms.tsx`. Kafelki `512×512` redukują liczbę zapytań 4-krotnie przy zachowaniu identycznej skali odwzorowania WMS, a `maxNativeZoom={18}` przy `maxZoom={21}` płynnie przeskalowuje pobrane kafelki na zoomach 20–21 bez dodatkowych zapytań sieciowych.
- **Podkład CAD (lokalny):** domyślnie wyświetla symulowany projekt zagospodarowania Starego Rynku (obrys płyty, ścieżki, projektowane nasadzenia). Panel wgrywania pliku z mapy usunięto (`CadUploadControl` nie istnieje, `TreeMap` nie ma propa `showCadControl`); parser w `cad/parseCadFile.ts` + `useCadLayer().loadFile` zostały i obsługują (wyłącznie w przeglądarce):
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
- `nasadzanie`: `posadzenie`, `korowanie`, `palikowanie`

Etykiety PL do UI: Pielęgnacja / Wycinka / Nasadzanie; Nawożenie / Podlewanie / Przycinanie / Wycinka / Posadzenie / Korowanie / Palikowanie.

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

Wszystkie endpointy (poza `/api/health`, `/api/users` i `/api/wms/*`) wymagają nagłówka `x-user-id`. Odpowiedzi JSON; błędy jako `{ "error": "komunikat" }`.

| Metoda | Ścieżka | Rola | Opis |
|--------|---------|------|------|
| GET  | `/api/health` | — | healthcheck |
| GET  | `/api/users` | — | 3 konta do ekranu wyboru ról |
| GET  | `/api/wms/:layer` | — | lokalny serwer kafelków WMS (`basemap`, `orto`, `kieg`, `kiut`) z trwałym cachem SQLite (`database/wms-cache.db`) i ochroną przed rate-limitem GUGiK |
| GET  | `/api/wms/stats` | — | statystyki lokalnego cache'u kafelków WMS (liczba kafelków i rozmiar MB na warstwę) |
| GET  | `/api/species?q=&type=` | any | słownik gatunków (wyszukiwanie po nazwie PL/łacińskiej/odmianie) |
| GET  | `/api/geocode/reverse?lat=&lng=` | official | działka z ULDK (numer, obręb, obrys jako GeoJSON) + najbliższy adres (GUGiK UUG) |
| GET  | `/api/geocode/suggest?q=` | official | podpowiedzi jednej wyszukiwarki: rośliny po kodzie (`source: 'plant'`, np. `D32/2026`), ulice z bazy drzew (`'trees'`) + adresy w Płocku (`'gugik'`, GUGiK UUG) |
| GET  | `/api/trees?species_id=&planting_year=&status=&contractor_id=&task_category=&address=` | any | lista roślin do mapy (sanitizacja dla contractor); `address` = wspólne pole wyszukiwania: prefiks `code` (bez rozróżniania wielkości liter, `D3/2026` nie łapie `D13/2026`) LUB fragment `address` (gatunek filtruje się wyłącznie przez `species_id`) |
| GET  | `/api/trees/next-code?type=tree\|shrub` | official | podgląd kolejnego kodu |
| GET  | `/api/trees/:id` | any | karta rośliny + gatunek + wykonawca + historia `tasks` |
| POST | `/api/trees` | official | dodanie rośliny (opcjonalnie z wyborem wykonawcy, `assign_planting_task`, `is_from_decision`, `decision_number`, `parcel_geometry` oraz `planting_year = null`) |
| PATCH | `/api/trees/:id` | official | edycja rośliny (zmiana wykonawcy, przesunięcie współrzędnych + adres/działka/geometria, parametry) |
| DELETE | `/api/trees/:id` | official | usunięcie rośliny wraz z powiązanymi zadaniami (`ON DELETE CASCADE`) |
| POST | `/api/trees/warranty-tasks` | official | masowe wygenerowanie pakietu zadań kontroli gwarancyjnej (po 3 latach) dla drzew z decyzji |
| POST | `/api/trees/seed-bdot10k` | official | import punktów BDOT10k Płocka (`database/plock_bdot10k_trees.kml`) + wzbogacenie danych (adresy/działki/obrysy z GUGiK ULDK+UUG, cache `database/plock_bdot10k_geocoded.json`); idempotentny, zwraca podsumowanie |
| POST | `/api/trees/recalculate-locations` | official | przeliczenie `address`, `plot_number`, `parcel_geometry` i obrębu w notatkach dla wszystkich roślin w bazie wg współrzędnych (`reverseGeocodePoint` z GUGiK ULDK + UUG) |
| POST | `/api/trees/:id/tasks` | official | zlecenie zadania (przypisanie do wykonawcy drzewa lub domyślnego wykonawcy) |
| GET  | `/api/tasks?status=a,b` | any | official: wszystkie (kolejka: `pending_approval` + info o blokadzie); contractor: tylko własne |
| POST | `/api/tasks/bulk` | official | masowe zlecenie wspólnego zadania dla zaznaczonych roślin (`tree_ids`, `category`, `subcategory`, `contractor_id`, `contract_number`, `contract_scan_url?`, `description?`) + aktualizacja ich statusów na mapie |
| POST | `/api/tasks/:id/submit` | contractor | zgłoszenie wykonania `{ photo_url, comment? }` |
| POST | `/api/tasks/:id/lock` | official | MUTEX — przejęcie blokady |
| POST | `/api/tasks/:id/unlock` | official | zwolnienie własnej blokady |
| POST | `/api/tasks/:id/approve` | official | zatwierdzenie |
| POST | `/api/tasks/:id/reject` | official | odrzucenie `{ reason }` |
| POST | `/api/uploads` | any | upload zdjęcia/skanu (multipart, pole `file`) → `{ url }` |

Struktura serwera:
```
server/src/
  index.ts                 # start: auto-inicjalizacja bazy (gdy brak schematu) + seed BDOT10k (gdy < 40 roślin) + applyDatabaseFixes() + listen
  app.ts                   # Express: cors, json, /uploads, montowanie routerów (1 linia na domenę), obsługa błędów
  express.d.ts             # req.user
  types.ts                 # typy domenowe (wspólne, zmiany tylko addytywne)
  lib/config.ts            # PORT, CORS_ORIGIN, DB_PATH, WMS_CACHE_DB_PATH, ścieżki; ładuje server/.env (process.loadEnvFile)
  lib/db.ts                # node:sqlite (DatabaseSync), PRAGMA, queryAll/queryOne/execute, withTransaction(), nowIso()
  lib/wmsCache.ts          # lokalny cache kafelków GUGiK WMS w database/wms-cache.db + kolejka concurrency + retry
  lib/http.ts              # HttpError(status, message, details?), getUser(req)
  lib/sanitize.ts          # sanitizeForRole(data, role) — głębokie usuwanie pól wrażliwych dla contractor
  lib/constants.ts         # LOCK_TIMEOUT_MINUTES = 5, CONTRACTOR_ID, TASK_SUBCATEGORIES, TREE_STATUS_FOR_CATEGORY, TASK_NEWEST_FIRST_ORDER
  lib/treeCode.ts          # nextTreeCode(type, year?) -> D{n}/{rok}, K{n}/{rok}
  middleware/currentUser.ts  # x-user-id -> req.user (401)
  middleware/requireRole.ts  # requireRole('official') (403)
  scripts/db-reset.ts      # npm run db:reset — wykonuje database/init.sql + seed BDOT10k + applyDatabaseFixes()
  scripts/map-prefetch.ts  # npm run map:prefetch — pobiera wyprzedzająco kafelki WMS dla Płocka do database/wms-cache.db
  seeds/bdot10kEnricher.ts # Osoba A: parser KML BDOT10k (Płock, TERYT 1462) + deterministyczne wzbogacanie danych
  seeds/databaseFixes.ts   # trwałe korekty danych: applyDatabaseFixes(), REMOVED_TREE_CODES/IDS, FORCED_GREEN_TREE_CODES/IDS
  routes/users.ts          # Branch 0: GET /api/users (bez nagłówka)
  routes/wms.ts            # lokalny serwer kafelków GET /api/wms/:layer i GET /api/wms/stats (bez nagłówka)
  routes/species.ts        # Branch 0: GET /api/species?q=&type=
  routes/geocode.ts        # Osoba A: GET /api/geocode/reverse, /api/geocode/suggest (ULDK + UUG GUGiK)
  routes/uploads.ts        # Branch 0: POST /api/uploads (multer -> server/uploads/)
  routes/trees.ts          # Osoba A: GET/POST /api/trees, PATCH/DELETE /api/trees/:id, POST /api/trees/warranty-tasks, POST /api/trees/seed-bdot10k, POST /api/trees/:id/tasks
  routes/tasks.ts          # GET /api/tasks, POST /api/tasks/bulk, POST /api/tasks/:id/(submit|complete|lock|unlock|approve|reject)
```

Konwencje serwera:
- Handlery mogą rzucać `HttpError` (także w middleware) — Express 5 sam przekazuje wyjątki do globalnego handlera w `app.ts`. Błędy `CHECK`/`FOREIGN KEY` z SQLite zamieniane są na `400`.
- Kod SQL zawsze przez `queryAll/queryOne/execute` z parametrami nazwanymi (`{ id }` ↔ `:id`).
- Każda odpowiedź z drzewami/zadaniami przechodzi przez `sanitizeForRole(data, getUser(req).role)`.

---

## 6. Model danych (skrót — pełny schemat w `database/init.sql`)

- `users(id uuid, full_name, role 'official'|'contractor', device 'desktop'|'tablet')`
- `species_dictionary(id int, type 'tree'|'shrub', polish_name, latin_name, cultivar)` — 100 rekordów z CSV
- `trees(id uuid, code unique, type, species_id → species_dictionary, latitude, longitude, address, plot_number, parcel_geometry, planting_year nullable, is_from_decision 0|1, decision_number, status, contractor_id → users, contract_number*, contract_scan_url*, funding_source*, notes, created_by, created_at, updated_at)`
- `tasks(id uuid, tree_id → trees, category, subcategory, status, assigned_to → users, created_by → users, contract_number*, contract_scan_url*, description, contractor_comment, contractor_photo_url, completed_at, official_rejection_reason, reviewed_by, reviewed_at, locked_by → users, locked_at, created_at, updated_at)`
- Typy SQLite: `TEXT` (uuid, daty ISO, enumy), `INTEGER`, `REAL` (współrzędne); tabele `STRICT`.
- Integralność w bazie: CHECK na enumy, parę kategoria/podkategoria, format kodu `D{n}/{rok}`/`K{n}/{rok}`, wymagany powód odrzucenia, spójność `locked_by`/`locked_at`; FK z `ON DELETE`; trigger aktualizujący `updated_at`.

`*` = pola wrażliwe, nigdy nie wysyłane do roli `contractor`.

---

## 7. Struktura klienta i podział pracy

```
client/src/
  main.tsx, index.css        # Branch 0: Tailwind v4 (@import 'tailwindcss'), alias '@/' -> src/
  app/App.tsx                # Branch 0: routing (react-router): / , /official, /official/list, /official/queue, /contractor
  app/CurrentUserContext.tsx # Branch 0: useCurrentUser(), login/logout, sessionStorage, homePathForRole()
  app/RequireRole.tsx        # Branch 0: ochrona tras wg roli
  app/layouts/               # Branch 0: OfficialLayout (header + nawigacja), AppBrand
  app/pages/RoleSelectPage.tsx   # Branch 0: ekran wyboru 3 kont
  app/pages/OfficialMapPage.tsx  # Osoba A: strona mapy urzędnika (sidebar na filtry + TreeMap)
  lib/api.ts                 # Branch 0: api.get/post/patch/delete/upload, ApiError, assetUrl(); x-user-id automatycznie
  lib/utils.ts               # Branch 0: cn(), formatDateTime(); Osoba A: taskActivityAt(), compareTasksNewestFirst()
  hooks/useRealtimePolling.ts # Osoba A: globalny polling w tle co 3.5 s + reconcileById(), keepIfEqual()
  types/domain.ts            # Branch 0: typy + etykiety PL + kolory statusów + TASK_SUBCATEGORIES + speciesLabel()
  components/shared/         # Branch 0: Button (size="touch" dla tabletu), Card, Badge, FormControls (Input/Textarea/Select/Label),
                             #           Dialog, Sheet (radix), StatusDot, TabletFrame, Feedback (Spinner/ErrorMessage/EmptyState)
  features/map/              # Osoba A: TreeMap, MapLayers (Geoportal), TreeMarker, MapLegend, mapConfig, useTrees, cad/*
  features/tree-card/        # Osoba A: TreeCardSheet, TreeHeroHeader, PhotoLightbox, TreeLocationEditor, DecisionWarrantyModal, TaskCreatorForm, TaskTimeline
  features/approval-queue/   # Osoba B: ApprovalQueuePage (placeholder z Branch 0) -> kolejka, MUTEX, approve/reject
  features/contractor/       # Osoba B: ContractorPage (ramka tabletu + mapa z Branch 0) -> lista zadań, zgłaszanie wykonania
  features/export-and-list/  # Osoba B: TreesListAndExportView (/official/list) — tabela, wykres gatunków, eksporty, wycinek mapy do PDF
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

## Architektura: Moduły Osoby A (GIS & Karta Drzewa)

Każdy element to osobny, wymienialny moduł (Feature-Sliced Design) w `client/src/features/map/` oraz `client/src/features/tree-card/` + osobne routery serwera (`geocode.ts`, `trees.ts`). Nie dopisujemy logiki do `TreeMap.tsx` / `OfficialMapPage.tsx` poza montowaniem modułów.

### Zmiany w schemacie bazy danych (`database/init.sql` — tabela `trees`)
- `planting_year`: kolumna `INTEGER` jest nullable (`CHECK (planting_year IS NULL OR planting_year BETWEEN 1800 AND 2100)`); gdy w formularzu zaznaczono „Nieznany rok posadzenia”, zapisywana jest wartość `NULL` (w UI wyświetlana jako `"Nieznany"`).
- `is_from_decision`: `INTEGER NOT NULL DEFAULT 0 CHECK (is_from_decision IN (0, 1))` — flaga określająca, czy roślina pochodzi z decyzji administracyjnej (nasadzenie zastępcze/kompensacyjne objęte 3-letnią gwarancją).
- `decision_number`: `TEXT` (opcjonalny numer decyzji administracyjnej, np. `WOŚ.6131.44.2023`).
- `parcel_geometry`: `TEXT` (zserializowany GeoJSON obrysu działki ewidencyjnej pobrany z ULDK, opcjonalny).
- Seed (`database/init.sql`): dodano 2 drzewa z opcją `is_from_decision = 1` (`D8/2026`, `D9/2026`, posadzone w 2023 r., którym zostało odpowiednio 11 i 23 dni do upływu 3 lat od posadzenia), aby od razu wyświetlały się w panelu alertów 3-letnich decyzji.

### Backend — `server/src/routes/geocode.ts` i `server/src/routes/trees.ts`
- `GET /api/geocode/reverse?lat=&lng=` → `{ lat, lng, address, street, house_number, plot_number, parcel_number, parcel_label, precinct, commune, geometry }` (ULDK `GetParcelByXY` + UUG `GetAddressReverse`).
- `GET /api/geocode/suggest?q=` (min. 2 znaki) → podpowiedzi ulic z tabeli `trees` + adresów z GUGiK UUG `GetAddress`.
- `POST /api/trees` (`official`):
  - odrzuca status początkowy `'red'` („Do wycinki”) — dozwolone wyłącznie `'green'` („Istniejące / Zdrowe”) lub `'blue'` („Do posadzenia”),
  - obsługuje `planting_year: null` („Nieznany rok posadzenia”), `is_from_decision`, `decision_number`, `parcel_geometry`, `contractor_id`,
  - gdy wybrano status początkowy `'blue'` („Do posadzenia / nowe nasadzenie”, lub `assign_planting_task: true`), w tej samej transakcji automatycznie przypisuje wybranego wykonawcę i tworzy zadanie z kategorii `'nasadzanie'` z podkategorią `'posadzenie'` (**Nasadzanie: Posadzenie**).
- `PATCH /api/trees/:id` (`official`):
  - częściowa aktualizacja drzewa: zmiana/przepisanie wykonawcy (`contractor_id` — aktualizuje `assigned_to` na otwartych zadaniach `assigned`/`rejected` tego drzewa, w tym ustawia `assigned_to = NULL` przy wybraniu „Nie przypisano”), aktualizacja współrzędnych `latitude`/`longitude` wraz z adresem (`address`), numerem działki (`plot_number`) i geometrią (`parcel_geometry`), edycja roku, decyzji, statusu i notatek.
- `DELETE /api/trees/:id` (`official`):
  - usuwa drzewo z bazy wraz z kaskadowym usunięciem jego zadań (`ON DELETE CASCADE`).
- `POST /api/trees/warranty-tasks` (`official`):
  - masowo generuje pakiet zadań kontroli gwarancyjnej (`category = 'pielegnacja'`, `subcategory = 'przycinanie'`) dla drzew z opcją `Z DECYZJI: TAK` przed upływem 3 lat od posadzenia oraz zmienia ich status na `'yellow'`.

### Seeder BDOT10k — `server/src/seeds/bdot10kEnricher.ts` + `database/plock_bdot10k_trees.kml`
Wyizolowany moduł (bez logiki HTTP) zasilający bazę prawdziwymi lokalizacjami drzew z BDOT10k dla Płocka (`TERYT 1462`, zbiór `drzewa_dbdot10k`) i uzupełniający kolumny biznesowe, których BDOT10k nie ma.
- **Źródło:** `database/plock_bdot10k_trees.kml` (65 punktów: Stare Miasto, Śródmieście, Radziwie, Góry, Podolszyce, Łukasiewicza, Międzytorze, Borowiczki). Ścieżka w `config.bdot10kKmlPath`. Nowe punkty = nowe `<Placemark>` dopisywane **na końcu** pliku (id zależą od pozycji).
- **Parser** `parseKmlPoints(kml)`: regex po `<Placemark>…<Point><coordinates>lng,lat[,alt]</coordinates>` — w KML **pierwsza liczba to `lng`, druga `lat`**; odrzuca niepoprawne i zduplikowane współrzędne. Bez zależności XML.
- **Wzbogacanie** `enrichBdot10kPoints(points, now)` — czysta funkcja, deterministyczna (PRNG `mulberry32` ze stałym ziarnem + dokładne kwoty metodą największych reszt, potem tasowanie):
  - `type`: 80% `tree` / 20% `shrub`; gatunki z puli id słownika (lipy, klony, dęby, platany, brzoza pożyteczna, jarzęby…; krzewy: hortensje, tawuły, berberys, dereń…). Seeder sprawdza zgodność `species_dictionary.type`.
  - `code`: numeracja **kontynuuje globalną sekwencję prefiksu** (po `MAX` numeru z wszystkich lat), rok w kodzie = `planting_year` (dla `null` bieżący rok), np. `D10/2024`, `D15/2025`, `K2/2025`.
  - `planting_year`: 2023–2026 + kilka `null` („Nieznany”); `blue` = bieżący rok. `created_at` leży w roku posadzenia.
  - `status`: 70% `green` / 12% `yellow` / 10% `blue` / 8% `red` (dla 65 punktów: 46/8/6/5).
  - `is_from_decision` + `decision_number` (`WKS-I.6131.{n}.{rok}.{inicjały}`): ~25% drzew (bez `red`). **6 drzew „alertowych”**: `planting_year` = rok sprzed 3 lat, `created_at = now − 3 lata + 3…28 dni` (np. dla startu 17.10.2026 → 20.10–14.11.2023), więc trafiają do `DecisionWarrantyModal` (okno 31 dni) i `POST /api/trees/warranty-tasks`. Pozostałe drzewa z decyzji mają rok ≥ bieżący − 2 (nie zaśmiecają alertów). `notes` zawiera „decyzja …” (heurystyka listy Osoby B też je rozpozna).
  - `contract_number` / `contract_scan_url`: wg roku (`UM/ZIEL/12/2026`, `UM/NAS/08/2025`, `UM/UTR/03/2024`, `UM/GWAR/19/2023` — decyzje zawsze GWAR), skany z `client/public/demo/contracts/`; `funding_source`: Budżet Obywatelski Płock / Program Zielony Płock - ORLEN / Fundusz Ochrony Środowiska / Środki bieżące Gminy Płock.
  - `address` + `plot_number`: osiedle wg reguł prostokątów współrzędnych (`DISTRICTS`), format `"{ulica} {nr}, {osiedle}, Płock"` (zgodny z `streetFromAddress`), działka `146201_1.{obręb}.{nr}[/{n}]`. Adresy/obręby są symulacją, nie danymi z ULDK.
  - `tasks` (wszystkie `assigned_to = CONTRACTOR_ID`, zgodne z regułami kolorów z §3): `red` → wycinka `assigned` ×3, potem `rejected`; `yellow` → `pending_approval` ×4 (w tym 1× Nasadzanie: Korowanie), potem pielęgnacja `assigned`; `blue` → Posadzenie `assigned` ×4, potem Palikowanie `rejected`; `green` → historia `approved` (co 3. roślina + Posadzenie dla drzew alertowych). Zadania wykonane mają zdjęcie z `/demo/photos/*.svg` i komentarz, odrzucone — powód.
- **Zapis** `seedBdot10k()`: jedna transakcja; deterministyczne id (`bd010000-1462-4000-8000-{nr}` dla roślin, `bd01aaaa-1462-…` dla zadań) → **idempotentny**: istniejące punkty są pomijane, ponowne wywołanie przywraca tylko usunięte. Zwraca `{ source, teryt, parsed_points, inserted_trees, inserted_tasks, skipped_existing, total_trees, warranty_alert_trees }`.
- **Wywołania:** `seedBdot10kIfSparse()` przy starcie serwera (`index.ts`) i po `npm run db:reset`, gdy w bazie jest < `BDOT10K_MIN_TREES = 40` roślin (świeży `init.sql` ma 9 → po seedzie 72, bo 2 punkty BDOT10k są trwale usunięte — patrz niżej); ręcznie: `POST /api/trees/seed-bdot10k` (`official`).
- **Pomijanie / korekty w seederze:** seeder pyta `isRemovedTree(id, code)` i `isForcedGreenTree(id, code)` z `seeds/databaseFixes.ts`. Usunięte punkty nie są wstawiane ani przywracane, ale **nadal zużywają swój numer kodu**, więc kody pozostałych roślin się nie przesuwają. Rośliny wymuszone na zielono dostają `status = 'green'`, a ich zadania są zamykane jako `approved` (`approveSeedTask()`: zdjęcie demo, komentarz, `reviewed_*`).

### Migracja czyszcząca bazę — `server/src/seeds/databaseFixes.ts` (`fix/search-by-code-db-cleanup-and-dblclick-zoom`)
- `applyDatabaseFixes()` — jedna transakcja, idempotentna (drugie wywołanie nic nie zmienia), wołana w `index.ts` przy każdym starcie serwera (po seedzie BDOT10k, log `[db-fixes]` tylko gdy coś zmieniła) oraz w `scripts/db-reset.ts`. Zwraca `{ removed_trees, greened_trees, approved_tasks }`.
- **Trwałe usunięcie:** `DELETE FROM trees WHERE code IN ('D4/2026', 'D18/2023', 'D60/2026') OR id IN (…)` — zadania znikają kaskadowo (`ON DELETE CASCADE`). Id (`REMOVED_TREE_IDS`: `aaaaaaaa-…-0004` z `init.sql`, `bd010000-…-000000000010` i `…-000000000063` z BDOT10k) są potrzebne, bo kody BDOT10k zależą od daty seedowania. `D4/2026` (i jego zadanie wycinki) usunięto też z `database/init.sql`.
- **Wymuszony status zielony:** `D32/2026`, `D39/2026` (`FORCED_GREEN_TREE_CODES`) → otwarte zadania (`assigned`, `pending_approval`, `rejected`) przechodzą w `approved` (`completed_at`/`reviewed_at`/`reviewed_by` uzupełnione, blokada MUTEX i powód odrzucenia wyczyszczone), potem `UPDATE trees SET status = 'green'`. Dzięki zamknięciu zadań żadna reguła z §3 nie przywróci koloru żółtego/czerwonego/niebieskiego.
- Kolejna trwała korekta danych = nowy wpis w listach w `databaseFixes.ts` (seeder respektuje je automatycznie) — nie edytuj ręcznie bazy.

### Wyszukiwanie po kodzie ewidencyjnym (`code`) i adresie — jedno pole w obu widokach
Gatunku NIE wyszukuje się w tym polu — służy do tego wyłącznie osobny filtr „Gatunek” poniżej (`species_id` / `speciesId`).
- **Mapa urzędnika** (`features/map/AddressAutocomplete.tsx`, placeholder „Kod (D32/2026) lub adres…”): podpowiedzi z `GET /api/geocode/suggest` — kolejność: rośliny po prefiksie kodu (ikona `#`, maks. 5, opis: gatunek • adres), ulice z ewidencji, adresy GUGiK; łącznie maks. 8. Wybór ustawia `filters.address = filter_value` (kod / ulica), więc `GET /api/trees?address=` zwraca dopasowane punkty; `OfficialMapPage` robi `flyTo` — dla `source === 'plant'` z zoomem `PLANT_SEARCH_ZOOM = 20` bezpośrednio nad roślinę.
- **Lista / Eksport** (`features/export-and-list/AddressAutocomplete.tsx`, etykieta „Kod / ulica”): podpowiedzi budowane lokalnie z ewidencji (kody → ulice), filtr działa już w trakcie pisania. Dopasowanie w jednym miejscu: `treeMatchesSearch(tree, query)` / `codeMatchesSearch(code, query)` w `listFilters.ts` (prefiks kodu bez spacji, adres; bez polskich znaków i wielkości liter) — tabela, wykres gatunków i eksporty korzystają z tego samego `applyListFilters`. Pole w `ListFilters` nadal nazywa się `address` (zgodność wsteczna).
- Reguła prefiksu kodu jest taka sama na serwerze i w kliencie — przy zmianach aktualizuj obie strony.

### Dwuklik na markerze rośliny — `client/src/features/map/useTreeMarkerHandlers.ts`
- `useTreeMarkerHandlers(tree, onClick?)` zwraca `eventHandlers` dla `<Marker>`: `click` → `onClick(tree)` (np. otwarcie Karty Ewidencyjnej) **opóźnione o 250 ms** (`SINGLE_CLICK_DELAY_MS`) — inaczej otwarta karta (niemodalny `Sheet` po prawej) przechwytuje drugie kliknięcie i dwuklik na roślinach z prawej części mapy nie działa; `dblclick` anuluje oczekujące kliknięcie (karta się nie otwiera/nie przełącza), robi `L.DomEvent.stopPropagation(e)` i `flyTo` z zoomem `Math.max(map.getZoom(), 19)` (0.8 s) tak, by roślina trafiła na **środek widocznej części mapy** — `sidePanelOcclusion()` odejmuje szerokość paneli `[role="dialog"]` zasłaniających lewą/prawą krawędź mapy (np. Karta Ewidencyjna). `stopPropagation` blokuje wbudowany `doubleClickZoom` Leafleta.
- Używany przez `TreeMarker` (Osoba A) i `CompletedTreeMarker` (wykonawca, zakładka „Wykonane”) — każdy nowy marker rośliny powinien korzystać z tego hooka zamiast własnych handlerów.

### Live polling i sortowanie „najnowsze na górze” (`feat/live-polling-and-newest-first-sort`)
- **Globalny mechanizm pollingu:** `client/src/hooks/useRealtimePolling.ts` — `useRealtimePolling(poll, { intervalMs = REALTIME_POLL_MS (3500), enabled })`. Ciche odświeżanie w tle co **3.5 s**; kolejny cykl startuje dopiero po zakończeniu poprzedniego (brak nakładających się żądań); stop, gdy `document.visibilityState === 'hidden'`, natychmiastowe odświeżenie po powrocie do karty. Hook nie robi pierwszego pobrania (robi to hook danych). Nie dodawaj własnych `setInterval` — używaj tego hooka.
- **Aktualizacja bez resetowania UI:** poll nie włącza spinnera (`loading`), a stan scala się helperami z tego samego pliku: `reconcileById(prev, next)` (niezmienione elementy zachowują tożsamość → markery/wiersze się nie przerysowują; brak zmian = brak re-renderu) i `keepIfEqual(prev, next)` (obiekty bez `id`, np. karta drzewa). Modale, formularze, scroll i stan mapy (zoom/przesunięcie) zostają nietknięte.
- **Gdzie działa:**
  - Mapa główna (`OfficialMapPage`): `useTrees(filters, { live: true })` (oba zapytania: wszystkie + przefiltrowane) — kolory markerów zmieniają się w tle; `TreeMap` nie robi `fitBounds`, więc zoom i przesunięcie zostają. `useTrees()` bez opcji nie polluje (opt-in).
  - Karta Drzewa (`useTreeDetails`): polling `GET /api/trees/:id`, gdy karta jest otwarta (`treeId !== null`) — nowe zgłoszenie wykonawcy ze zdjęciem i status pojawiają się po ≤ 3.5 s. `setDetails()` z hooka (wynik PATCH/POST) unieważnia trwające żądanie pollingu, żeby starsze dane nie nadpisały świeżej mutacji.
  - Kolejka zatwierdzeń (`useApprovalQueue`, `QUEUE_POLL_MS = REALTIME_POLL_MS`), widok listy (`useInventoryData`: drzewa + `GET /api/tasks`) oraz lista zadań wykonawcy (`ContractorPage`: zadania + drzewa).
- **Standard sortowania `DESC` (backend):** wszystkie listy zadań (`GET /api/tasks`, w tym kolejka `?status=pending_approval`, oraz historia `tasks` w `GET /api/trees/:id`) sortowane przez wspólną stałą `TASK_NEWEST_FIRST_ORDER` z `server/src/lib/constants.ts`: `ORDER BY COALESCE(k.completed_at, k.reviewed_at, k.created_at) DESC, k.created_at DESC, k.id`. Nowe zapytania o zadania (alias `k`) używają tej stałej.
- **Standard sortowania `DESC` (frontend):** `compareTasksNewestFirst` / `taskActivityAt` w `client/src/lib/utils.ts` (ten sam klucz co serwer). Kolejka zatwierdzeń: nowo zgłoszone zadania zawsze na samej górze; „Dziennik pielęgnacji i historia prac” (`TaskTimeline`): od najnowszego wpisu na górze do najstarszego na dole.

### Warstwy mapy (`mapConfig.ts`, `MapLayers.tsx`, `GeoportalWms.tsx`)
- Podkłady: **Mapa Uliczna (GUGiK BaseMap, domyślna)** i **Ortofotomapa HD**; TOPO usunięte. `minZoom={10}`, `maxZoom={21}`.
- Nakładki: KIEG (działki/budynki), **KIUT** (uzbrojenie terenu), CAD lokalny.
- `GeoportalWms.tsx` — wspólny `WMSTileLayer` z ponawianiem kafli (`tileerror`), reużywany przez moduły.

### Komponenty klienta — Mapa (`client/src/features/map/`)
| Plik | Rola |
|------|------|
| `KiutOverlay.tsx` | warstwa KIUT w `LayersControl` + przycisk "Uzbrojenie terenu: Rury / Gaz / Prąd" + legenda (żółty = gaz, niebieski = wodociąg, brązowy = kanalizacja, czerwony = prąd); renderowany wewnątrz `<LayersControl>` |
| `ParcelHighlighter.tsx` | rysuje obrys działki (GeoJSON) — `geometry` z `/api/geocode/reverse` lub zapisanego `parcel_geometry` |
| `useReverseGeocode.ts` | hook + typy odpowiedzi geokodera (cache po współrzędnych) |
| `ViewportStatsWidget.tsx` | pływający licznik w lewym dolnym rogu: "W widoku" (`map.getBounds()`) vs "Wg filtra" |
| `AddressAutocomplete.tsx` | jedna wyszukiwarka (na górze filtrów): kod rośliny (`D32/2026`), ulica, adres GUGiK (bez gatunków); wybór → filtr `address` + `flyTo` (dla kodu zoom 20) |
| `useTreeMarkerHandlers.ts` | wspólne `eventHandlers` markerów: `click` → `onClick(tree)`, `dblclick` → płynny `flyTo` nad roślinę (zoom ≥ 19, środek widocznej części mapy obok Karty Drzewa) |
| `MapFlyTo.tsx` | `flyTo` na `FlyTarget` (z `nonce`) |
| `MapFiltersPanel.tsx` | komplet filtrów w lewym panelu: adres, status, typ, gatunek, rok, kategoria zadań, wykonawca |
| `MapFilterBar.tsx` | pasek nad mapą: licznik + przycisk **"Alerty Decyzji (3 lata)"** z licznikiem + przycisk **"Dodaj roślinę"** |
| `AddTreeDialog.tsx` | formularz dodawania rośliny: status początkowy tylko `green`/`blue` (bez `red`), checkbox „Nieznany rok posadzenia” (`null`), automatyczne zlecenie zadania **Nasadzanie: Posadzenie** dla wybranego wykonawcy przy statusie „Do posadzenia” (`blue`), sekcja „Z DECYZJI” + nr decyzji |
| `CursorModeToolbar.tsx` | pływający pasek wyboru trybu kursora na mapie Urzędnika: **Pojedynczy** (`single`, `MousePointer`), **Punktowo wiele** (`multi_point`, `CheckSquare`), **Przestrzennie kwadratem** (`spatial_box`, `SquareDashedMousePointer`) + licznik „Zaznaczono: X roślin” i przycisk „Wyczyść zaznaczenie” |
| `SpatialBoxSelector.tsx` | dziecko `<TreeMap>`: w trybie `spatial_box` wyłącza przeciąganie mapy, pozwala narysować kursorem prostokąt zaznaczający (`Rectangle`) i dodaje do zaznaczenia wszystkie widoczne rośliny znajdujące się wewnątrz wykreślonego obszaru |

### Komponenty klienta — Karta Drzewa (`client/src/features/tree-card/`)
| Plik | Rola |
|------|------|
| `TreeCardSheet.tsx` | główny kontener Karty Ewidencyjnej w `Sheet`; wyświetla na górze szybki przycisk przejścia do Kolejki Zatwierdzeń (`/official/queue?taskId=...`), jeśli drzewo ma zadanie `pending_approval` |
| `BulkSelectionDrawer.tsx` | prawy panel (`Sheet`, `modal={false}`) dla zaznaczenia wielu roślin: skrócona lista zaznaczonych punktów z odznaczaniem (`X`), rozwijany szybki podgląd każdego drzewa (`Eye` / `ChevronDown`: działka, umowa, ostatnie prace, miniatury zdjęć w `PhotoLightbox`, „Pokaż na mapie”) bez utraty zaznaczenia grupowego oraz formularz zbiorczego zlecania zadania (`POST /api/tasks/bulk`) |
| `TreeHeroHeader.tsx` | nagłówek Karty Drzewa; jeśli drzewo ma w historii zatwierdzone zadanie (`approved`) ze zdjęciem, najnowsze zatwierdzone zdjęcie staje się tłem nagłówka (hero image z ciemnym gradientem pod białym tekstem i przyciskiem powiększenia) |
| `PhotoLightbox.tsx` | pełnoekranowy modal (Lightbox) do powiększania zdjęć z historii prac oraz nagłówka karty wraz z datą wykonania, wykonawcą i opisem |
| `TreeLocationEditor.tsx` | moduł edycji dla Urzędnika w Karcie Drzewa: dropdown „Zmień wykonawcę” (`PATCH /api/trees/:id`), przycisk „Przesuń punkt na mapie” (wskazanie nowego punktu na mapie → automatyczne pobranie nowego adresu i działki z `/api/geocode/reverse` + `PATCH /api/trees/:id`) oraz przycisk „Usuń drzewo” z modalem potwierdzenia (`DELETE /api/trees/:id`) |
| `DecisionWarrantyModal.tsx` | modal otwierany przyciskiem „Alerty Decyzji (3 lata)” na pasku Urzędnika: lista drzew z opcją `Z DECYZJI: TAK`, którym został miesiąc (lub mniej) do upływu 3 lat od posadzenia, podgląd i wysyłka przypomnienia e-mail oraz przycisk „Wygeneruj pakiet zadań kontrolnych dla wykonawców” (`POST /api/trees/warranty-tasks`) |
| `TaskCreatorForm.tsx` | formularz zlecania nowego zadania dla wybranego drzewa (`POST /api/trees/:id/tasks`) |
| `TaskTimeline.tsx` | oś czasu historii prac z klikalnymi miniaturami zdjęć otwierającymi `PhotoLightbox` |

---

## 8. Konwencje kodu
- TypeScript `strict`. Bez `any` (wyjątkowo `unknown` + zawężanie).
- Nazwy kolumn/pól API w `snake_case` (1:1 z bazą), nazwy zmiennych/komponentów w `camelCase`/`PascalCase`.
- UI w języku polskim; kod, identyfikatory i nazwy plików po angielsku.
- Statusy, kategorie i kolory w jednym miejscu: `client/src/types/domain.ts` i `server/src/lib/constants.ts`.
- Komponenty w stylu shadcn/ui (Tailwind + `class-variance-authority` + `clsx`/`tailwind-merge` przez `cn()`), ikony `lucide-react`.
- Obsługa błędów: każdy endpoint w `try/catch`, sensowne kody HTTP (400/401/403/404/409/500).
- Nie generuj kodu poza zakresem bieżącego branchu bez pytania.

---

## Architektura: Moduły Osoby B (Wykonawca & Eksporty)

Moduły z branchy `feat/contractor-isolation-and-visual-badges` i `feat/list-view-and-advanced-exports`. Zasada: jedna odpowiedzialność na plik, logika filtrowania w hookach, UI w małych komponentach.

### Wspólne oznaczenia roślin i zadań — `client/src/components/shared/PlantBadge.tsx`
Zamiast surowych zapisów typu `D6 · Dąb` używaj wyłącznie tych komponentów (listy zadań, kolejka urzędnika, dialogi, karty):
- `PlantBadge({ type, code, size? })` — `[Drzewo • D6/2026]` (ikona `TreeDeciduous`, zielono-szmaragdowy) albo `[Krzew • K6/2026]` (ikona `Sprout`, fioletowo-niebieski).
- `TaskCategoryChip({ category, subcategory, size? })` — kolorowy chip rodzaju pracy: Pielęgnacja (bursztynowy, `Leaf`), Wycinka (czerwony, `Axe`), Nasadzanie (błękitny, `Shovel`); np. `Pielęgnacja: Podlewanie`, a dla `wycinka/wycinka` samo `Wycinka`.
- `PlantIdentity({ type, code, speciesPolishName, speciesCultivar?, speciesLatinName?, size? })` — `PlantBadge` + czytelna pełna nazwa gatunku (przez `speciesLabel()`), opcjonalnie łacina.
- Rozmiary `sm | md | lg` (`lg` dla tabletu). Kolory i etykiety biorą się z `types/domain.ts` — nie duplikuj ich.

### Izolacja mapy wykonawcy per aktywny Tab — `client/src/features/contractor/useContractorMapFilter.ts`
`useContractorMapFilter({ tasks, trees, userId, tab })` zwraca `{ todoTasks, doneTasks, tabTasks, mapTrees, markerVariant, taskForTree }`:
- Najpierw izolacja: tylko zadania z `assigned_to === currentUser.id` (serwer filtruje to samo w `GET /api/tasks`; hook jest drugą warstwą).
- `TAB_STATUSES`: tab `todo` = `assigned` + `rejected`, tab `done` = `pending_approval` + `approved`.
- `mapTrees` = rośliny z `GET /api/trees`, które mają co najmniej jedno zadanie z aktywnego taba. Inne drzewa miasta nie trafiają na mapę wykonawcy.
- `markerVariant`: `todo` → `'status'` (zwykłe `TreeMarker`, kolor wg `trees.status`, standardowa `MapLegend`); `done` → `'completed'` — `ContractorPage` podaje `TreeMap` pustą listę `trees` i renderuje jako dzieci `CompletedTreeMarker` (jednolity stalowo-morski `#2f7f86` z ✓, CSS w `contractor-map.css` rozszerza `.tree-marker`) oraz `CompletedMapLegend` zamiast legendy statusów.
- `taskForTree(treeId)` — klik w marker zaznacza odpowiadające mu zadanie z aktywnego taba. Zmiana taba czyści zaznaczenie.
- Po „Zgłoś wykonanie” widok zostaje na zakładce „Do wykonania” (nie przeskakuje na „Wykonane”) — zgłoszone zadanie po prostu znika z listy.
- Moduł mapy Osoby A (`features/map/*`) nie zna ról ani tabów — wykonawca korzysta tylko z publicznych propsów `TreeMap` (`trees`, `selectedTreeId`, `onTreeClick`, `showLegend`, `children`).

### Live-sync i sortowanie zadań wykonawcy — `client/src/features/contractor/useContractorLiveTasks.ts`
`useContractorLiveTasks({ userId, tab, intervalMs? })` to jedyne źródło danych widoku wykonawcy (laptop `/contractor` i iPad `/ipad` — oba renderują `ContractorPage`). Zwraca to samo co `useContractorMapFilter` plus `{ error, loaded, reload }`.
- **Polling co 2 s** (`CONTRACTOR_POLL_INTERVAL_MS = 2000`): równolegle `GET /api/tasks` + `GET /api/trees`. Działa cicho — bez spinnera, bez czyszczenia danych przy błędzie, bez nakładających się żądań (`inFlight`), pauzuje przy ukrytej karcie (`document.hidden`) i odświeża od razu po powrocie. Stan zmienia się tylko, gdy payload faktycznie się zmienił (porównanie JSON), więc otwarty modal „Wykonaj zadanie”, wpisany komentarz, zaznaczenie i pozycja mapy nie są resetowane.
- **Sortowanie DESC (najnowsze na górze)** — `sortTasksNewestFirst()` / `taskSortTime()`: „Do wykonania” (`assigned` + `rejected`) wg `reviewed_at` (dla zwróconych do poprawy) lub `created_at`; „Wykonane / W weryfikacji” (`pending_approval` + `approved`) wg `completed_at`. Remis rozstrzyga `id`. Sortowanie jest przed `useContractorMapFilter`, więc `taskForTree` i listy zachowują kolejność.
- Efekt: nowe zadanie zlecone / odrzucone przez urzędnika pojawia się na górze listy i na mapie wykonawcy w ≤2 s. Po „Zgłoś wykonanie” `ContractorPage` woła `reload()`.

### Feedback przy odrzuceniu
- **Urzędnik** — `client/src/features/approval-queue/RejectionReasonField.tsx`: po kliknięciu „Odrzuć / Do poprawy” w `ReviewDialog` pokazuje się pole „Opisz dokładnie, co zostało wykonane nieprawidłowo (informacja dla wykonawcy)” oraz chipy `REJECTION_HINTS` (np. „Brak wymaganej warstwy kory”, „Niewystarczające podlanie”, „Krzywo wbity palik”, „Nieprawidłowe zdjęcie”). Chip dopisuje lub usuwa swoją linię w treści; wysyłany jest zwykły tekst w `POST /api/tasks/:id/reject { reason }`.
- **Wykonawca** — `client/src/features/contractor/RejectionFeedbackBox.tsx` (`{ task, onShowOnMap?, className? }`): statyczna karta informacyjna z uwagami urzędnika dla zadań `rejected` na liście i w dialogu wykonania (stonowane tło bursztynowo-żółte `bg-amber-50/90`, lewy pasek akcentujący `border-l-4 border-amber-500`, nagłówek `text-amber-900` z ikoną `AlertTriangle` w kolorze `text-amber-600`, subtelny konturowy przycisk „Pokaż na mapie”). W `TaskList.tsx` główny przycisk akcji na dole karty („Popraw i wykonaj ponownie”) jest czerwony (`variant="destructive"`), dzięki czemu wyraźnie odcina się od bursztynowo-żółtej notatki urzędowej.
- Serwer (`routes/tasks.ts`, `TASK_LIST_SQL`) dołącza do każdego wiersza `GET /api/tasks` pola `tree_plot_number` oraz `reviewed_by_name` (join `users` po `reviewed_by`). Pola wrażliwe są dalej usuwane przez `sanitizeForRole`.

### Tryb „Lista Drzew, Analizy i Eksport” — `client/src/features/export-and-list/`
Całkowicie niezależny moduł (nie modyfikuje `features/map/*`; z modułu Osoby A używa tylko `TreeMap`, `useTrees`, `mapConfig`).
- **Nawigacja** w `OfficialLayout`: jedno segmentowe menu „Mapa Interaktywna” (`/official`) · „Lista Drzew, Analizy i Eksport” (`/official/list`, route w `App.tsx`) · „Kolejka zatwierdzeń”; po prawej awatar z inicjałami, imię i rola oraz „Zmień konto”.
- **Wygląd** (`listUi.tsx`): wspólne klasy paneli (`PANEL_CLASS` — `rounded-2xl`, miękki cień), pól filtrów (`FIELD_CLASS`), etykiet (`FIELD_LABEL_CLASS`) i nagłówek panelu `PanelHeader` (ikona w kafelku + tytuł + opis + `aside`). Nowe panele widoku listy buduj z tych klas zamiast `Card`.
- **Dane** (`useInventoryData`): `GET /api/trees` bez filtrów + `GET /api/tasks`; filtrowanie tabeli odbywa się po stronie klienta (natychmiastowe). `toListTrees()` (`inventoryModel.ts`) dokłada pola pochodne (nie ma ich w bazie): `street` (adres bez numeru, np. „ul. Tumska”), `species_label`, `from_decision`, `decision_ref`.
- **„Z decyzji”** — heurystyka bez zmian w schemacie: roślina jest „z decyzji”, jeśli `trees.notes` lub opis któregoś z jej zadań zawiera numer decyzji (`decyzja WOŚ.6131.12.2026` → `decision_ref = 'WOŚ.6131.12.2026'`) albo frazy „decyzj…”, „nasadzenie zastępcze”, „zezwolenie na usunięcie”. Jeśli kiedyś dojdzie kolumna w bazie, podmień tylko `detectDecision()`.
- **Filtry** (`listFilters.ts` + `ListFilterBar.tsx`): pole „Kod / ulica” z autouzupełnianiem (`AddressAutocomplete.tsx`, podpowiedzi kodów `D32/2026` i ulic z licznikiem roślin, wyszukiwanie bez polskich znaków, `treeMatchesSearch()`), gatunek, rok posadzenia, wykonawca (także „bez wykonawcy”), typ, status (chipy), decyzja (Wszystkie / Z decyzji / Bez decyzji). `describeListFilters()` daje opis filtrów do nagłówków raportów.
- **Tabela** (`TreesDataTable.tsx`): sortowanie po kolumnach (kody naturalnie: D2 < D10, puste wartości zawsze na końcu), checkboxy (z „zaznacz wszystkie widoczne”), przypięty do prawej przycisk „Pokaż na mapie” (flyTo na osadzonej mapie `ListMapPanel`). Klik w marker przewija tabelę do wiersza.
- **Wykres** (`SpeciesFrequencyChart.tsx`): SVG bez bibliotek, OX = gatunki, OY = ilość wystąpień dla przefiltrowanych danych (`speciesFrequency()`), max 20 słupków, drzewa `#047857` / krzewy `#7c3aed`; klik w słupek przełącza filtr gatunku.
- **Wycinek mapy do PDF** (`MapAreaPdfSelector.tsx` jako dziecko `<TreeMap>` w `ListMapPanel`): przycisk „Zaznacz obszar na mapie do PDF” → przeciągnięcie prostokąta (na czas rysowania wyłączone `dragging`/`boxZoom`, Esc anuluje) → `MapAreaPdfDialog.tsx` „Eksport wycinka mapy do PDF”: podgląd zdjęcia, lista roślin w prostokącie, wybór podkładu (ORTO/TOPO) i KIEG, pole nazwy (`Mapa_Wycinek_Plock_RRRR-MM-DD.pdf`), przycisk „Wybierz miejsce zapisu i pobierz PDF”. Selector można osadzić w dowolnej `<TreeMap>` jedną linią: `<MapAreaPdfSelector trees={…} generatedBy={…} />`.
- **Zdjęcie wycinka** (`mapAreaCapture.ts`): bez zrzutu DOM — jedno żądanie WMS `GetMap` na warstwę dla dokładnego BBOX w `EPSG:3857` (usługi GUGiK mają `Access-Control-Allow-Origin: *`), rysowanie na `canvas` markerów (styl jak `TreeMarker`), podziałki, strzałki N i atrybucji. ORTO losowo zwraca 404 → do 6 ponowień, a gdy nie odpowiada, automatyczny fallback na TOPO z ostrzeżeniem (PDF podaje faktycznie użyty podkład).
- **Zapis plików** (`lib/saveFile.ts`): `saveFileWithPicker()` najpierw otwiera `window.showSaveFilePicker` (póki kliknięcie liczy się jako gest użytkownika), potem generuje plik; fallback = zwykłe pobranie (`<a download>`), także w iframe/Firefox/Safari. `buildFileName()` czyści nazwę i dokleja rozszerzenie.

### Generatory eksportu — `ExportFormatGenerators.ts` + `formats/*`
`EXPORT_FORMATS` to rejestr `{ id, label, extension, mimeType, description, pickerDescription, generate(ctx, baseName) }`; każdy generator to czysta funkcja `ExportContext → Blob` (`formats/exportTypes.ts`: `trees`, `species`, `generatedAt`, `generatedBy`, `filtersSummary`), ładowana leniwie (`import()`). **Nowy format = nowy plik w `formats/` + jeden wpis w `EXPORT_FORMATS`.** Panel `ExportPanel.tsx`: nazwa pliku (domyślnie `Raport_Zielen_Plock_RRRR-MM-DD`), zakres „Przefiltrowane (N)” / „Zaznaczone (M)”.

| Format | Plik | Zawartość |
|--------|------|-----------|
| Excel `.xlsx` | `formats/xlsx.ts` | Ręcznie budowany OOXML (ZIP przez `fflate`). Arkusz 1 „Ewidencja Roślin” (kolumny z `formats/exportColumns.ts`, autofiltr, zamrożony nagłówek, WGS84 + PL-2000, nr umowy i finansowanie — dane tylko dla urzędnika). Arkusz 2 „Wykres Gatunków OX-OY” (nazwa arkusza nie może zawierać `/`): tabela gatunek/ilość + natywny wykres słupkowy Excela (`xl/charts/chart1.xml`). |
| AutoCAD `.dxf` | `formats/dxf.ts` | ASCII DXF R12 (AC1009), warstwy `DRZEWA` (POINT + CIRCLE r=1,5 m + TEXT) i `KRZEWY` (POINT + kwadrat POLYLINE + TEXT), teksty: kod ewidencyjny + gatunek (znaki PL jako `\U+XXXX`). Współrzędne w metrach, PL-2000 strefa 7 (EPSG:2178), x = E, y = N. |
| `.dwg` | — | Zamknięty format binarny Autodesk — nie generujemy go w przeglądarce. W UI jest instrukcja: otworzyć `.dxf` w AutoCAD/BricsCAD → „Zapisz jako .dwg”. |
| GIS Shapefile `.zip` | `formats/shapefile.ts` | Point Shapefile: `.shp` + `.shx` + `.dbf` (dBASE III, UTF-8, pola ≤ 10 znaków: `KOD, TYP, GATUNEK, LACINA, ADRES, ULICA, DZIALKA, ROK, STATUS, STATUS_PL, WYKONAWCA, Z_DECYZJI, DECYZJA, LAT, LON`) + `.prj` (PUWG 1992, EPSG:2180) + `.cpg`. |
| Raport `.pdf` | `formats/pdfReport.ts` | A4 poziomo (`jspdf` + `jspdf-autotable`): nagłówek UM Płocka, filtry, podsumowanie (liczby, statusy, „z decyzji”), wektorowy wykres gatunków + tabela gatunków, tabela roślin z kolorami statusów, stopki „Strona X z N”. |
| Wycinek mapy `.pdf` | `formats/mapAreaPdf.ts` | Nagłówek UM Płocka, narożniki obszaru (WGS84 + PL-2000), zdjęcie wycinka, tabela roślin w obszarze. |

- PDF: wbudowane fonty jsPDF nie mają polskich znaków — `formats/pdfShared.ts` osadza **DejaVu Sans** (paczka `dejavu-fonts-ttf`, import `?url`, pobierany dopiero przy pierwszym eksporcie PDF). Tam też wspólny nagłówek (`drawLetterhead`), stopki i styl tabel.
- Układy współrzędnych (`lib/geodesy.ts`): odwzorowanie Gaussa-Krügera na GRS80 (PL-2000/7 i PUWG 1992), zgodne z `pyproj` z dokładnością < 1 mm.
- Zależności dodane w tym branchu (`client/package.json`): `jspdf`, `jspdf-autotable`, `fflate`, `dejavu-fonts-ttf`.

### Mapa plików Osoby B
```
client/src/components/shared/PlantBadge.tsx        # PlantBadge, TaskCategoryChip, PlantIdentity
client/src/features/contractor/
  ContractorPage.tsx           # układ tabletu, taby, spina hook z TreeMap
  useContractorMapFilter.ts    # izolacja zadań/roślin + wariant markerów per tab
  useContractorLiveTasks.ts    # polling 2 s (zadania + drzewa) + sortowanie DESC, używa useContractorMapFilter
  TaskList.tsx                 # karty zadań (PlantIdentity + TaskCategoryChip + RejectionFeedbackBox)
  RejectionFeedbackBox.tsx     # uwagi urzędnika + lokalizacja + „Pokaż na mapie”
  CompletedTreeMarker.tsx      # marker „wykonane” (✓, #2f7f86)
  CompletedMapLegend.tsx       # legenda mapy w tabie „Wykonane”
  contractor-map.css           # .tree-marker--completed, .tree-marker__check
  CompleteTaskDialog.tsx       # zgłoszenie wykonania (pokazuje też boks odrzucenia)
  types.ts                     # ContractorTask (+ tree_plot_number, reviewed_by_name)
client/src/features/approval-queue/
  ApprovalQueuePage.tsx        # kolejka + MUTEX (PlantBadge + TaskCategoryChip)
  ReviewDialog.tsx             # decyzja urzędnika
  RejectionReasonField.tsx     # pole uwag + chipy podpowiedzi
  useApprovalQueue.ts, types.ts
client/src/features/export-and-list/
  TreesListAndExportView.tsx   # główny kontener trybu „Lista Drzew, Analizy i Eksport” (/official/list)
  useInventoryData.ts          # GET /api/trees + GET /api/tasks -> ListTree[]
  inventoryModel.ts            # ListTree, toListTrees (ulica, „z decyzji”), speciesFrequency, compareTreeCodes
  listFilters.ts               # ListFilters, applyListFilters, describeListFilters, STATUS_SHORT_LABELS
  ListFilterBar.tsx            # pasek filtrów nad tabelą
  AddressAutocomplete.tsx      # wyszukiwarka ulic z podpowiedziami
  TreesDataTable.tsx           # tabela: sortowanie, checkboxy, „Pokaż na mapie”
  SpeciesFrequencyChart.tsx    # wykres słupkowy OX: gatunki, OY: ilość
  ExportPanel.tsx              # „Eksportuj przefiltrowane dane” (nazwa pliku, zakres, przyciski formatów)
  ExportFormatGenerators.ts    # rejestr formatów EXPORT_FORMATS (lazy import generatorów)
  ListMapPanel.tsx             # osadzona TreeMap (fit do filtrów, flyTo) + MapAreaPdfSelector
  MapAreaPdfSelector.tsx       # rysowanie prostokąta na mapie kursorem
  MapAreaPdfDialog.tsx         # modal „Eksport wycinka mapy do PDF”
  mapAreaCapture.ts            # WMS GetMap -> canvas + markery (zdjęcie wycinka)
  export-and-list.css          # kursor krzyżyka podczas zaznaczania
  listUi.tsx                   # PANEL_CLASS, FIELD_CLASS, FIELD_LABEL_CLASS, PanelHeader (wspólny wygląd paneli)
  formats/                     # exportTypes, exportColumns, zip, xlsx, dxf, shapefile, pdfShared, pdfReport, mapAreaPdf
  lib/                         # geodesy (PL-2000/7, PUWG 1992), saveFile (showSaveFilePicker + fallback)
```

### Tryb iPad (Web-App) — `/ipad` (branch `feat/ipad-standalone-webapp-and-keyboard-fix`)
Widok Wykonawcy jako natywnie wyglądająca aplikacja na prawdziwym iPadzie (jury), bez możliwości przelogowania.

- **Endpoint `/ipad`** (`http://<IP_SERWERA>:5173/ipad`; uruchom `npm run dev` z hostem sieciowym, iPad w tej samej sieci) — `features/contractor/IpadStandaloneApp.tsx`. Wejście automatycznie i na sztywno loguje `Jan Zieliński` (`33333333-3333-3333-3333-333333333333`, `contractor`, `device: tablet`; nadpisuje użytkownika z `sessionStorage`) i renderuje `<ContractorPage standalone header={<IpadHeader />} />` w trybie pełnoekranowym (bez `TabletFrame`).
- **`?mode=ipad`**: `IpadModeRedirect` (ten sam plik) opakowuje trasę `/` w `App.tsx` — `/?mode=ipad` przekierowuje na `/ipad`.
- **Ukryte elementy** w trybie `standalone`: pasek „Symulator tabletu wykonawcy”, przełącznik „Ramka iPad / Pełny ekran”, „Zmień konto”/wylogowanie. Zamiast nich nagłówek: logo + `Tree Monitor Field • Płock`, firma `Eko-Ogrody Płock` i zielona kropka „Połączono na żywo (iPadOS)”. Nagłówek uwzględnia `env(safe-area-inset-top)` (status bar `black-translucent`). `ContractorPage` bez `standalone` (trasa `/contractor`) działa jak dotąd — symulator na desktopie.
- **PWA / „Dodaj do ekranu początkowego”**: `client/index.html` — meta `viewport` (`maximum-scale=1.0, user-scalable=no, viewport-fit=cover`), `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=TreeMonitor`, `<link rel="manifest">`. `client/public/manifest.json`: `display: standalone`, `start_url: /ipad`, `background_color: #0f172a`, `theme_color: #059669`. Ikona: `favicon.svg` (iOS preferuje PNG `apple-touch-icon` 180×180 — do dodania w razie potrzeby).
- **Hook `client/src/hooks/useIosKeyboardFix.ts`** (naprawa przesuniętego ekranu / białego paska po schowaniu klawiatury):
  - `useIosKeyboardFix()` (wołany w `ContractorPage`): dodaje klasę `app-locked` na `<html>` (CSS w `index.css`: `html/body/#root` → `height: 100dvh; width: 100vw; overflow: hidden; position: fixed; inset: 0; background #0f172a; overscroll-behavior: none` — zakres tylko widoki wykonawcy, żeby nie zablokować przewijania stron urzędnika), nasłuchuje `focusout` pól `input/textarea/select`, `window.visualViewport` `resize` (klawiatura się chowa) oraz `orientationchange` → `resetIosViewport()` (natychmiast i ponownie po 350 ms, po animacji klawiatury).
  - `resetIosViewport()`: `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })` + wysyła zdarzenie `tree-monitor:viewport-restored`. `useLeafletViewportRestore()` (użyty w `ViewportRestoreSync` jako dziecko `<TreeMap>`) reaguje wywołaniem `map.invalidateSize()`.
  - `dismissKeyboardAndReset()`: `document.activeElement.blur()` + reset viewportu — wołane w `CompleteTaskDialog` przed „Zgłoś wykonanie”, po sukcesie i przy zamknięciu modala.
  - `index.css`: na urządzeniach dotykowych (`@media (pointer: coarse)`) `input, textarea, select { font-size: 16px }` — iPadOS Safari nie robi auto-zoomu przy focusie.
- **Modal „Wykonaj zadanie”** (`CompleteTaskDialog.tsx`): przyklejony do góry (`top-[3dvh] -translate-y-0`), `max-h-[80dvh] overflow-y-auto`, więc klawiatura ekranowa nie wypycha go poza ekran.

### Zaznaczanie grupowe na mapie i masowe zlecanie zadań (`feat/bulk-selection-modes-and-rejection-ui-fix`)
- **Pasek trybu kursora (`client/src/features/map/CursorModeToolbar.tsx`):** kompaktowy pasek umieszczony w górnym pasku `MapFilterBar` (pomiędzy licznikiem wyświetlonych roślin a przyciskiem „Alerty Decyzji”) z 3 trybami (`CursorMode`):
  1. `single` (**Pojedynczy**, ikona `MousePointer`, domyślny) — kliknięcie w roślinę otwiera standardową Kartę Ewidencyjną (`TreeCardSheet`).
  2. `multi_point` (**Punktowo wiele**, ikona `CheckSquare`) — klikanie w kolejne rośliny dodaje lub usuwa je z listy zaznaczonych (`selectedTreeIds`).
  3. `spatial_box` (**Przestrzennie kwadratem**, ikona `SquareDashedMousePointer`) — przeciągnięcie prostokąta na mapie zaznacza wszystkie widoczne rośliny wewnątrz obszaru.
  Pasek wyświetla także licznik zaznaczonych roślin (`Zaznaczono: X roślin`) oraz przycisk `Wyczyść`. Zaznaczone na mapie markery otrzymują klasę `.tree-marker--multi-selected` (animowany biało-fioletowy pierścień i podświetlona etykieta kodu w `map.css`).
- **Zaznaczanie obszarowe (`client/src/features/map/SpatialBoxSelector.tsx`):** dziecko `<TreeMap>` aktywne przy `cursorMode === 'spatial_box'`. Na czas rysowania blokuje `dragging`/`boxZoom`/`doubleClickZoom`, rysuje przerywany prostokąt `Rectangle` i po puszczeniu przycisku myszy przekazuje do `onSelectTreesInBox` identyfikatory wszystkich widocznych roślin zawartych w `bounds.contains([lat, lng])`.
- **Panel zbiorczy (`client/src/features/tree-card/BulkSelectionDrawer.tsx`):** niemodalny prawy panel (`Sheet`, `modal={false}`) otwierany automatycznie, gdy w trybie wielokrotnego wyboru zaznaczona jest ≥ 1 roślina:
  - Skrócona lista zaznaczonych roślin (`PlantBadge`, gatunek, adres, status) z przyciskiem `X` do odznaczenia pojedynczej rośliny.
  - Przycisk `Podgląd` (`Eye` / `ChevronDown`) przy każdej pozycji rozwija szczegóły drzewa (`GET /api/trees/:id`: działka, rok, wykonawca, decyzja, umowa + PDF, finansowanie, ostatnie zadania z miniaturami zdjęć otwierającymi `PhotoLightbox` oraz przycisk „Pokaż na mapie”) bez utraty zaznaczenia grupowego.
  - Formularz „Zleć wspólne zadanie dla zaznaczonych roślin (X szt.)”: wybór kategorii, podkategorii, wykonawcy (domyślnie Jan Zieliński `33333333-3333-3333-3333-333333333333`), numeru umowy, opcjonalnego skanu i opisu → wywołuje `POST /api/tasks/bulk`.
- **Endpoint `POST /api/tasks/bulk` (`server/src/routes/tasks.ts`, `official`):** przyjmuje `{ tree_ids, category, subcategory, contractor_id?, contract_number?, contract_scan_url?, description? }`. W jednej transakcji SQLite tworzy zadania o statusie `'assigned'` dla wszystkich wskazanych roślin i aktualizuje ich `trees.status` wg kategorii (`yellow` / `red` / `blue`) oraz `contractor_id`. Dzięki live-pollingowi nowo zlecone zadania od razu pojawiają się na górze listy u Wykonawcy (w tym na `/ipad`).

