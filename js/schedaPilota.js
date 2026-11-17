import { recuperaDati } from "./api.js";
import { cambiaPagina } from "./navigazione.js";

const cacheDati = new Map();
const cacheImmaginiCommons = new Map();
const immaginiPiloti = new Map([
    ["franco_colapinto", "2026alpinefracol01right.avif"],
    ["pierre_gasly", "2026alpinepiegas01right.avif"],
    ["fernando_alonso", "2026astonmartinferalo01right.avif"],
    ["lance_stroll", "2026astonmartinlanstr01right.avif"],
    ["gabriel_bortoleto", "2026audigabbor01right.avif"],
    ["nico_hulkenberg", "2026audinichul01right.avif"],
    ["sergio_perez", "2026cadillacserper01right.avif"],
    ["valtteri_bottas", "2026cadillacvalbot01right.avif"],
    ["charles_leclerc", "2026ferrarichalec01right.avif"],
    ["lewis_hamilton", "2026ferrarilewham01right.avif"],
    ["esteban_ocon", "2026haasf1teamestoco01right.avif"],
    ["oliver_bearman", "2026haasf1teamolibea01right.avif"],
    ["rafael_camara", "2026haasf1teamrafcam01right.avif"],
    ["ryo_hirakawa", "2026haasf1teamryohir01right.avif"],
    ["lando_norris", "2026mclarenlannor01right.avif"],
    ["oscar_piastri", "2026mclarenoscpia01right.avif"],
    ["andrea_kimi_antonelli", "2026mercedesandant01right.avif"],
    ["george_russell", "2026mercedesgeorus01right.avif"],
    ["arvid_lindblad", "2026racingbullsarvlin01right.avif"],
    ["liam_lawson", "2026racingbullslialaw01right.avif"],
    ["yuki_tsunoda", "2026racingbullsyuktsu01right.avif"],
    ["isack_hadjar", "2026redbullracingisahad01right.avif"],
    ["max_verstappen", "2026redbullracingmaxver01right.avif"],
    ["alexander_albon", "2026williamsalealb01right.avif"],
    ["carlos_sainz", "2026williamscarsai01right.avif"]
].map(([nome, immagine]) => [normalizzaNome(nome), immagine]));
const loghiScuderie = new Map([
    ["alpine", "2026alpinelogowhite.avif"],
    ["cadillac", "2026cadillaclogowhite.avif"],
    ["ferrari", "2026ferrarilogowhite.avif"],
    ["haas", "2026haasf1teamlogowhite.avif"],
    ["haasf1team", "2026haasf1teamlogowhite.avif"],
    ["mclaren", "2026mclarenlogowhite.avif"],
    ["mercedes", "2026mercedeslogowhite.avif"],
    ["rbf1team", "2026racingbullslogowhite.avif"],
    ["racingbulls", "2026racingbullslogowhite.avif"],
    ["redbull", "2026redbullracinglogowhite.avif"],
    ["astonmartin", "2026astonmartinlogowhite.avif"],
    ["williams", "2026williamslogowhite.avif"],
    ["audi", "2026audilogowhite.avif"],
    ["audif1team", "2026audilogowhite.avif"]
]);

