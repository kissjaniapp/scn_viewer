# SCN Viewer v2.3.0 – külön teljes képernyős modellnézet

A ⤢ Teljes nézet változatlanul a kamera beállítására szolgál a normál szerkesztőfelületen. A külön ⛶ Csak modell gomb a zavartalan, teljes képernyős 3D nézetet nyitja.

- Csak a modell látszik, plusz a ↩ Vissza (Esc) gomb; az oldalsávok, eszköztárak, állapotsor, segédrács és tengelyek eltűnnek.
- Visszalépés a Vissza gombbal vagy Esc billentyűvel; natív fullscreen kilépéskor is helyreáll a normál nézet.
- A 3D forgatás, nagyítás és eltolás változatlanul működik; a látható modell méretéhez igazítjuk a kamerát.
- Ha nincs natív fullscreen, a teljes alkalmazásablakot kitöltő nézet használható.

---
# SCN Viewer v2.3.0 – tengelyek láthatósági kapcsolója

- A Beállítások → Megjelenítés és beállítások részben az „X–Y–Z tengelyek megjelenítése” pipával külön ki- és bekapcsolható a 3D tengelyjelölés és a nézet alján lévő tengelyfelirat.
- Ez független a segédrácstól, nem változtatja meg a 3D modell geometriáját, az egérirányítást vagy az objektumok láthatóságát.
- A v2.2.3 változatban bevezetett oldalsó objektumkijelölés továbbra sem nyit ki csoportokat; a lenyitás külön nyíllal történik.

---
# SCN Viewer v2.3.0 – oldalsó kijelölés lenyitás nélkül

A szerkezeti fa elemeinek nevére kattintva az adott objektumot a bal oldali listában és a 3D jelenetben kiemeljük, de egyetlen csoportot sem nyitunk ki és nem csukunk be. A lenyitás továbbra is kizárólag a háromszög-nyilakkal, illetve a Mind kinyitása / Összecsukás gombokkal történik. A 3D nézetből kattintott alkatrész automatikus megtalálása a szerkezeti fában változatlanul működik.

---
# SCN Viewer v2.3.0 – egérvezérlés a látható tárgyakhoz igazítva

- Bármely bútor/alkatrész elrejtésekor és visszakapcsolásakor az egér forgatási középpontja a megmaradt látható objektumok középpontjára áll át.
- A kamera megőrzi a felhasználó által beállított forgatási irányt, miközben a látható rész méretei alapján automatikusan újrakeretezi a nézetet és a zoomhatárokat.
- Ez az SKP és SCN betöltésnél, a szerkezeti fa pipáinál, a kijelölt elem elrejtésénél és az elrejtett elemek visszakapcsolásánál is működik.
- Ha az összes objektum el van rejtve, nem ugrik a kamera egy képzeletbeli origóra; az előző nézet megmarad.
- A modell eredeti fájlja nem módosul.

---
# SCN Viewer v2.3.0 – 3D kijelölés szinkronban a szerkezeti fával

- Az SKP/SCN nézetben bal gombbal kattintott panel vagy objektum kijelölése megkeresi és kiemeli ugyanazt a 3D objektumot a bal oldali szerkezetben.
- Kijelöléskor a megfelelő ős-csoportok automatikusan kinyílnak, és a fa odagörget a kijelölt sorhoz. Más csoportokat nem nyit ki.
- Fájl megnyitásakor a teljes jelenet gyökere nyitva marad, minden alatta lévő csoport becsukva indul.
- A kijelölt sor mellett lévő pipa elrejti vagy visszakapcsolja az adott objektumot. Az elrejtett elemek csoportjai következetesen rejtve maradnak.
- Mind kinyitása / Összecsukás gombok továbbra is működnek. Az eredeti fájl nem módosul.

---
# SCN Viewer v2.3.0 – SketchUp (.SKP) közvetlen import

A Windows 11 SCN Viewer mostantól SKP-fájlt is tud megnyitni SketchUp telepítése nélkül. Az OpenSKP 1.5.0 (MIT licenc) valódi komponensgeometriát, anyagokat és elhelyezéseket olvas ki, amelyeket GLB 3D modellként jelenít meg a Viewer.

