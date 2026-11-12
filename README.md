# SCN Viewer v1.2.0 – saját ablakos Windows alkalmazás

**Javítás a v1.1 indulási hibájára:** az előző telepítő rejtett PowerShell-kiszolgálót és böngészőt indított, ezért egyes gépeken az alkalmazás nem jelent meg. A v1.2 önálló **`SCN Viewer.exe`** programot telepít, amely közvetlenül saját asztali ablakot nyit. Nem kell hozzá alapértelmezett böngésző, külön szerver, Python vagy Node.js. A helyi HTTP API az alkalmazáson belül, véletlenszerű szabad loopback porton indul. Az alkalmazás bezárásakor leáll.

## Kész telepítő letöltése: GitHub Actions / Artifacts

1. Nyisd meg a [SCN Viewer Windows telepítő Actions](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml) oldalt.
2. Kattints a legutóbbi zöld pipás futásra.
3. Az **Artifacts** résznél töltsd le az **`SCN_Viewer_v1.2.0_Telepito`** csomagot.
4. Csomagold ki a ZIP-ből a **`SCN_Viewer_v1.2.0_Telepito.exe`** fájlt és futtasd.
5. Ugyanabba a felhasználói telepítési mappába frissít, mint a v1.1. Hagyja a korábbi SCN adatokat és beállításokat. Megnyitás: **SCN Viewer** ikon az asztalon vagy a Start menüben.

A telepítő asztali parancsikont, Start menü parancsikont, magyar nyelvű telepítési varázslót és eltávolítást tartalmaz. Nem igényel rendszergazdai jogosultságot. Saját EXE-t telepít a korábbi PowerShell/VBS indító helyett. A program mérete nagyobb lesz, mert a 3D böngészőmotort is tartalmazza.

## Használat

- **Jobb egérgomb húzva:** 3D forgatás.
- **Görgő:** zoom; **benyomott görgő húzva:** eltolás.
- **Bal egérgomb:** szekrény vagy alkatrész kiválasztása; választó a bal oldali panelen.
- **Méretezés bekapcsolva:** bal kattintással két mérőpont, mm-es távolság és X/Y/Z különbségek.
- **Fájlmegnyitás:** OBJ/STL/3DS/GLB/GLTF közvetlenül; SCN KitchenDraw Bridge segítségével.

**Fontos:** a jelenlegi SCN-megnyitás nem önálló SCN-parser. A KitchenDraw saját katalógusait és SDK2-bővítményét igényli. A csatolt eredeti SCN valódi geometriájának importját ezen a gépen KitchenDraw nélkül nem tudtuk hitelesen kipróbálni. A telepítő önmagában nem teszi elérhetővé a KitchenDraw katalógusadatokat. A bővítmény fordítója az SCN Viewer Start menü **KitchenDraw Bridge – beállítás** parancsikonján indítható.

Az adatok nem kerülnek internetes szerverre; a 3D megjelenítő offline működik. A program forrása nyilvános, nincs aláírva tanúsítvánnyal, ezért a Windows SmartScreen figyelmeztethet.

## KitchenDraw Bridge beállítása Windows 11-en – első alkalom

1. Telepítsd és indítsd el a **KitchenDraw** támogatott verzióját (és a tervhez szükséges katalógusokat). A SDK2 a `KD.SDK2.dll` fájlja.
2. A Start menüből indítsd a **KitchenDraw Bridge – beállítás** parancsikont (vagy a `Build_KitchenDraw_Bridge.bat` fájlt). A segéd keresni fogja a `KD.SDK2.dll` fájlt a szokásos helyeken, vagy bekéri a helyét. Ha sikeres a fordítás, a DLL itt lesz: `KitchenDrawBridge\KitchenDrawBridge.dll`.
3. A KitchenDraw-ban nyisd meg a **? → Service → Plugin Manager** menüt, regisztráld a lefordított `KitchenDrawBridge.dll` fájlt, és állítsd aktívra. Alternatíva: a KitchenDraw telepítési mappájából a `SPACE.INI` `[Plugins]` szakaszában regisztrálható. A regisztráció/aktiválás után **indítsd újra a KitchenDraw-t**.
4. A Start menüből (vagy az asztalról) indítsd az **SCN Viewert**. Forrásból futtatva a `Start_ScnViewer.bat` a régi böngészős, fejlesztői módhoz használható. A saját SCN Viewer alkalmazásablak megnyílik.
5. A „KitchenDraw kapcsolat” panelben ellenőrizd, hogy **„KitchenDraw Bridge: kapcsolódva”** jelenik-e meg. Válaszd a **„SCN / 3D fájl megnyitása”** gombot, és nyisd meg a saját `.scn`-edet, pl. `64F080FA_4198_01.scn`.
6. A Viewer a helyi ideiglenes mappában átadja a terv **másolatát** a KitchenDraw-nak. A KitchenDraw SDK a katalógusok alapján OBJ-t exportál, a Viewer automatikusan megjeleníti. Nincs szükség kézi OBJ-exportálásra **a telepítés után**.