function normalizzaNome(nome) {
    return String(nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function recuperaDatiInCache(endpoint) {
    if (!cacheDati.has(endpoint)) {
        const richiesta = recuperaDati(endpoint);
        cacheDati.set(endpoint, richiesta);
        richiesta.then(dati => {
            if (dati === null) {
                cacheDati.delete(endpoint);
            }
        });
    }

    return cacheDati.get(endpoint);
}

function testoMetadato(valore) {
    return new DOMParser()
        .parseFromString(valore || "", "text/html")
        .body.textContent.trim();
}

function recuperaImmagineCommons(tipo, nome, anno) {
    const chiave = `${tipo}-${anno}-${normalizzaNome(nome)}`;
    if (!cacheImmaginiCommons.has(chiave)) {
        const descrittore = tipo === "logo" ? "Formula One team logo" : "Formula 1 portrait";
        const query = `${nome} ${descrittore} ${anno}`;
        const parametri = new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: query,
            gsrnamespace: "6",
            gsrwhat: "text",
            gsrlimit: "10",
            prop: "imageinfo",
            iiprop: "url|extmetadata",
            iiurlwidth: tipo === "logo" ? "300" : "700",
            format: "json",
            origin: "*"
        });
        const richiesta = fetch(`https://commons.wikimedia.org/w/api.php?${parametri}`)
            .then(risposta => {
                if (!risposta.ok) {
                    throw new Error(`Wikimedia Commons ha risposto con HTTP ${risposta.status}.`);
                }
                return risposta.json();
            })
            .then(dati => {
                const nomeNormalizzato = normalizzaNome(nome);
                const cognome = normalizzaNome(String(nome).trim().split(/\s+/).pop());
                const pagine = Object.values(dati.query?.pages || {})
                    .sort((prima, seconda) => prima.index - seconda.index);

                for (const pagina of pagine) {
                    const titolo = pagina.title || "";
                    const titoloNormalizzato = normalizzaNome(titolo);
                    const informazioni = pagina.imageinfo?.[0];
                    const metadati = informazioni?.extmetadata || {};
                    const licenza = testoMetadato(metadati.LicenseShortName?.value);
                    const licenzaLibera = /^(CC0|CC BY(?:-SA)?(?:\s|$)|Public domain)/i.test(licenza);
                    const fileAdatto = tipo === "logo"
                        ? /\.svg$/i.test(titolo) &&
                            titoloNormalizzato.includes(nomeNormalizzato) &&
                            /logo|emblem|badge/i.test(titolo)
                        : /\.(jpe?g|png|webp)$/i.test(titolo) &&
                            titoloNormalizzato.includes(cognome);

                    if (!fileAdatto || !licenzaLibera || !informazioni?.thumburl) {
                        continue;
                    }

                    const immagineUrl = new URL(informazioni.thumburl);
                    const paginaUrl = new URL(informazioni.descriptionurl);
                    if (
                        immagineUrl.protocol !== "https:" ||
                        !["thumb.wikimedia.org", "upload.wikimedia.org"].includes(immagineUrl.hostname) ||
                        paginaUrl.protocol !== "https:" ||
                        paginaUrl.hostname !== "commons.wikimedia.org"
                    ) {
                        continue;
                    }

                    const autore = testoMetadato(
                        metadati.Artist?.value || metadati.Credit?.value
                    );
                    if (/^CC BY/i.test(licenza) && !autore) {
                        continue;
                    }

                    return {
                        url: immagineUrl.href,
                        pagina: paginaUrl.href,
                        autore: autore || "Wikimedia Commons",
                        licenza
                    };
                }

                return null;
            });
        cacheImmaginiCommons.set(chiave, richiesta);
        richiesta.catch(() => cacheImmaginiCommons.delete(chiave));
    }

    return cacheImmaginiCommons.get(chiave);
}

function creaAttribuzioneImmagine(immagine) {
    const attribuzione = document.createElement("a");
    attribuzione.className = "attribuzione-immagine";
    attribuzione.href = immagine.pagina;
    attribuzione.target = "_blank";
    attribuzione.rel = "noopener noreferrer";
    attribuzione.textContent = `${immagine.autore} · ${immagine.licenza}`;
    return attribuzione;
}

export function creaElementoScuderia(nome, anno, constructorId = "") {
    const contenitore = document.createElement("span");
    contenitore.className = "scuderia-valore";

    const chiavi = [constructorId, nome].map(normalizzaNome);
    const logo = chiavi
        .map(chiave => loghiScuderie.get(chiave))
        .find(Boolean);

    const etichetta = document.createElement("span");
    etichetta.textContent = nome || "N/D";

    if (logo) {
        const immagine = document.createElement("img");
        immagine.className = "logo-scuderia";
        immagine.src = `assets/logos/${logo}`;
        immagine.alt = "";
        immagine.title = `Logo ${nome}`;
        immagine.loading = "lazy";
        contenitore.appendChild(immagine);
    } else if (Number(anno) < 2026 && nome) {
        recuperaImmagineCommons("logo", nome, anno)
            .then(risorsa => {
                if (!risorsa || !contenitore.isConnected) {
                    return;
                }
                const immagine = document.createElement("img");
                immagine.className = "logo-scuderia";
                immagine.src = risorsa.url;
                immagine.alt = "";
                immagine.title = `Logo ${nome} · ${risorsa.licenza}`;
                immagine.loading = "lazy";
                immagine.addEventListener("error", () => immagine.remove(), { once: true });
                contenitore.insertBefore(immagine, etichetta);
                contenitore.appendChild(creaAttribuzioneImmagine(risorsa));
            })
            .catch(errore => {
                console.warn(`Impossibile recuperare il logo di ${nome} da Wikimedia Commons:`, errore);
            });
    }

    contenitore.appendChild(etichetta);
    contenitore.dataset.stagione = String(anno);

    return contenitore;
}

