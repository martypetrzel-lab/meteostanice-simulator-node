## 🌦️ O projektu EIRA

EIRA v tuto chvíli **neběží na skutečném hardware**, ale v **real-time simulátoru**.

Simulátor není demo ani zrychlená hra.  
Každá minuta, hodina i noc odpovídá **skutečnému času**.  
Zařízení v něm žije stejně pomalu, nejistě a omezeně, jako by žilo venku.

Cílem simulátoru je **ověřit chování budoucího fyzického zařízení**:
- jak reaguje na nedostatek energie
- jak zvládá extrémní počasí
- kdy má smysl měřit a kdy raději šetřit
- jak se rozhoduje na základě minulých zkušeností

---

## 🔌 Budoucí reálné zařízení

Simulátor není cíl.  
Je to **přípravná fáze pro skutečnou meteostanici postavenou na ESP32**.

Veškerá logika, paměť a rozhodování jsou navrhovány tak, aby:
- šly **beze změny přenést na hardware**
- odpovídaly reálným fyzikálním omezením
- počítaly s výpadky, chybami i krizemi

Až EIRA vyjde ven do skutečného světa,  
nebude se „učit od nuly“.  
Už bude vědět, co znamená noc, mráz, bouřka i hlad po energii.

---

## 👁️ Poznámka k aktuálnímu stavu

V tuto chvíli **nemusí být vidět žádné UI**  
a projekt se může navenek tvářit jako nefunkční.

Pod povrchem ale:
- běží simulace
- ukládá se paměť
- vyhodnocují se stavy
- sbírají se zkušenosti

EIRA zatím roste pod pokličkou.

# 📜 CHANGELOG – Projekt EIRA

> EIRA je experimentální simulátor autonomní meteostanice, která se neučí jen měřit,
> ale rozumět světu, energii a sama sobě.

---

## 🟢 v0.1 – První dech
**(ZÁLOHA 0.1)**

- základní Node.js simulátor
- jednoduchý běh v čase
- generování teploty a světla
- statický svět bez paměti
- žádná energie, žádné rozhodování
- cíl: ověřit základní funkčnost simulátoru

---

## 🟢 v0.2 – Svět dostává tvar
**(ZÁLOHA 0.2)**

- oddělení světa a zařízení
- základní den / noc
- realističtější změny světla
- první struktura `state`
- příprava na paměť a historii

---

## 🟢 v0.3 – Paměť a historie
**(ZÁLOHA 0.3)**

- zavedení paměti zařízení
- ukládání denních hodnot
- výpočet min / max
- rozlišení dnešních dat a historie
- odhaleny limity nekonzistentní paměti

---

## 🟢 v0.4 – Stabilizace dat
**(ZÁLOHA 0.4)**

- sjednocení struktury paměti
- opravy pádů při zápisu dat
- bezpečná migrace paměti
- stabilní běh při změnách struktury

---

## 🟡 B 3.0 – Zrození EIRA

- oddělení modulů `world`, `device`, `brain`
- vznik koncepce autonomního zařízení
- základní mozek (`brain.js`)
- zařízení zatím bez stresu a krizí

---

## 🟡 B 3.1 – Reálný čas

- simulátor běží 1:1 s reálným časem
- žádné zrychlování ani demo smyčky
- připraveno pro dlouhodobý běh

---

## 🟡 B 3.2 – Energie vstupuje do hry

- zavedení baterie a SOC
- simulace příjmu energie ze světla
- simulace spotřeby zařízení
- energie jako omezený zdroj
- zařízení může být ohroženo vybitím

---

## 🟡 B 3.3 – Mozek začíná přemýšlet

- mozek vyhodnocuje stav světa
- reakce na energetické podmínky
- ukládání kontextu rozhodování
- první náznaky adaptivního chování

---

## 🟡 B 3.4 – Stres & nestabilita

- testování výkyvů světla
- simulace energetické nestability
- odhalení limitů paměti a rozhodování
- rozhodnutí odložit UI ve prospěch reality

---

## 🟢 B 3.5 – Stabilní mysl
**(AKTUÁLNÍ STABILNÍ VERZE)**

- stabilní backend simulátoru
- konzistentní struktura `state`
- spolehlivá paměť zařízení
- zařízení sleduje svět, energii i historii
- záměrně bez UI
- připraveno na dlouhodobé scénáře a krize

---

## 🔮 Další směr (preview)

- B 3.6 – dlouhodobá paměť a učení
- B 3.7 – přehřátí, mráz, stres, větrák
- B 3.8 – sezónnost, délka dne
- B 3.9 – kombinace extrémů
- 4.0 – predikce a přežití
