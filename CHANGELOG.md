# SCN Viewer – változások

## v1.7.0 – X/Y/Z elhelyezési diagnosztika és precíz igazítás

- A v1.6.0 Tinkercad-szerű egérkezelése, SCN szög/forgáspont kezelése, megjelenítése változatlan.
- A katalógusbútorok becsült befoglaló téglatestei közötti jelentős térbeli átfedések figyelmeztető listája (X, Y, Z mm); ez *nem* állítja, hogy a tényleges alakzatok ütköznek.
- A kijelölt SCN-objektum **külön X, Y és Z mm eltolt helyzete** állítható. A hozzá tartozó összes becsült alkatrész együtt mozdul; elforgatás és külméret változatlan.
- Az eredeti SCN-koordináták, méretek és maga a fájl nem változnak. Külön „Eredeti helyzet” gombbal a korrekció visszaállítható.
- A korrekciókat a Windows felhasználói alkalmazásadat-mappában, fájl-ujjlenyomat szerint tárolja, így a program újraindítása és újratelepítése után is megmaradnak.
- Az SCN-forrásadatokból nem igazolható bútorelemeken **nincs automatikus eltolás**: a pontos geometria és katalógusadatok nem minden esetben állnak rendelkezésre.
- Új tesztek: mindhárom tengely mm-es eltolása, a forrásrekordok sértetlensége, átfedésjelzés, biztonságos helyi mentés és visszaolvasás.

# SCN Viewer v1.5.0 – bútorok láthatósága

- A korábban rejtett **34 SCN katalógushivatkozás** megjelenítése alapból: 24 bútorszerű egységhez nyitott, különálló oldalakból/tetőből/fenékből/hátlapból álló **becsült** 3D vázlat, 10 géphez berendezéssziluett készül.
- **Nem** állítjuk, hogy a vázlat alkatrészei a KitchenDraw eredeti elemei lennének. Az eredeti külméret mm-ben pontosan a beolvasott rekordból ered; a belső elemek kizárólag vizuális illusztrációk.
- A két 5 méter körüli nagyméretű dekorparaván alapból rejtve, kapcsolóval mutatható: ne takarja el a belső berendezéseket.
- A többi **108 tényleges SCN lap** megőrizve, külön kijelölhető.
- Név szerinti kattintható lista és fókusz a katalógusbútorokon. A becsült lap és a valódi lap eltérő megnevezést/magyarázatot kap kijelölésnél.
- A bal egérgomb a **legközelebbi látható** felületet jelöli, nem egy háttérben található panelt.
- A v1.4-ben jól működő Tinkercad-szerű kameraforgatáshoz **nem nyúltunk**.
- Minta-SCN szerkezeti és megjelenítési teszteket bővítettük; a felhasználó privát SCN fájlja nem kerül GitHubra.
