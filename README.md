# SCN Viewer v1.0 – KitchenDraw SCN megnyitás és 3D méretezés

Magyar nyelvű, Windows 11-en futtatható **helyi** 3D megjelenítő, a korábbi v0.2 vezérléssel és egy KitchenDraw-hoz kapcsolódó SCN-importfolyamattal.

> **Fontos működési feltétel:** A KitchenDraw `.scn` saját, bináris jelenetfájl, amelynek teljes 3D tartalma külső katalógusokra hivatkozhat. Az itt mellékelt SCN-t **nem** sikerült teljes 3D modellé dekódolni függetlenül. A közvetlen `.scn` kiválasztást a **KitchenDraw SDK2 bővítmény** teszi lehetővé: a KitchenDraw beolvassa az SCN-t és OBJ-geometriát exportál, amelyet a Viewer automatikusan megjelenít. A KitchenDraw és a megfelelő katalógusok **szükségesek** ehhez, és a bővítményt az adott gépen kell lefordítani és telepíteni. A megoldás ezen a gépen, KitchenDraw futtatókörnyezet hiányában még **nem végtesztelt**.

## Telepítés Windows 11-en – első alkalom

1. Telepítsd és indítsd el a **KitchenDraw** támogatott verzióját (és a tervhez szükséges katalógusokat). A SDK2 a `KD.SDK2.dll` fájlja.
2. Duplakattintás a **`Build_KitchenDraw_Bridge.bat`** fájlra. A segéd keresni fogja a `KD.SDK2.dll` fájlt a szokásos helyeken, vagy bekéri a helyét. Ha sikeres a fordítás, a DLL itt lesz: `KitchenDrawBridge\KitchenDrawBridge.dll`.
3. A KitchenDraw-ban nyisd meg a **? → Service → Plugin Manager** menüt, regisztráld a lefordított `KitchenDrawBridge.dll` fájlt, és állítsd aktívra. Alternatíva: a KitchenDraw telepítési mappájából a `SPACE.INI` `[Plugins]` szakaszában regisztrálható. A regisztráció/aktiválás után **indítsd újra a KitchenDraw-t**.
4. Duplakattintás a **`Start_ScnViewer.bat`** fájlra. A böngésző megnyitja a `http://127.0.0.1:8765/` címet.
5. A „KitchenDraw kapcsolat” panelben ellenőrizd, hogy **„KitchenDraw Bridge: kapcsolódva”** jelenik-e meg. Válaszd a **„SCN / 3D fájl megnyitása”** gombot, és nyisd meg a saját `.scn`-edet, pl. `64F080FA_4198_01.scn`.
6. A Viewer a helyi ideiglenes mappában átadja a terv **másolatát** a KitchenDraw-nak. A KitchenDraw SDK a katalógusok alapján OBJ-t exportál, a Viewer automatikusan megjeleníti. Nincs szükség kézi OBJ-exportálásra **a telepítés után**.

**A forrásfájl nem módosul.** A terv és az exportok a felhasználó gépén maradnak a `%LOCALAPPDATA%\ScnViewerBridge\queue` mappában. A helyi kiszolgáló csak `127.0.0.1:8765` címen figyel, az SCN nem töltődik fel a GitHubra vagy más internetes szerverre. A Three.js betöltéséhez az első indításkor internet szükséges; a könyvtár a jsDelivr CDN-ről érkezik. A régebbi helyi feldolgozási fájlok törölhetők a Viewer és a KitchenDraw leállítása után.

### Miért nem önálló SCN-parser?

Az SCN fájl a KitchenDraw objektumainak katalogizált leírását és kapcsolódó adatait is tartalmazza, nem szabványos OBJ/STL háromszögháló. Megbízható alkatrészméretekhez nem lehet hiányzó geometriát kitalálni. A hivatalos SDK rendelkezik `Scene.Load(path)` és `Scene.Export3dGeometry(path,...)` műveletekkel, ezért ezeket használjuk.

A bővítmény **soha nem dob el nem mentett KitchenDraw-tervet**: ha egy másik terv módosított állapotban van megnyitva, a feldolgozás hibajelzést ad. Mentsd el, majd válaszd újra az SCN-t a Viewerben. Az export a tervhez szükséges KitchenDraw-katalógusok és SDK rendelkezésre állásától függ.

### Ha a Bridge nem kapcsolódik

