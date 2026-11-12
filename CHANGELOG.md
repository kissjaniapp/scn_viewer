# Változások

## v1.0 – SCN Bridge (2026-11-12)

- Új: SCN fájl közvetlen kiválasztása a Viewerben, helyi konverziós feladatküldéssel.
- Új: KitchenDraw SDK2 alapú, telepített KitchenDraw-ban futó feladatfeldolgozó plugin (`Scene.Load` és `Scene.Export3dGeometry`).
- Új: SDK-ból kinyert KitchenDraw objektumméretek külön, milliméteres listában.
- Új: natív PowerShell 5.1 helyi HTTP kiszolgáló SCN fájlfogadással és feldolgozásállapot-jelzéssel.
- Új: Bridge kapcsolatjelző és hibakezelés, útmutató az alkalmazásban.
- Biztonság: a webkiszolgáló csak loopback címen figyel; 50 MB feltöltési korlát; nincs felhőfeltöltés, és a plugin nem dobja el a nem mentett tervet.
- Ismert korlát: a Windows KitchenDraw bővítmény környezetbeli tesztje és a felhasználói SCN teljes megjelenítése még hátravan.

## v0.2 – Egérkezelés, kijelölés és mérés

- Jobb forgatás, görgő nagyítás, középső pan, bal gomb kijelölés/mérés.
- Szekrény és alkatrész módban méretkijelzés, kétpontos mérés.
- Igény szerinti renderelés, rács, nézetek, bemutató szekrények.