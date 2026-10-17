-- =============================================================================
-- TREE MONITOR (PŁOCK) — inicjalizacja lokalnej bazy SQLite
-- =============================================================================
-- Baza: jeden plik `database/tree-monitor.db` (w .gitignore — każdy ma własną kopię).
--
-- Jak utworzyć / zresetować bazę (skrypt jest idempotentny — USUWA tabele i tworzy od nowa):
--   sqlite3 database/tree-monitor.db < database/init.sql
-- albo (od Branch 0) z katalogu /server:
--   npm run db:reset
--
-- Sterownik po stronie serwera: wbudowany moduł Node `node:sqlite` (DatabaseSync), Node >= 22.13.
-- Każde połączenie musi ustawić: PRAGMA foreign_keys = ON;  (SQLite domyślnie NIE sprawdza FK)
--
-- Konwencje:
--   * UUID-y przechowujemy jako TEXT; nowe id generuje serwer (crypto.randomUUID()).
--   * Daty jako TEXT w ISO 8601 UTC z milisekundami, np. '2026-10-17T10:31:35.782Z'
--     — ten sam format co JavaScript `new Date().toISOString()`, więc porównania tekstowe
--     (np. wygasanie blokady MUTEX) działają poprawnie.
--   * Tabele STRICT — SQLite wymusza typy kolumn.
--
-- Słownik gatunków: sekcja 3 zawiera 100 instrukcji INSERT wygenerowanych 1:1
-- z pliku database/species_dictionary.csv (CSV pozostaje źródłem prawdy).
-- =============================================================================

PRAGMA foreign_keys = OFF;
PRAGMA journal_mode = WAL;

BEGIN TRANSACTION;

-- =============================================================================
-- 0. RESET
-- =============================================================================
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS trees;
DROP TABLE IF EXISTS species_dictionary;
DROP TABLE IF EXISTS users;


-- =============================================================================
-- 1. TABELE
-- =============================================================================

-- Konta testowe (Semi-Mock Auth: wybór konta na ekranie "/", nagłówek x-user-id)
CREATE TABLE users (
  id          TEXT PRIMARY KEY NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('official', 'contractor')),
  device      TEXT NOT NULL DEFAULT 'desktop' CHECK (device IN ('desktop', 'tablet')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Słownik 100 gatunków (źródło: database/species_dictionary.csv)
CREATE TABLE species_dictionary (
  id           INTEGER PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('tree', 'shrub')),
  polish_name  TEXT NOT NULL,
  latin_name   TEXT NOT NULL,
  cultivar     TEXT
) STRICT;

-- Ewidencja roślin (punkty na mapie)
CREATE TABLE trees (
  id                 TEXT PRIMARY KEY NOT NULL,
  code               TEXT NOT NULL UNIQUE,                 -- D{n}/{rok} lub K{n}/{rok}
  type               TEXT NOT NULL CHECK (type IN ('tree', 'shrub')),
  species_id         INTEGER NOT NULL REFERENCES species_dictionary(id),
  latitude           REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude          REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address            TEXT,
  plot_number        TEXT,                                 -- nr działki ewidencyjnej
  parcel_geometry    TEXT,                                 -- obrys działki (GeoJSON, opcjonalnie)
  planting_year      INTEGER CHECK (planting_year IS NULL OR planting_year BETWEEN 1800 AND 2100),
  is_from_decision   INTEGER NOT NULL DEFAULT 0 CHECK (is_from_decision IN (0, 1)),
  decision_number    TEXT,                                 -- nr decyzji administracyjnej (opcjonalnie)
  status             TEXT NOT NULL DEFAULT 'green'
                       CHECK (status IN ('green', 'yellow', 'red', 'blue')),
  contractor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- POLA WRAŻLIWE: nigdy nie wysyłać do roli 'contractor'
  contract_number    TEXT,
  contract_scan_url  TEXT,
  funding_source     TEXT,
  notes              TEXT,
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT trees_code_format CHECK (
    substr(code, 1, 1) = CASE type WHEN 'tree' THEN 'D' ELSE 'K' END
    AND code GLOB '?[0-9]*/[0-9][0-9][0-9][0-9]'
    AND substr(code, 2, instr(code, '/') - 2) NOT GLOB '*[^0-9]*'
  )
) STRICT;