**A forrásfájl nem módosul.** A terv és az exportok a felhasználó gépén maradnak a `%LOCALAPPDATA%\ScnViewerBridge\queue` mappában. A helyi kiszolgáló csak `127.0.0.1:8765` címen figyel, az SCN nem töltődik fel a GitHubra vagy más internetes szerverre. A telepítőben a Three.js és az Electron futtatókörnyezete helyben van, ezért a 3D nézegetéshez internet nem szükséges. Csak a nyers forrásból futtatott fejlesztői nézet használ CDN-t. A régebbi helyi feldolgozási fájlok törölhetők a Viewer és a KitchenDraw leállítása után.

### Miért nem önálló SCN-parser?

Az SCN fájl a KitchenDraw objektumainak katalogizált leírását és kapcsolódó adatait is tartalmazza, nem szabványos OBJ/STL háromszögháló. Megbízható alkatrészméretekhez nem lehet hiányzó geometriát kitalálni. A hivatalos SDK rendelkezik `Scene.Load(path)` és `Scene.Export3dGeometry(path,...)` műveletekkel, ezért ezeket használjuk.

A bővítmény **soha nem dob el nem mentett KitchenDraw-tervet**: ha egy másik terv módosított állapotban van megnyitva, a feldolgozás hibajelzést ad. Mentsd el, majd válaszd újra az SCN-t a Viewerben. Az export a tervhez szükséges KitchenDraw-katalógusok és SDK rendelkezésre állásától függ.

### Ha a Bridge nem kapcsolódik

- KitchenDraw fut-e? A bővítmény be van-e kapcsolva a Plugin Managerben?
- A build során valóban a helyi KitchenDraw-hoz tartozó `KD.SDK2.dll` fájlt adtad meg?
- A helyi Viewer `SCN Viewer.exe` alkalmazást indítottad? GitHub Pages-en nem működik a helyi SCN-átalakító.
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
- `desktop/main.cjs` + `desktop/server.cjs` – teljes értékű Electron Windows-ablak saját helyi, véletlenszerű portot használó kiszolgálóval. A régi PowerShell-indító megmaradt kizárólag fejlesztői forrásként, de a telepített alkalmazás nem használja.
- `KitchenDrawBridge/Plugin.cs` – KitchenDraw SDK2 plugin, a KitchenDraw felületének szálán dolgozik (WinForms Timer, nem háttérszálon SDK-hívás).
- `Build_KitchenDraw_Bridge.*` – fordítóindító a **helyileg telepített** SDK-hoz.
- `tests/` – statikus UI- és mintageometria-tesztek.

Az eredeti, a beszélgetésben csatolt SCN **nincs a GitHub-projektbe vagy a terjeszthető ZIP-be becsomagolva**. Semmilyen ismeretlen privát tervet nem publikálunk automatikusan.

## Tesztek és ismert korlátok

- A JS fájl szintaxisa Node.js-szel ellenőrizhető: `node --check viewer/main.js`.
- A UI elem-/vezérlés-azonosítók és a 600×400×18 példalap teszttel ellenőrizhetők: `python tests/test_interface.py` és `python tests/test_geometry.py` (utóbbihoz `trimesh` kell).
- **Nem igazolt:** a KitchenDraw Bridge DLL helyi fordítása, valódi KitchenDraw alatti plugin-betöltés, a csatolt SCN teljes geometriájának exportja és az ebből kapott OBJ dimenzióinak hitelesítése. Ezekhez a felhasználó Windows gépe és a KitchenDraw SDK/katalógusai szükségesek. Az itt átadott v1.2 asztali kiadás, nem gyártásra hitelesített CAD-konverter.

## Hivatalos SDK2 hivatkozások

- [KitchenDraw plugin fejlesztés és regisztráció](https://insitu.education/sdk2/doc/articles/plugins.html)
- [Scene.Load](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Load.html)
- [Scene.Export3dGeometry](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Export3dGeometry.html)
- [Scene.Object dimenziók és objektumfa](https://insitu.education/sdk2/doc/api/KD.SDK2.Scene.Object.html)
