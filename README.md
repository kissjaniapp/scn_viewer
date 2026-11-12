# SCN Viewer v1.4.0 – önálló Windows alkalmazás

**KitchenDraw nélkül működő**, magyar nyelvű 3D nézegető és mm-es mérő. Saját asztali ablakkal települ Windows 11-re. Nincs Bridge, KitchenDraw vagy internetes SCN-feldolgozás.

## Telepítés (GitHub Artifacts)

1. Nyisd meg a [Windows telepítő munkafolyamatát](https://github.com/kissjaniapp/scn_viewer/actions/workflows/windows-installer.yml).
2. A legutóbbi sikeres futás **Artifacts** részében válaszd a `SCN_Viewer_v1.4.0_Telepito` csomagot.
3. A ZIP-ből csomagold ki a `SCN_Viewer_v1.4.0_Telepito.exe` telepítőt. A korábbi kiadás helyére telepíthető.
4. A Start menüben/asztali ikonon keresztül indítsd el; saját ablakban fut.

## SCN megnyitás és megjelenés

A megnyitás gombbal közvetlenül betölthetők a támogatott KitchenDraw SCN bináris rekordszerkezettel rendelkező állományok. A 2026. november 12-i, privát `64F080FA_4198_01.scn` mintából a dekóder 463 mérettel és pozícióval rendelkező rekordot olvasott ki; 101 dekorpanelt és 9 egyéb vékony lapot **külön-külön** jelenít meg. A névvel rendelkező katalógusobjektumok megőrzik a tárolt befoglaló méretüket, de alapból csak az oldalsávból találhatók meg (a körvonalas nézet választható), és nem takarják el a tényleges lapszerkezetet.

A felismerhető lapok 4 térbeli területbe szervezhetők (63 / 45 / 1 / 1 elem); alapból a legnagyobb látható, a többi a „Melyik bútoregyüttest nézed?” listából választható. A területek **nem igazolt KitchenDraw szekrények**: a Viewer a lapok szomszédságából következtet, így több szekrény is egy területbe kerülhet. Ezt nem helyettesítjük kitalált szekrénynevekkel.

### Saját megjelenítési stílusok

- **Világos tölgy:** finoman generált faerezet (nem KitchenDraw textúra).
- **Matt fehér:** tiszta, jól áttekinthető korpuszrajz.
- **Grafit:** sötétebb, műszaki bemutató nézet.

A vékony panelek és a nagy burkoló referenciák elkülönítése fontosabb a fotórealisztikus anyagmintázatnál. A látvány bármikor váltható.

## Kezelés

| Egér | Funkció |
| --- | --- |
| Jobb gomb húzása | Stabil 3D körbeforgatás a függőleges tengely körül (Tinkercad-szerű CAD-mozgás) |
| Benyomott görgő húzása | Nézet eltolása |
| Görgő tekerése | Nagyítás, kicsinyítés |
| Bal kattintás | Látható lap vagy becsült bútoregyüttes kiválasztása |
| Mérés gomb + két bal kattintás | Két felületi pont térbeli távolsága és ΔX/ΔY/ΔZ mm-ben |

## Műszaki pontosság és ismert korlát

A dekóder **nem a teljes KitchenDraw SCN dokumentáció alapján készült**. A támogatott SCN rekordok X/Y/Z méreteit és elhelyezkedését képes beolvasni, de a katalógusokból származó egyedi alkatrészformák, minden elforgatás, hiteles bútorfa és fotótextúra nem áll rendelkezésre. A lapokat ezért egyszerű téglatestként rajzoljuk a *forrásbeli külön méretekkel*, a katalógusobjektumokat pedig csak opcionális becsült körvonalakkal. Ezek a modellek **nem gyártásra hitelesített CAD geometria**, és CNC/programgenerálásra önmagukban nem alkalmasak.

A kívánt pontosság a modellrekord méretére vonatkozik; a kétpontos mérés a megjelenített, helyettesítő síkfelületeket méri. Más SCN formátumváltozatokhoz további dekóderfejlesztés szükséges lehet.

## Fejlesztői ellenőrzés

`npm test` ellenőrzi a dekódert, területfelismerést, 3D kezelőket és helyi HTTP szervert. Ha a privát mintafájlt elérhetővé teszed helyben a teszteknek, a saját SCN konkrét, 463 rekordos változatát a következővel is ellenőrizheted:

```
SCN_TEST_FILE=/path/to/64F080FA_4198_01.scn node tests/test_scn_parser.mjs
SCN_TEST_FILE=/path/to/64F080FA_4198_01.scn node tests/test_scn_layout.mjs
```

A privát SCN fájlt **nem szabad** hozzáadni a nyilvános repositoryhoz. A projekt Inno Setup + Electron alapon állít elő Windows telepítőt GitHub Actions Artifacts-ba. A telepítő nincs digitálisan aláírva, így SmartScreen figyelmeztethet.