-- Zadania (zlecenia prac) + MUTEX (locked_by / locked_at)
CREATE TABLE tasks (
  id                         TEXT PRIMARY KEY NOT NULL,
  tree_id                    TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  category                   TEXT NOT NULL CHECK (category IN ('pielegnacja', 'wycinka', 'nasadzanie')),
  subcategory                TEXT NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'assigned'
                               CHECK (status IN ('assigned', 'pending_approval', 'approved', 'rejected')),
  assigned_to                TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  description                TEXT,
  -- POLA WRAŻLIWE: nigdy nie wysyłać do roli 'contractor'
  contract_number            TEXT,
  contract_scan_url          TEXT,
  -- Realizacja przez wykonawcę
  contractor_comment         TEXT,
  contractor_photo_url       TEXT,
  completed_at               TEXT,
  -- Decyzja urzędnika
  official_rejection_reason  TEXT,
  reviewed_by                TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at                TEXT,
  -- MUTEX (blokada wygasa po 5 min — logika na serwerze)
  locked_by                  TEXT REFERENCES users(id) ON DELETE SET NULL,
  locked_at                  TEXT,
  created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CONSTRAINT tasks_category_subcategory CHECK (
    (category = 'pielegnacja' AND subcategory IN ('nawozenie', 'podlewanie', 'przycinanie')) OR
    (category = 'wycinka'     AND subcategory = 'wycinka') OR
    (category = 'nasadzanie'  AND subcategory IN ('posadzenie', 'korowanie', 'palikowanie'))
  ),
  CONSTRAINT tasks_rejection_reason_required CHECK (
    status <> 'rejected' OR length(trim(coalesce(official_rejection_reason, ''))) > 0
  ),
  CONSTRAINT tasks_lock_consistency CHECK ((locked_by IS NULL) = (locked_at IS NULL))
) STRICT;


-- =============================================================================
-- 2. INDEKSY I TRIGGERY
-- =============================================================================
CREATE INDEX trees_status_idx        ON trees (status);
CREATE INDEX trees_species_idx       ON trees (species_id);
CREATE INDEX trees_contractor_idx    ON trees (contractor_id);
CREATE INDEX trees_planting_year_idx ON trees (planting_year);
CREATE INDEX tasks_tree_idx          ON tasks (tree_id);
CREATE INDEX tasks_status_idx        ON tasks (status);
CREATE INDEX tasks_assigned_to_idx   ON tasks (assigned_to);
CREATE INDEX tasks_category_idx      ON tasks (category);

CREATE TRIGGER trees_set_updated_at
AFTER UPDATE ON trees
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE trees SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER tasks_set_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;


