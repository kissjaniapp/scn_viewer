# SCN Viewer v1.4.0 – panelközpontú nézet és saját anyagok

- Javított jobb egérgombos CAD forgatás: a Z-up kamera még az OrbitControls létrehozása **előtt** áll be. Tengelyváltáskor a vezérlő újra létrejön; nem fordulhat rossz tengely körül az elavult koordináta-transzformáció miatt.
- Szerkezeti elemek előnyben: a feltöltött SCN 101 dekorpanelje és 9 további vékony lapja **külön** testként jelenik meg.
- Az SCN katalógusreferenciák és nagy, tömör befoglaló testek alapból **nem** takarják el a lapokat. A névvel rendelkező katalógusobjektumok áttetsző körvonalakként bekapcsolhatók; a 260+ apró szerelvény szintén külön kapcsolható.
- Automatikus térbeli területek: a konkrét mintában 63 / 45 / 1 / 1 szerkezeti lap. Alapértelmezésben a legnagyobb együttesre nagyít, másik az oldalsávban választható.
- Saját megjelenítés: generált, visszafogott tölgyfa erezet; matt fehér és grafit változat.
- Katalógusobjektum-lista névvel és forrásbeli befoglaló mérettel, kattintásra megmutatható és fókuszálható.
- Az eredeti KitchenDraw katalógusgeometria, forgatások, valódi textúrák és bútorhierarchia továbbra sem állnak teljeskörűen rendelkezésre. Nem tekintjük a becsült csoportokat igazolt egyedi szekrényeknek.
- A valódi SCN-t nem tesszük nyilvánossá; a regresszióteszt helyben futott.