export function creaCollegamentoPilota(driver, anno, paginaRitorno) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "collegamento-pilota";
    link.textContent = `${driver.givenName} ${driver.familyName}`;
    link.addEventListener("click", () => {
        apriSchedaPilota(driver, anno, paginaRitorno);
    });
    return link;
}

export async function creaCollegamentoPilotaOpenF1(pilota, anno, paginaRitorno) {
    const datiPiloti = await recuperaDatiInCache(`/${anno}/drivers.json?limit=100`);
    const nomeOpenF1 = normalizzaNome(pilota.full_name);
    const cognomeOpenF1 = normalizzaNome(String(pilota.full_name || "").trim().split(/\s+/).pop());
    const piloti = datiPiloti?.DriverTable?.Drivers || [];
    const driver = piloti.find(
        elemento => normalizzaNome(`${elemento.givenName} ${elemento.familyName}`) === nomeOpenF1
    ) || piloti.find(
        elemento => normalizzaNome(elemento.familyName) === cognomeOpenF1
    );

    if (driver) {
        return creaCollegamentoPilota(driver, anno, paginaRitorno);
    }

    const nome = document.createElement("span");
    nome.textContent = pilota.full_name || `Pilota #${pilota.driver_number}`;
    return nome;
}

function creaStatistica(etichetta, valore) {
    const elemento = document.createElement("div");
    elemento.className = "statistica-pilota";

    const titolo = document.createElement("dt");
    titolo.textContent = etichetta;
    const dato = document.createElement("dd");
    if (valore instanceof Node) {
        dato.appendChild(valore);
    } else {
        dato.textContent = valore;
    }

    elemento.append(titolo, dato);
    return elemento;
}

function creaMigliorPiazzamento(gare, chiaveRisultato) {
    const risultati = gare.flatMap(gara =>
        (gara[chiaveRisultato] || [])
            .map(risultato => ({
                posizione: Number.parseInt(risultato.position, 10),
                gara
            }))
            .filter(risultato => Number.isInteger(risultato.posizione) && risultato.posizione > 0)
    );

    if (risultati.length === 0) {
        const messaggio = document.createElement("span");
        messaggio.textContent = "Non ancora disponibile";
        return messaggio;
    }

    const posizioneMigliore = Math.min(...risultati.map(risultato => risultato.posizione));
    const granPremi = [...new Map(risultati
        .filter(risultato => risultato.posizione === posizioneMigliore)
        .map(risultato => [
            `${risultato.gara.raceName}|${risultato.gara.Circuit.circuitName}`,
            `${risultato.gara.raceName} · ${risultato.gara.Circuit.circuitName}`
        ])).values()];

    const dettagli = document.createElement("div");
    const posizione = document.createElement("strong");
    posizione.textContent = `${posizioneMigliore}°`;
    const elenco = document.createElement("ul");
    elenco.className = "gran-premi-miglior-piazzamento";
    granPremi.slice(0, 3).forEach(nome => {
        const elemento = document.createElement("li");
        elemento.textContent = nome;
        elenco.appendChild(elemento);
    });
    if (granPremi.length > 3) {
        const altri = document.createElement("li");
        altri.textContent = `e altri ${granPremi.length - 3} weekend`;
        elenco.appendChild(altri);
    }
    dettagli.append(posizione, elenco);
    return dettagli;
}