- KitchenDraw fut-e? A bővítmény be van-e kapcsolva a Plugin Managerben?
- A build során valóban a helyi KitchenDraw-hoz tartozó `KD.SDK2.dll` fájlt adtad meg?
- A helyi Viewer `Start_ScnViewer.bat` fájlját indítottad? GitHub Pages-en nem működik a helyi SCN-átalakító.
- Ha a build hibás, a `KitchenDrawBridge/KitchenDrawBridge.csproj` projekthez használhatsz Visual Studio + .NET Framework 4.8 fejlesztőkörnyezetet is (Release/x86). A gyári SDK binárist jogtisztasági okból nem csomagoljuk.
- Ha az SCN export hibát jelez, ellenőrizd a hozzá tartozó katalógusokat. Alternatívaként a KitchenDraw saját **Fájl → Exportálás → 3D fájl (.OBJ)** művelete után az OBJ közvetlenül megnyitható.

## Egérkezelés és mérés

| Esemény | Művelet |
| --- | --- |
| Jobb egérgomb lenyomva + mozgatás | 3D forgatás |
| Görgő forgatása | Közelítés/távolítás |
| Görgő lenyomva + mozgatás | Modell eltolása |
| Bal gomb: Szekrény mód | Felismert bútorcsoport kijelölése és befoglaló méretei |
| Bal gomb: Alkatrész mód | A kiválasztott háromszögháló helyi méretei |
| Mérés bekapcsolva, 2 bal kattintás | 3D távolság, ΔX/ΔY/ΔZ, mm-ben |

A sarok- és élillesztés, 3D/felülnézet/elölnézet/oldalnézet, a 2-szekrényes tesztmodell, az OBJ/STL/3DS/GLB/GLTF import, a kijelölés és az igény szerinti újrarajzolás a v0.2 verzióból megmaradt.

**Méretezési pontosság:** a OBJ geometriában a metrikus egység nem kötelező szabvány. Az alapérték 1 modell-egység = 1 mm, de a *helyes skálát a valós méretekhez ellenőrizni kell*. A bővítmény SDK-jából származó **KitchenDraw elemek** külön listában szerepelnek milliméterben, így egy ismert mérettel összevethetők az importált OBJ méretei. Az exportált OBJ nem mindig őrzi meg a bútor–alkatrész hierarchiát. Ilyenkor a Viewer **nem állítja**, hogy az ismeretlen csoport ténylegesen egy szekrény; a teljes modell befoglaló méretét mutatja. A KitchenDraw eredeti objektumlistája ellenőrzésre használható, nem automatikus mesh-mapping.

## Műszaki felépítés

- `viewer/` – HTML/CSS/Three.js felület (nincs build lépés).
- `Start_ScnViewer.ps1` – PowerShell 5.1 alapú, `127.0.0.1`-re korlátozott statikus kiszolgáló + HTTP API; fájlméretkorlát 50 MB, Origin/Host ellenőrzés, ideiglenes munkakönyvtár.
- `KitchenDrawBridge/Plugin.cs` – KitchenDraw SDK2 plugin, a KitchenDraw felületének szálán dolgozik (WinForms Timer, nem háttérszálon SDK-hívás).
- `Build_KitchenDraw_Bridge.*` – fordítóindító a **helyileg telepített** SDK-hoz.
- `tests/` – statikus UI- és mintageometria-tesztek.

Az eredeti, a beszélgetésben csatolt SCN **nincs a GitHub-projektbe vagy a terjeszthető ZIP-be becsomagolva**. Semmilyen ismeretlen privát tervet nem publikálunk automatikusan.

## Tesztek és ismert korlátok

- A JS fájl szintaxisa Node.js-szel ellenőrizhető: `node --check viewer/main.js`.
- A UI elem-/vezérlés-azonosítók és a 600×400×18 példalap teszttel ellenőrizhetők: `python tests/test_interface.py` és `python tests/test_geometry.py` (utóbbihoz `trimesh` kell).
- **Nem igazolt:** a KitchenDraw Bridge DLL helyi fordítása, valódi KitchenDraw alatti plugin-betöltés, a csatolt SCN teljes geometriájának exportja és az ebből kapott OBJ dimenzióinak hitelesítése. Ezekhez a felhasználó Windows gépe és a KitchenDraw SDK/katalógusai szükségesek. Az itt átadott v1.0 fejlesztői/tesztkiadás, nem gyártásra hitelesített CAD-konverter.

## Hivatalos SDK2 hivatkozások

- [KitchenDraw plugin fejlesztés és regisztráció](https://insitu.education/sdk2/doc/articles/plugins.html)
- [Scene.Load](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Load.html)
- [Scene.Export3dGeometry](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Export3dGeometry.html)
- [Scene.Object dimenziók és objektumfa](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Object.html)