- Fájlmegnyitás: SCN, SKP, OBJ, 3DS, STL, GLB, GLTF.
- Megmarad a jobb egérgombos forgatás, a görgős nagyítás, a középső gombos eltolás és a bal gombos kijelölés.
- A fa szerkezetében elemek láthatósága állítható, az egyes objektumok kijelölhetők.
- A SketchUp geometria méteres glTF koordinátákból érkezik; a Viewer méretkijelzése automatikusan mm-re vált.
- A SKP fájl helyben marad és nem módosul.
- A régebbi vagy különleges SKP-verziók közül nem mind garantáltan olvasható; a beolvasó hibaüzenetet ad, ha nem sikerül.
- A közvetlen SKP-támogatás önmagában nem javítja meg a régi SCN-dekóder hiányzó katalógusgeometriáját. Az eredeti SCN-változatlanul nyitható.

Külső, MIT licencű könyvtár: https://github.com/iamahsanmehmood/openskp . A Windows telepítő a sikeres GitHub Actions-futás Artifacts részében található SCN_Viewer_v2.3.0_Telepito néven.

---

# SCN Viewer v2.3.0 – javított SCN geometria (678A33CD_0368_08.scn minta)

Az ellenőrzött mintában 915 dekódolható rekord található: 735 dekorlap, 120 CUBE/Sík jellegű téglatest, 42 nulla magasságú SURF2D/CIRC322D síkidom és 18 további katalógus-/szerelvényrekord. A régi beolvasó a 42 síkidomot kihagyta, a CUBE/Sík elemeket részben félrevezető helyettesítő vázlatként kezelte. A v2.3.0 a 2D síkokat és köröket eredeti méretekkel külön síkgeometriaként, a primitív dobozokat tömör objektumként rajzolja, és a rejtett objektumokat nem számítja bele a látható modell méreteibe. Alapnézet: matt fehér, segédrács és élrajz kikapcsolva (mindkettő visszakapcsolható).

A teljes SCN-jelenet betöltődik, a szerkezeti fa és a bútor/alkatrész elrejtése megmarad. A tömör primitív itt az SCN-ben megadott méretekből épül, nem a pontos, textúrázott katalóguspoligonokból. Az eredeti látványterven szereplő falak, székek és monitorok tökéletes visszaállítása továbbra sem garantált, mert az SCN nem tartalmaz minden szükséges katalógushálót és textúrát. **A belső szerkezetből becsült elemek nem használhatók szabászatra vagy CNC gyártásra.** A személyes SCN-mintát nem tettük közzé.

---

# SCN Viewer v2.3.0 – új CAD felület

Háromoszlopos sötét munkafelület: bal oldalt a teljes importált objektumfa láthatósági jelölőnégyzetekkel, középen nagy 3D nézet, jobb oldalt kijelölés, méretek, elrejtés/visszaállítás, nézet gyorsgombok és lenyitható speciális beállítások. Megmarad a korábbi egérvezérlés és a teljes betöltött jelenet. Az SCN-ben ténylegesen nem rendelkezésre álló KitchenDraw katalógusmodelleket ez a változat sem tudja rekonstruálni; az előző látványkép csak felület- és látványterv, nem a bináris SCN-ből visszafejtett hiteles modell. A szerkezeti fa térbeli jelenetrészei becsült csoportok, nem eredeti szekrényazonosítók.

---

# SCN Viewer v2.3.0 – teljes jelenet és elemenkénti elrejtés

Az összes sikeresen dekódolt SCN objektum és jelenetrész automatikusan látszik: nincs többé jelenetrész-választó, sem kategóriánkénti elrejtés. Szekrény/alkatrész kijelölés után a **Kijelölt bútor / alkatrész elrejtése** gombbal az adott objektum vagy csoport elrejthető, az **Elrejtett elemek** listából egyenként vagy egyszerre visszakapcsolható. A csoportok térbeli becslések, nem garantált KitchenDraw szekrényhierarchia. Az eredeti SCN fájl nem módosul. A katalógusgeometriák továbbra is egyszerűsített vázlatok.

---

# SCN Viewer v1.8.0 – különálló SCN jelenetrészek

