# SCN Viewer v1.3.0 – önálló SCN megnyitás (KitchenDraw nélkül)

A program saját Windows-ablakban fut, közvetlenül beolvassa a felhasználó által kiválasztott `.scn` fájlt. Nem kell hozzá KitchenDraw, SDK, Bridge, Node.js vagy hálózati kapcsolat.

## Letöltés, telepítés

1. [GitHub Actions / Windows telepítő](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml).
2. A legutóbbi zöld pipás futásban: **Artifacts → SCN_Viewer_v1.3.0_Telepito**.
3. Töltsd le a ZIP-et, csomagold ki a `SCN_Viewer_v1.3.0_Telepito.exe` fájlt, majd telepítsd.
4. A telepítő frissíti a korábbi 1.1/1.2 kiadást; a Start menüből és asztalról indítható.

## Valódi SCN fájl megnyitása

A 2026-11-12-én kapott `64F080FA_4198_01.scn` mintafájlból ellenőrizhetően **463 elhelyezett 3D objektum** adata olvasható ki, amelyeknél megvan a milliméteres X/Y/Z méret és pozíció. Ezeket nem a demóból vesszük: mindegyik objektum közvetlenül a kiválasztott SCN rekordjából készül, KitchenDraw nélkül.

**Fontos pontossági korlát:** ez részleges, önálló SCN-dekóder, nem a KitchenDraw formátumának teljes implementációja. A katalógushoz kötött, részletes görbe geometriát, textúrákat, minden objektum elforgatását és a szekrények eredeti hierarchiáját a mintafájl alapján nem tudtuk visszafejteni. A tárolt méretből és pozícióból befoglaló téglatest/henger készül; a pontos alkatrészszabás és CNC nem alapozható ezekre az egyszerűsített felületekre. A kijelölt alkatrész megjelenített **befoglaló mérete** a fájlból származik, a kétpontos mérés viszont a megjelenített közelítő felületen történik.

Más, eltérő SCN-verziók esetén a program egyértelmű hibaüzenetet ad, ha nem találja a támogatott rekordokat. Nem jelenít meg helyettük bemutatómodelleket.

## Kezelés

| Művelet | Egér |
| --- | --- |
| Forgatás | jobb gomb húzása |
| Nagyítás | görgő |
| Eltolás | benyomott görgő húzása |
| Alkatrész / szekrénycsoport | bal kattintás, választó a panelen |
| Kétpont távolság | „Mérés bekapcsolása”, majd két bal kattintás |

A felismert bútorcsoportokat a Viewer megpróbálja térbeli befoglalás alapján hozzárendelni ismert nevű rekordokhoz. Ez csak közelítő csoportosítás, **nem** az eredeti bútorhierarchia. Minden mm értéket a forrásmodell-egység skálázása befolyásol; SCN esetén automatikusan 1 mm/egységre állítjuk.

## Technika és teszt

- `viewer/scn-parser.js`: tisztán JavaScriptben megvalósított, helyi bináris SCN objektumdekóder.
- `viewer/main.js`: Three.js 3D renderelés, kiválasztás, mérés, direkt SCN import.
- `desktop/main.cjs`, `desktop/server.cjs`: saját Electron Windows-ablak és csak helyi statikus kiszolgáló (nincs Bridge és SCN-feltöltés).
- `tests/test_scn_parser.mjs`: bináris rekord- és mérettesztek; saját mintafájl helyi ellenőrzéséhez: `SCN_TEST_FILE=... node tests/test_scn_parser.mjs` (GitHubra **nem** töltjük fel a felhasználó magán SCN fájlját).
- GitHub Actions: Electron csomag, Inno Setup Windows EXE, Artifacts.

A Windows telepítő kódaláírás nélkül készül, ezért SmartScreen figyelmeztetést adhat. Az első telepítő Windowsban történő kézi grafikus ellenőrzése még szükséges.