-- =============================================================================
-- 3. SŁOWNIK GATUNKÓW (100 rekordów, 1:1 z database/species_dictionary.csv)
-- =============================================================================
INSERT INTO species_dictionary (id, type, polish_name, latin_name, cultivar) VALUES
  (1, 'tree', 'Klon pospolity', 'Acer platanoides', 'pospolity'),
  (2, 'tree', 'Klon pospolity', 'Acer platanoides', '''Globosum'''),
  (3, 'tree', 'Klon pospolity', 'Acer platanoides', '''Royal Red'''),
  (4, 'tree', 'Klon pospolity', 'Acer platanoides', '''Columnare'''),
  (5, 'tree', 'Klon jawor', 'Acer pseudoplatanus', 'pospolity'),
  (6, 'tree', 'Klon jawor', 'Acer pseudoplatanus', '''Atropurpureum'''),
  (7, 'tree', 'Klon polny', 'Acer campestre', '''Elsrijk'''),
  (8, 'tree', 'Klon czerwony', 'Acer rubrum', '''October Glory'''),
  (9, 'tree', 'Klon srebrzysty', 'Acer saccharinum', 'pospolity'),
  (10, 'tree', 'Klon tatarski', 'Acer tataricum', 'podgat. ginnala'),
  (11, 'tree', 'Klon jesionolistny', 'Acer negundo', '''Flamingo'''),
  (12, 'tree', 'Lipa drobnolistna', 'Tilia cordata', 'pospolita'),
  (13, 'tree', 'Lipa drobnolistna', 'Tilia cordata', '''Greenspire'''),
  (14, 'tree', 'Lipa drobnolistna', 'Tilia cordata', '''Rancho'''),
  (15, 'tree', 'Lipa szerokolistna', 'Tilia platyphyllos', 'pospolita'),
  (16, 'tree', 'Lipa krymska', 'Tilia ×euchlora', 'pospolita'),
  (17, 'tree', 'Lipa srebrzysta', 'Tilia tomentosa', '''Brabant'''),
  (18, 'tree', 'Lipa holenderska', 'Tilia ×europaea', '''Pallida'''),
  (19, 'tree', 'Dąb szypułkowy', 'Quercus robur', 'pospolity'),
  (20, 'tree', 'Dąb szypułkowy', 'Quercus robur', '''Fastigiata'''),
  (21, 'tree', 'Dąb bezszypułkowy', 'Quercus petraea', 'pospolity'),
  (22, 'tree', 'Dąb czerwony', 'Quercus rubra', 'pospolity'),
  (23, 'tree', 'Dąb błotny', 'Quercus palustris', '''Green Pillar'''),
  (24, 'tree', 'Brzoza brodawkowata', 'Betula pendula', 'pospolita'),
  (25, 'tree', 'Brzoza brodawkowata', 'Betula pendula', '''Youngii'''),
  (26, 'tree', 'Brzoza pożyteczna', 'Betula utilis', '''Doorenbos'''),
  (27, 'tree', 'Brzoza omszona', 'Betula pubescens', 'pospolita'),
  (28, 'tree', 'Grab pospolity', 'Carpinus betulus', 'pospolity'),
  (29, 'tree', 'Grab pospolity', 'Carpinus betulus', '''Fastigiata'''),
  (30, 'tree', 'Grab pospolity', 'Carpinus betulus', '''Frans Fontaine'''),
  (31, 'tree', 'Buk pospolity', 'Fagus sylvatica', 'pospolity'),
  (32, 'tree', 'Buk pospolity', 'Fagus sylvatica', '''Purpurea Pendula'''),
  (33, 'tree', 'Buk pospolity', 'Fagus sylvatica', '''Dawyck Purple'''),
  (34, 'tree', 'Jesion wyniosły', 'Fraxinus excelsior', 'pospolity'),
  (35, 'tree', 'Jesion wyniosły', 'Fraxinus excelsior', '''Nana'''),
  (36, 'tree', 'Jesion pensylwański', 'Fraxinus pennsylvanica', 'pospolity'),
  (37, 'tree', 'Platan klonolistny', 'Platanus ×hispanica', '''Acerifolia'''),
  (38, 'tree', 'Platan klonolistny', 'Platanus ×hispanica', '''Alphen''s Globe'''),
  (39, 'tree', 'Kasztanowiec pospolity', 'Aesculus hippocastanum', 'pospolity'),
  (40, 'tree', 'Kasztanowiec czerwony', 'Aesculus ×carnea', '''Briotii'''),
  (41, 'tree', 'Robinia akacjowa', 'Robinia pseudoacacia', 'pospolita'),
  (42, 'tree', 'Robinia akacjowa', 'Robinia pseudoacacia', '''Umbraculifera'''),
  (43, 'tree', 'Jarząb pospolity', 'Sorbus aucuparia', 'pospolity'),
  (44, 'tree', 'Jarząb pospolity', 'Sorbus aucuparia', '''Fastigiata'''),
  (45, 'tree', 'Jarząb szwedzki', 'Sorbus intermedia', 'pospolity'),
  (46, 'tree', 'Jarząb mączny', 'Sorbus aria', '''Magnifica'''),
  (47, 'tree', 'Głóg pośredni', 'Crataegus ×media', '''Paul''s Scarlet'''),
  (48, 'tree', 'Głóg jednoszyjkowy', 'Crataegus monogyna', '''Stricta'''),
  (49, 'tree', 'Wiśnia piłkowana', 'Prunus serrulata', '''Kanzan'''),
  (50, 'tree', 'Wiśnia piłkowana', 'Prunus serrulata', '''Amanogawa'''),
  (51, 'tree', 'Wiśnia osobliwa', 'Prunus ×eminens', '''Umbraculifera'''),
  (52, 'tree', 'Śliwa wiśniowa', 'Prunus cerasifera', '''Pissardii'''),
  (53, 'tree', 'Jabłoń ozdobna', 'Malus', '''Royalty'''),
  (54, 'tree', 'Jabłoń ozdobna', 'Malus', '''Ola'''),
  (55, 'tree', 'Grusza drobnoowocowa', 'Pyrus calleryana', '''Chanticleer'''),
  (56, 'tree', 'Wiąz szypułkowy', 'Ulmus laevis', 'pospolity'),
  (57, 'tree', 'Wiąz górski', 'Ulmus glabra', '''Camperdownii'''),
  (58, 'tree', 'Wierzba biała', 'Salix alba', '''Tristis'''),
  (59, 'tree', 'Olsza czarna', 'Alnus glutinosa', 'pospolita'),
  (60, 'tree', 'Surmia bignoniowa', 'Catalpa bignonioides', '''Nana'''),
  (61, 'tree', 'Miłorząb dwuklapowy', 'Ginkgo biloba', 'pospolity'),
  (62, 'tree', 'Tulipanowiec amerykański', 'Liriodendron tulipifera', 'pospolity'),
  (63, 'tree', 'Sosna zwyczajna', 'Pinus sylvestris', 'pospolita'),
  (64, 'tree', 'Sosna czarna', 'Pinus nigra', 'pospolita'),
  (65, 'tree', 'Świerk pospolity', 'Picea abies', 'pospolity'),
  (66, 'tree', 'Świerk kłujący', 'Picea pungens', '''Glauca'''),
  (67, 'tree', 'Modrzew europejski', 'Larix decidua', 'pospolity'),
  (68, 'tree', 'Cis pospolity', 'Taxus baccata', 'pospolity'),
  (69, 'tree', 'Daglezja zielona', 'Pseudotsuga menziesii', 'pospolita'),
  (70, 'tree', 'Jodła kalifornijska', 'Abies concolor', 'pospolita'),
  (71, 'shrub', 'Tawuła japońska', 'Spiraea japonica', '''Goldflame'''),
  (72, 'shrub', 'Tawuła japońska', 'Spiraea japonica', '''Little Princess'''),
  (73, 'shrub', 'Tawuła szara', 'Spiraea ×cinerea', '''Grefsheim'''),
  (74, 'shrub', 'Berberys Thunberga', 'Berberis thunbergii', '''Atropurpurea'''),
  (75, 'shrub', 'Berberys Thunberga', 'Berberis thunbergii', '''Maria'''),
  (76, 'shrub', 'Róża pomarszczona', 'Rosa rugosa', 'pospolita'),
  (77, 'shrub', 'Róża okrywowa', 'Rosa', '''The Fairy'''),
  (78, 'shrub', 'Róża okrywowa', 'Rosa', '''Heidetraum'''),
  (79, 'shrub', 'Hortensja bukietowa', 'Hydrangea paniculata', '''Limelight'''),
  (80, 'shrub', 'Hortensja bukietowa', 'Hydrangea paniculata', '''Vanille Fraise'''),
  (81, 'shrub', 'Pęcherznica kalinolistna', 'Physocarpus opulifolius', '''Diabolo'''),
  (82, 'shrub', 'Pęcherznica kalinolistna', 'Physocarpus opulifolius', '''Luteus'''),
  (83, 'shrub', 'Dereń biały', 'Cornus alba', '''Sibirica'''),
  (84, 'shrub', 'Dereń biały', 'Cornus alba', '''Elegantissima'''),
  (85, 'shrub', 'Dereń rozłogowy', 'Cornus sericea', '''Flaviramea'''),
  (86, 'shrub', 'Irga błyszcząca', 'Cotoneaster lucidus', 'pospolita'),
  (87, 'shrub', 'Irga pozioma', 'Cotoneaster horizontalis', 'pospolita'),
  (88, 'shrub', 'Irga Dammera', 'Cotoneaster dammeri', '''Major'''),
  (89, 'shrub', 'Krzewuszka cudowna', 'Weigela florida', '''Nana Variegata'''),
  (90, 'shrub', 'Forsycja pośrednia', 'Forsythia ×intermedia', '''Spectabilis'''),
  (91, 'shrub', 'Lilak pospolity', 'Syringa vulgaris', 'pospolity'),
  (92, 'shrub', 'Jaśminowiec wonny', 'Philadelphus coronarius', 'pospolity'),
  (93, 'shrub', 'Kalina koralowa', 'Viburnum opulus', '''Roseum'''),
  (94, 'shrub', 'Śnieguliczka biała', 'Symphoricarpos albus', 'pospolita'),
  (95, 'shrub', 'Pięciornik krzewiasty', 'Potentilla fruticosa', '''Goldfinger'''),
  (96, 'shrub', 'Jałowiec płożący', 'Juniperus horizontalis', '''Wiltonii'''),
  (97, 'shrub', 'Jałowiec sabiński', 'Juniperus sabina', '''Tamariscifolia'''),
  (98, 'shrub', 'Sosna górska (Kosodrzewina)', 'Pinus mugo', '''Pumilio'''),
  (99, 'shrub', 'Liliowiec ogrodowy (Bylina)', 'Hemerocallis', '''Stella de Oro'''),
  (100, 'shrub', 'Kocimiętka Faassena (Bylina)', 'Nepeta ×faassenii', '''Walker''s Low''');


