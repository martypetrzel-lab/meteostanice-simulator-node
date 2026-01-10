# 🌦️ EIRA – Node.js simulátor autonomní meteostanice

Tento repozitář obsahuje **hlavní backend simulátor projektu EIRA**.

EIRA v tuto chvíli **neběží na skutečném hardware**, ale v **real-time simulátoru**,
který slouží jako **plnohodnotná náhrada budoucího fyzického zařízení**.

Toto není demo ani zrychlená simulace.

Každá minuta, hodina i noc odpovídá **skutečnému času**.  
Zařízení zde žije stejně pomalu, nejistě a omezeně, jako by žilo venku.

---

## 🧠 Smysl simulátoru

Cílem simulátoru je **ověřit chování budoucí autonomní meteostanice** v dlouhém horizontu:

- jak reaguje na **nedostatek energie**
- jak zvládá **špatné počasí a dlouhou šeď**
- kdy má smysl měřit a kdy raději šetřit
- jak se rozhoduje na základě **historie a nejistoty**
- zda dokáže **přežít bez zásahu člověka**

Simulátor je navržen tak, aby:
- neodpouštěl chyby
- nebyl „hodný“
- a **dlouhodobě odhaloval slabá místa logiky**

---

## 🔌 Vztah k budoucímu hardware

Simulátor **není cílový produkt**.  
Je to **přípravná fáze pro skutečnou meteostanici postavenou na ESP32**.

Veškerá logika je navržena tak, aby:
- šla **beze změny přenést na hardware**
- respektovala **fyzikální a energetická omezení**
- počítala s výpadky, chybami i krizemi

Až EIRA vyjde ven do skutečného světa:
- nebude se učit od nuly
- už bude znát noc, hlad po energii i dlouhou šedou
- a bude mít za sebou stovky hodin „života“

---

## 🧠 Architektura simulátoru

Backend je rozdělený do oddělených logických vrstev:

- `world` – simulace prostředí (čas, světlo, teplota, scénáře, stres)
- `energy` – energetický model (příjem, spotřeba, Wh, SoC, confidence)
- `brain` – rozhodovací logika (plánování, režimy, přežití)
- `memory` – dlouhodobá paměť a historie
- `simulator` – orchestrace systému + persistence stavu

Každá vrstva funguje nezávisle a je navržena tak,
aby mohla být později přenesena do reálného zařízení.

---

## 🔋 Energie & rozhodování

EIRA pracuje s energií jako s **omezeným a nejistým zdrojem**:

- solární příjem (světlo + historie)
- aktuální spotřeba zařízení
- integrace energie (Wh, rolling 24 h)
- odhad stavu baterie (SoC + confidence)
- predikce zbytku dne
- výpočet výdrže v hodinách

Na základě toho přepíná provozní režimy:

- `COMFORT`
- `BALANCED`
- `SAVE`
- `SURVIVAL`

Cílem není maximální výkon, ale **dlouhodobé přežití a stabilita**.

---

## 🧪 Aktuální stav

- backend simulátoru je **stabilní**
- systém běží v **reálném čase**
- probíhá dlouhodobé testování (21denní cykly)
- UI může být oddělené nebo vypnuté

Pokud projekt navenek působí „neaktivně“:
- simulace běží
- paměť se ukládá
- rozhodování pokračuje

EIRA zatím roste **pod pokličkou**.

---

## 📜 CHANGELOG – Projekt EIRA

> EIRA je experimentální simulátor autonomní meteostanice,  
> která se neučí jen měřit, ale rozumět světu, energii a sama sobě.

### 🟢 v0.1 – První dech (ZÁLOHA 0.1)
- základní Node.js simulátor
- statický svět bez paměti

### 🟢 v0.2 – Svět dostává tvar (ZÁLOHA 0.2)
- oddělení světa a zařízení
- den / noc
- příprava na paměť

### 🟢 v0.3 – Paměť a historie (ZÁLOHA 0.3)
- ukládání denních hodnot
- min / max
- první historická data

### 🟢 v0.4 – Stabilizace dat (ZÁLOHA 0.4)
- sjednocení struktury paměti
- bezpečná migrace dat
- stabilní běh

### 🟡 B 3.0 – Zrození EIRA
- oddělení `world / energy / brain`
- vznik autonomního chování

### 🟡 B 3.1 – Reálný čas
- simulátor běží 1:1 s reálným časem

### 🟡 B 3.2 – Energie vstupuje do hry
- baterie, SoC
- simulace příjmu a spotřeby

### 🟡 B 3.3 – Mozek začíná přemýšlet
- reakce na energetické podmínky
- adaptivní chování

### 🟡 B 3.4 – Stres & nestabilita
- výkyvy světla
- energetická nestabilita
- priorita reality před UI

### 🟢 B 3.32.0 – Svět & realistická simulace
- scénáře počasí
- stresové vzorce
- 21denní cyklus
- svět nereaguje na mozek

### 🟢 B 3.33.0 – Energie & Power-Path
- realistický energetický model
- Wh bez driftu
- SoC + confidence
- rolling 24 h bilance

### 🟢 B 3.34.0 – Mozek × Energie (STABILNÍ JÁDRO)
- výdrž v hodinách
- energetická marže
- režimy COMFORT / SAVE / SURVIVAL
- učení solárního profilu
- den / noc z lux
- predikce zbytku dne

---

## 👤 Autor

**Martin Petržel**

Osobní vývojový a testovací projekt.  
Nejde o hotový produkt, ale o **dlouhodobý výzkum autonomního zařízení**.

---

## 🔐 Licence & použití

Projekt je open-source, ale **není určen ke komerčnímu využití bez souhlasu autora**.

Tento repozitář je licencován pod licencí  
**Creative Commons Attribution-NonCommercial 4.0 (CC BY-NC 4.0)**.

Podrobnosti viz soubor `LICENSE`.