A 678A33CD_0368_08.scn vizsgálata több, egymástól távoli ismételt bútor-elrendezést mutatott a fájl koordinátaterében. A Viewer most a közeli objektumokat önálló jelenetrészekbe csoportosítja, és megnyitáskor a legsűrűbb jelenetrészre közelít. Az összes jelenetrész továbbra is választható. A katalógusokból becsült drótvázas/helyettesítő 3D alakzatokat alapból elrejti; ezek külön bekapcsolhatók. Az eredeti SCN objektumpozíciók, méretek és a forgatások nem változnak.

**Korlát:** Ez a verzió nem állít elő KitchenDraw katalógusmodellt a fájlban nem szereplő geometriából, és nem rekonstruálja automatikusan a teljes, falakkal és berendezésekkel ellátott fotorealisztikus irodai látványtervet. A jelenetrészek térbeli csoportosítások, nem hiteles KitchenDraw bútorhierarchia. A csatolt SCN-fájlt nem tettük közzé.

Telepítő: [Windows Actions / Artifacts](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml) → `SCN_Viewer_v1.8.0_Telepito` (sikeres futás után).

---

# SCN Viewer v1.7.0 – önálló SCN megjelenítő, XYZ igazítással

A program nem használ KitchenDraw-t. Windows 11-es, saját ablakos alkalmazás; a korábbi Tinkercad-jellegű egérforgatás megmaradt.

## Új: bútorpozíciók ellenőrzése és igazítása

A KitchenDraw SCN egyes objektumainak mérete, helye és elforgatása dekódolható, de az egyedi katalógusformák belső geometriája nem mindig található meg a fájlban. Ezért a program **nem mozgat automatikusan, találgatással bútorokat**; a becsült vázlatok helyét szükség esetén ellenőrizheted.

1. Nyisd meg a `.scn` tervet. A „Lehetséges elhelyezési átfedések” listában látható, ha két katalógusbútor *számított befoglaló téglatestje* jelentősen átfedi egymást. Ez figyelmeztetés, **nem igazolt valódi ütközés**.
2. Bal kattintással jelöld ki az érintett szekrényt/alkatrészt (vagy kattints a katalóguslistájában a nevére).
3. A „Kijelölt SCN objektum helyzetének igazítása” szakaszban az **X, Y, Z eltolást milliméterben** adhatod meg. Pozitív vagy negatív értékeket is beírhatsz.
4. Kattints az **Igazítás alkalmazása** gombra. A vázlat minden oldala/teteje/feneke egyszerre mozdul. Az **Eredeti helyzet** gomb mindhárom eltolást nullázza.
5. A javítások automatikusan megmaradnak ezen a gépen: az alkalmazás saját felhasználói adatkönyvtárában (`scn-positions/<fájlujjlenyomat>.json`). Az eredeti SCN nem módosul, nem kerül a GitHubra.

A szoftver az eredeti SCN-ből kiolvasott pozíciókat alapból megőrzi. Az igazítás kizárólag **a megjelenítésre** vonatkozik, nem gyártásra hitelesített új alkatrészgeometria, és nem új SCN fájl.

## Letöltés és telepítés

A [GitHub Actions – Windows telepítő](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml) legutóbbi sikeres futásánál, az **Artifacts** részből töltsd le a `SCN_Viewer_v1.7.0_Telepito` ZIP-et, majd csomagold ki és indítsd az EXE-t. A korábbi verzióra frissíthető.

---

# SCN Viewer v1.5.0 – látható bútorvázlatok

**KitchenDraw nélkül használható**, önálló Windows 11 alkalmazás, közvetlen `.scn` fájlnyitással, 3D nézettel, alkatrész-/bútorválasztással és milliméteres méréssel.

## Telepítés GitHub Actions / Artifacts

1. Nyisd meg a [Windows telepítő Actions oldalt](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml).
2. A legutóbbi sikeres futás **Artifacts** részében válaszd a `SCN_Viewer_v1.5.0_Telepito` csomagot.
3. Csomagold ki a letöltött ZIP-et és indítsd a `SCN_Viewer_v1.5.0_Telepito.exe` fájlt.
4. Az asztali vagy Start menüs **SCN Viewer** parancsikonnal saját ablakban indul. A régi verzióra telepíthető.