-- =============================================================================
-- 4. SEED — dane testowe dla Płocka
-- =============================================================================

-- 4.1 Użytkownicy (3 konta testowe)
INSERT INTO users (id, full_name, role, device) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Anna Kowalska', 'official',   'desktop'),
  ('22222222-2222-2222-2222-222222222222', 'Piotr Nowak',   'official',   'desktop'),
  ('33333333-3333-3333-3333-333333333333', 'Jan Zieliński', 'contractor', 'tablet');

-- 4.2 Rośliny (9 szt., wszystkie 4 kolory + 2 drzewa z decyzji przed upływem 3 lat gwarancji)
--   green:  D1/2026, D6/2026, K1/2026, D8/2026 (z decyzji 2023), D9/2026 (z decyzji 2023)
--   yellow: D2/2026 (czeka na zatwierdzenie), D3/2026 (czeka na zatwierdzenie)
--   red:    D5/2026 (wycinka odrzucona do poprawki)
--   (D4/2026 usunięty trwale — patrz server/src/seeds/databaseFixes.ts)
--   blue:   D7/2026 (nowe nasadzenie)
-- Zdjęcia i skany demo: ścieżki względne serwowane z client/public/demo/...
INSERT INTO trees
  (id, code, type, species_id, latitude, longitude, address, plot_number, planting_year, status,
   contractor_id, contract_number, contract_scan_url, funding_source, notes, created_by)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'D1/2026', 'tree', 12, 52.54500, 19.68490,
   'Stary Rynek 6, Płock', '146201_1.0008.682/5', 1985, 'green',
   '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2026/011', '/demo/contracts/UM-ZZ-2026-011.pdf',
   'Budżet Miasta Płocka', 'Lipa przy ratuszu, po cięciu sanitarnym.', '11111111-1111-1111-1111-111111111111'),

  ('aaaaaaaa-0000-0000-0000-000000000002', 'D2/2026', 'tree', 2, 52.54180, 19.68950,
   'Mostowa 2, Płock', '146201_1.0008.1012/1', 2019, 'yellow',
   '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2026/014', '/demo/contracts/UM-ZZ-2026-014.pdf',
   'Płocki Budżet Obywatelski 2026', 'Klon kulisty na deptaku.', '11111111-1111-1111-1111-111111111111'),

  ('aaaaaaaa-0000-0000-0000-000000000003', 'D3/2026', 'tree', 19, 52.54080, 19.68880,
   'Tumska 1, Płock', '146201_1.0008.991/4', 1952, 'yellow',
   '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2026/014', '/demo/contracts/UM-ZZ-2026-014.pdf',
   'WFOŚiGW w Warszawie (dotacja 80%)', 'Pomnik przyrody — kandydat.', '11111111-1111-1111-1111-111111111111'),

  ('aaaaaaaa-0000-0000-0000-000000000005', 'D5/2026', 'tree', 34, 52.53790, 19.70120,
   'Jana Kilińskiego 1, Płock', '146201_1.0008.981/9', 1975, 'red',
   '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2026/021', '/demo/contracts/UM-ZZ-2026-021.pdf',
   'Budżet Miasta Płocka', 'Zamieranie pędów jesionu (Hymenoscyphus fraxineus).', '22222222-2222-2222-2222-222222222222'),

  ('aaaaaaaa-0000-0000-0000-000000000006', 'D6/2026', 'tree', 61, 52.53990, 19.75440,
   'gen. Franciszka Kleeberga 2, Płock', '146201_1.0001.2906/153', 2008, 'green',
   NULL, NULL, NULL, NULL, 'Miłorząb przy alejce głównej.', '11111111-1111-1111-1111-111111111111'),

  ('aaaaaaaa-0000-0000-0000-000000000007', 'D7/2026', 'tree', 55, 52.54100, 19.69770,
   'Jana Zygmunta Jakubowskiego 5, Płock', '146201_1.0008.930/11', 2026, 'blue',
   '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2026/030', '/demo/contracts/UM-ZZ-2026-030.pdf',
   'Rządowy program "Zielone Miasta" (NFOŚiGW)', 'Nasadzenie zastępcze za wycinkę przy Al. Jachowicza.', '11111111-1111-1111-1111-111111111111'),

  ('aaaaaaaa-0000-0000-0000-000000000008', 'K1/2026', 'shrub', 71, 52.54215, 19.69330,
   'Obrońców Warszawy 1, Płock', '146201_1.0008.826/2', 2022, 'green',
   NULL, NULL, NULL, NULL, 'Rabata z tawułą przy fontannie.', '11111111-1111-1111-1111-111111111111');