async function apriSchedaPilota(driver, anno, paginaRitorno) {
    const sezione = document.getElementById("schedaPilota");
    const contenuto = document.getElementById("contenutoSchedaPilota");
    document.getElementById("titoloSchedaPilota").textContent =
        `${driver.givenName} ${driver.familyName}`;
    contenuto.textContent = "Caricamento statistiche...";
    document.getElementById("tornaDaSchedaPilota").onclick = () => cambiaPagina(paginaRitorno);
    cambiaPagina(sezione.id);

    const classifica = await recuperaDatiInCache(`/${anno}/driverStandings.json`);
    const datiGara = await recuperaDatiInCache(`/${anno}/drivers/${driver.driverId}/results.json?limit=100`);
    const datiQualifica = await recuperaDatiInCache(`/${anno}/drivers/${driver.driverId}/qualifying.json?limit=100`);

    const elementoClassifica = classifica?.StandingsTable?.StandingsLists?.[0]?.DriverStandings
        ?.find(elemento => elemento.Driver.driverId === driver.driverId);
    const gare = datiGara?.RaceTable?.Races || [];
    const qualifiche = datiQualifica?.RaceTable?.Races || [];
    const ultimaGara = [...gare].reverse().find(gara => gara.Results?.length);
    const costruttore = ultimaGara?.Results[0]?.Constructor ||
        elementoClassifica?.Constructors?.[0];

    contenuto.replaceChildren();

    const periodo = document.createElement("p");
    periodo.className = "periodo-scheda-pilota";
    periodo.textContent = `Statistiche stagione ${anno}`;
    contenuto.appendChild(periodo);

    const layout = document.createElement("div");
    layout.className = "scheda-pilota-layout";
    const dettagliPilota = document.createElement("div");
    dettagliPilota.className = "scheda-pilota-dati";

    const nomeCompleto = `${driver.givenName} ${driver.familyName}`;
    const immaginePilota = immaginiPiloti.get(normalizzaNome(nomeCompleto));
    if (immaginePilota) {
        const ritratto = document.createElement("img");
        ritratto.className = "ritratto-pilota";
        ritratto.src = `assets/images/drivers/${immaginePilota}`;
        ritratto.alt = `${driver.givenName} ${driver.familyName}`;
        ritratto.loading = "lazy";
        layout.appendChild(ritratto);
    } else if (Number(anno) < 2026) {
        const ritratto = document.createElement("img");
        ritratto.className = "ritratto-pilota";
        ritratto.alt = nomeCompleto;
        ritratto.loading = "lazy";
        ritratto.hidden = true;
        layout.appendChild(ritratto);
        recuperaImmagineCommons("pilota", nomeCompleto, anno)
            .then(risorsa => {
                if (!risorsa || !layout.isConnected) {
                    ritratto.remove();
                    return;
                }
                ritratto.src = risorsa.url;
                ritratto.hidden = false;
                const attribuzione = creaAttribuzioneImmagine(risorsa);
                attribuzione.classList.add("attribuzione-ritratto");
                layout.appendChild(attribuzione);
            })
            .catch(errore => {
                console.warn(`Impossibile recuperare la foto di ${nomeCompleto} da Wikimedia Commons:`, errore);
                ritratto.remove();
            });
    }

    const statistiche = document.createElement("dl");
    statistiche.className = "griglia-statistiche-pilota";
    statistiche.append(
        creaStatistica(
            "Punti",
            classifica ? (elementoClassifica?.points ?? "Non ancora disponibili") : "Dati non disponibili"
        ),
        creaStatistica(
            "Vittorie",
            classifica ? (elementoClassifica?.wins ?? "Non ancora disponibili") : "Dati non disponibili"
        ),
        creaStatistica(
            "Scuderia",
            creaElementoScuderia(costruttore?.name || "Non disponibile", anno, costruttore?.constructorId)
        ),
        creaStatistica(
            "Miglior posizione in gara",
            datiGara
                ? creaMigliorPiazzamento(gare, "Results")
                : "Dati non disponibili"
        ),
        creaStatistica(
            "Miglior posizione in qualifica",
            datiQualifica
                ? creaMigliorPiazzamento(qualifiche, "QualifyingResults")
                : "Dati non disponibili"
        )
    );
    dettagliPilota.appendChild(statistiche);

    const informazioni = document.createElement("p");
    informazioni.className = "dettagli-anagrafici-pilota";
    informazioni.textContent = [
        driver.permanentNumber ? `Numero ${driver.permanentNumber}` : "",
        driver.nationality || ""
    ].filter(Boolean).join(" · ");
    dettagliPilota.appendChild(informazioni);
    layout.prepend(dettagliPilota);
    contenuto.appendChild(layout);
}