## Mit javít a v1.5?

**A v1.4-ben az volt a gond, hogy a 34 katalógushivatkozást alapból elrejtettük**. Ezek közül sok valójában a megtervezett bútorokra és berendezésekre hivatkozik; ezért a 3D nézetből a szekrények jelentős része hiányzott.

A v1.5-ben külön kezeljük:

- **108 eredeti lapszerű rekord** (a méret és a pozíció ténylegesen az SCN-ből kiolvasott érték). Ezek külön 3D lapok és kijelölhetők.
- **2 nagy, takaró dekorpanel**. Alapértelmezésben rejtett, de a *Nagy takarófalak és dekorparavánok* jelölővel visszakapcsolható.
- **24 katalógusobjektum**, amelyeknek rendelkezésre áll a valódi külső mérete és pozíciója, de **a belső szerkezete nem szerepel részletes geometriaként** az SCN-ben. Ezekhez most nyitott szerkezeti 3D **vázlatot** készítünk (oldalak, fenék, tető, hátlap; néhány esetben illusztratív polc vagy osztó).
- **10 berendezés**. Ezeket külön burkolatként és előlapként illusztráljuk, nem szekrénylapként.

**Nagyon fontos:** a program által becsült oldallapok, polcok, osztók stb. **nem eredeti SCN-alkatrészrekordok**, és méretük **nem használható közvetlenül szabásjegyzékhez vagy CNC-hez**. A katalógusobjektumok *külmérete* az eredeti fájlból származik, de belső felépítésüket a KitchenDraw külön katalógusa nélkül nem ismerjük. A program külön jelzi a vázlatos elemeket.

### Bútorok láthatósága

Az SCN megnyitása után a **Bútorok 3D vázlatai (becsült)** kapcsoló alapból *be van kapcsolva*. Külön jelölővel visszakapcsolhatók a nagyméretű takarófalak és a kisméretű szerelvények. A név szerinti *Szekrények és berendezések* listában kattintással az adott objektumra lehet ugrani, annak forrásbeli külméretét megnézni. A területek térbeli csoportok, nem KitchenDraw-azonosítók.

A privát `64F080FA_4198_01.scn` minta alapján jelenleg 4 térbeli terület különíthető el. A két legnagyobb 62 és 44 valódi lapszerű rekordot tartalmaz; a többi a területválasztóval érhető el.

### Egérkezelés – változatlan

| Egér | Művelet |
| --- | --- |
| Jobb gomb + mozgatás | Tinkercad-szerű 3D forgatás |
| Görgő forgatása | Közelítés/távolítás |
| Görgő benyomva + mozgatás | Nézet eltolása |
| Bal gomb, *Szekrény* kijelölési mód | Eredeti katalógus-külméret vagy becsült bútoregyüttes-külméret |
| Bal gomb, *Alkatrész* kijelölési mód | Valódi SCN lap vagy **egyértelműen becsült** vázlatelem |
| Mérés be + két bal kattintás | Pontok közötti távolság és tengelyirányú eltérések mm-ben |

Megmarad a saját világos tölgy, matt fehér és grafit anyagstílus. A geometria szándékosan egyszerűsített, nem a KitchenDraw rajzolási vagy textúrarendszerét másolja.

## Fejlesztés és tesztek

A projekt lokálisan: `npm install`, `npm test`, `npm run build`, `npm run desktop`. A privát mintával további teszt:

```shell
SCN_TEST_FILE=/path/to/64F080FA_4198_01.scn node tests/test_scn_structure.mjs
SCN_TEST_FILE=/path/to/64F080FA_4198_01.scn node tests/test_scn_layout.mjs
```

A privát SCN **nincs a nyilvános GitHubban**. A GitHub Actions Windows-runnert használ Electron + Inno Setup telepítőhöz. A telepítő nincs digitálisan aláírva; a Windows SmartScreen figyelmeztethet.

**Korlát:** a teljes KitchenDraw katalógusgeometria, a tényleges bútorhierarchia és az egyes elforgatások nem olvashatók ki megbízhatóan ebből az SCN-rekordváltozatból. A katalógusbútor-vázlatok vizuális tájékozódáshoz készültek, nem hiteles visszafejtett gyártási alkatrészek.