-- 4.2b Drzewa z decyzji administracyjnych (Z DECYZJI: TAK), którym został < 1 miesiąc do upływu 3 lat od posadzenia
INSERT INTO trees
  (id, code, type, species_id, latitude, longitude, address, plot_number, planting_year,
   is_from_decision, decision_number, status, contractor_id, contract_number, contract_scan_url,
   funding_source, notes, created_by, created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000009', 'D8/2026', 'tree', 28, 52.54420, 19.69140,
   'Kolegialna 3A, Płock', '146201_1.0008.768', 2023,
   1, 'WOŚ.6131.44.2023', 'green', '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2023/089', '/demo/contracts/UM-ZZ-2026-011.pdf',
   'Nasadzenie zastępcze z decyzji administracyjnej', 'Grab pospolity — nasadzenie kompensacyjne z decyzji WOŚ.6131.44.2023 (upływ 3-letniej gwarancji za 11 dni).',
   '11111111-1111-1111-1111-111111111111',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years', '+11 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years', '+11 days')),

  ('aaaaaaaa-0000-0000-0000-000000000010', 'D9/2026', 'tree', 13, 52.54610, 19.69520,
   'Królewiecka 26, Płock', '146201_1.0008.563', 2023,
   1, 'WOŚ.6131.58.2023', 'green', '33333333-3333-3333-3333-333333333333', 'UM/ZZ/2023/102', '/demo/contracts/UM-ZZ-2026-014.pdf',
   'Nasadzenie zastępcze z decyzji administracyjnej', 'Lipa drobnolistna Greenspire — nasadzenie z decyzji WOŚ.6131.58.2023 (upływ 3-letniej gwarancji za 23 dni).',
   '11111111-1111-1111-1111-111111111111',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years', '+23 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 years', '+23 days'));

-- 4.3 Zadania (5 szt., wszystkie statusy)
INSERT INTO tasks
  (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
   contract_number, contract_scan_url, contractor_comment, contractor_photo_url, completed_at,
   official_rejection_reason, reviewed_by, reviewed_at, created_at)
VALUES
  -- D1: przycinanie — zatwierdzone (drzewo zielone)
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'pielegnacja', 'przycinanie', 'approved',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Cięcie sanitarne korony, usunięcie suchych gałęzi.',
   'UM/ZZ/2026/011', '/demo/contracts/UM-ZZ-2026-011.pdf',
   'Usunięto 6 suchych konarów, rany zabezpieczone.', '/demo/photos/pruning.svg',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 days'),
   NULL, '11111111-1111-1111-1111-111111111111', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')),

  -- D2: podlewanie — czeka na zatwierdzenie (kolejka MUTEX)
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
   'pielegnacja', 'podlewanie', 'pending_approval',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Podlewanie interwencyjne 100 l, susza.',
   'UM/ZZ/2026/014', '/demo/contracts/UM-ZZ-2026-014.pdf',
   'Podlano 100 l wody, misa odnowiona.', '/demo/photos/watering.svg',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'),
   NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),

  -- D3: nawożenie — czeka na zatwierdzenie (kolejka MUTEX)
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003',
   'pielegnacja', 'nawozenie', 'pending_approval',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Nawożenie mikoryzowe w strefie korzeniowej.',
   'UM/ZZ/2026/014', '/demo/contracts/UM-ZZ-2026-014.pdf',
   NULL, '/demo/photos/fertilizing.svg',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'),
   NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),

  -- D5: wycinka — odrzucona, wraca do wykonawcy
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005',
   'wycinka', 'wycinka', 'rejected',
   '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   'Wycinka wraz z frezowaniem pnia i uprzątnięciem terenu.',
   'UM/ZZ/2026/021', '/demo/contracts/UM-ZZ-2026-021.pdf',
   'Drzewo wycięte.', '/demo/photos/cutting.svg',
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'),
   'Na zdjęciu widoczny pozostawiony pień i gałęzie na chodniku. Proszę sfrezować pień i uprzątnąć teren.',
   '22222222-2222-2222-2222-222222222222', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'),
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days')),

  -- D7: posadzenie nowego nasadzenia — przypisane, do wykonania
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000007',
   'nasadzanie', 'posadzenie', 'assigned',
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Posadzenie gruszy (obwód 14-16 cm) i palikowanie trójnogiem.',
   'UM/ZZ/2026/030', '/demo/contracts/UM-ZZ-2026-030.pdf',
   NULL, NULL, NULL,
   NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours'));

COMMIT;

PRAGMA foreign_keys = ON;


-- =============================================================================
-- 5. SZYBKA WERYFIKACJA (opcjonalnie, w `sqlite3 database/tree-monitor.db`)
-- =============================================================================
-- SELECT count(*) FROM species_dictionary;                 -- 100
-- SELECT code, status FROM trees ORDER BY code;            -- 9 roślin (przed seedem BDOT10k)
-- SELECT status, count(*) FROM tasks GROUP BY status;      -- approved 1, pending 2, assigned 1, rejected 1
-- PRAGMA foreign_key_check;                                -- brak wyników = spójne FK
