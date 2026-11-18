import { recuperaCalendarioOpenF1, recuperaDati, recuperaOpenF1 } from "./api.js";
import { creaElementoScuderia } from "./schedaPilota.js";
import { apriDettaglioGara } from "./calendario.js";

const FEED_NOTIZIE = "https://sport.sky.it/rss/sport.xml";
const SEZIONE_NOTIZIE_F1 = "https://sport.sky.it/formula-1";
let timerAggiornamentoNotizie;
let notizieDisponibili = [];
const cacheEventiStoriciGranPremi = new Map();

function mostraRigaVuota(lista, testo) {
    const riga = document.createElement("li");
    riga.textContent = testo;
    lista.replaceChildren(riga);
}

function mostraTopPiloti(elemento, piloti, anno) {
    elemento.replaceChildren();
    if (!piloti.length) {
        mostraRigaVuota(elemento, "Classifica piloti non disponibile.");
        return;
    }

    piloti.slice(0, 3).forEach((pilota, indice) => {
        const riga = document.createElement("li");
        if (indice === 0) {
            riga.classList.add("classifica-prima");
        }
        const nome = document.createElement("span");
        nome.className = "classifica-home-nome";
        nome.textContent = `${pilota.Driver.givenName} ${pilota.Driver.familyName}`;
        const scuderia = creaElementoScuderia(
            pilota.Constructors?.[0]?.name || "N/D",
            anno,
            pilota.Constructors?.[0]?.constructorId
        );
        scuderia.classList.add("scuderia-home");
        const punti = document.createElement("strong");
        punti.textContent = `${pilota.points} pt`;
        riga.append(nome, scuderia, punti);
        elemento.appendChild(riga);
    });
}

function mostraTopCostruttori(elemento, costruttori, anno) {
    elemento.replaceChildren();
    if (!costruttori.length) {
        mostraRigaVuota(elemento, "Classifica costruttori non disponibile.");
        return;
    }

    costruttori.slice(0, 3).forEach((costruttore, indice) => {
        const riga = document.createElement("li");
        if (indice === 0) {
            riga.classList.add("classifica-prima");
        }
        const team = creaElementoScuderia(
            costruttore.Constructor.name,
            anno,
            costruttore.Constructor.constructorId
        );
        team.classList.add("classifica-home-nome");
        const punti = document.createElement("strong");
        punti.textContent = `${costruttore.points} pt`;
        riga.append(team, punti);
        elemento.appendChild(riga);
    });
}

function dataLocale(data) {
    return new Date(`${data}T00:00:00`);
}

function recuperaEventiStoriciGranPremi(mese, giorno) {
    const chiave = `${mese}-${giorno}`;
    if (!cacheEventiStoriciGranPremi.has(chiave)) {
        const richiesta = (async () => {
            const primaPagina = await recuperaDati("/races.json?limit=100&offset=0");
            if (!primaPagina) {
                return [];
            }

            const limite = Number(primaPagina.limit);
            const totale = Number(primaPagina.total);
            if (!Number.isFinite(limite) || limite <= 0 || !Number.isFinite(totale)) {
                throw new Error("Jolpica ha restituito una paginazione non valida per le gare.");
            }

            const gare = [];
            let offset = Math.floor((totale - 1) / limite) * limite;
            while (offset >= 0 && gare.length < 1) {
                const offsetPagine = [offset, offset - limite, offset - 2 * limite]
                    .filter(valore => valore >= 0);
                const pagine = await Promise.all(offsetPagine.map(valore =>
                    valore === 0
                        ? primaPagina
                        : recuperaDati(`/races.json?limit=${limite}&offset=${valore}`)
                ));
                pagine.forEach(dati => {
                    if (dati) {
                        gare.push(
                            ...(dati.RaceTable?.Races || [])
                                .filter(gara => gara.date?.slice(5) === `${mese}-${giorno}`)
                        );
                    }
                });
                if (gare.length >= 1) {
                    break;
                }

                offset -= limite * 3;
            }
            gare.sort((prima, seconda) =>
                Number(seconda.season) - Number(prima.season)
            );

            const eventi = await Promise.all(gare.slice(0, 2).map(async gara => {
                const dati = await recuperaDati(
                    `/${gara.season}/${gara.round}/results.json`
                );
                const vincitore = dati?.RaceTable?.Races?.[0]?.Results?.[0]?.Driver;
                if (!vincitore) {
                    return null;
                }

                const pagina = new URL(gara.url);
                if (pagina.protocol !== "https:" || pagina.hostname !== "en.wikipedia.org") {
                    return null;
                }

                return {
                    anno: gara.season,
                    testo:
                        `${vincitore.givenName} ${vincitore.familyName} vinse il ` +
                        `${gara.raceName} del ${gara.season} a ${gara.Circuit.Location.locality}.`,
                    titolo: gara.raceName,
                    url: pagina.href,
                    fonteUrl: `https://api.jolpi.ca/ergast/f1/${gara.season}/${gara.round}/results.json`
                };
            }));

            return eventi.filter(Boolean);
        })();
        cacheEventiStoriciGranPremi.set(chiave, richiesta);
        richiesta.catch(() => cacheEventiStoriciGranPremi.delete(chiave));
    }

    return cacheEventiStoriciGranPremi.get(chiave);
}

async function mostraOnThisDay() {
    const sezione = document.getElementById("sezioneOnThisDay");
    const titolo = document.getElementById("titoloOnThisDay");
    const contenitore = document.getElementById("eventoOnThisDay");
    const fonte = document.getElementById("fonteOnThisDay");
    const dataProva = new URLSearchParams(window.location.search).get("onthisday");
    const partiData = dataProva?.match(/^(\d{2})-(\d{2})$/);
    const dataIndicata = partiData
        ? new Date(2000, Number(partiData[1]) - 1, Number(partiData[2]))
        : new Date();
    if (
        partiData &&
        (dataIndicata.getMonth() !== Number(partiData[1]) - 1 ||
            dataIndicata.getDate() !== Number(partiData[2]))
    ) {
        console.warn("Data di prova On This Day non valida; verrà usata la data di oggi.");
    }
    const usaDataProva = Boolean(
        partiData &&
        dataIndicata.getMonth() === Number(partiData[1]) - 1 &&
        dataIndicata.getDate() === Number(partiData[2])
    );
    const oggi = usaDataProva ? dataIndicata : new Date();
    const mese = String(oggi.getMonth() + 1).padStart(2, "0");
    const giorno = String(oggi.getDate()).padStart(2, "0");
    const urlArchivio = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mese}/${giorno}`;
    sezione.hidden = true;

    try {
        const risposta = await fetch(
            `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mese}/${giorno}`
        );
        if (!risposta.ok) {
            throw new Error(`Wikipedia ha risposto con HTTP ${risposta.status}.`);
        }

        const dati = await risposta.json();
        const riferimentiF1 = /\b(?:formula one|formula 1|f1)\b/i;
        const riferimentiGranPremio = /\bgrand prix\b/i;
        const riferimentiMotorsport = /\b(?:race|racing|driver|championship|circuit|team)\b/i;
        let eventi = (Array.isArray(dati.events) ? dati.events : [])
            .filter(evento => {
                const pagine = Array.isArray(evento.pages) ? evento.pages : [];
                const testoEvento = [
                    evento.text || "",
                    ...pagine.map(pagina => pagina.title || "")
                ].join(" ");
                if (riferimentiF1.test(testoEvento)) {
                    return true;
                }
                return riferimentiGranPremio.test(testoEvento) &&
                    riferimentiMotorsport.test(testoEvento);
            })
            .map(evento => {
                const pagina = evento.pages?.find(voce =>
                    voce.type === "standard" && voce.content_urls?.desktop?.page
                );
                if (!pagina) {
                    return null;
                }
                const link = new URL(pagina.content_urls.desktop.page);
                if (link.protocol !== "https:" || link.hostname !== "en.wikipedia.org") {
                    return null;
                }
                return {
                    anno: evento.year,
                    testo: evento.text,
                    titolo: pagina.title.replaceAll("_", " "),
                    url: link.href
                };
            })
            .filter(Boolean)
            .slice(0, 2);
        let fonteEventi = {
            url: urlArchivio,
            etichetta: "Wikipedia: On this day"
        };

        if (!eventi.length) {
            eventi = (await recuperaEventiStoriciGranPremi(mese, giorno)).slice(0, 2);
            if (!eventi.length) {
                contenitore.replaceChildren();
                fonte.replaceChildren();
                return;
            }
            fonteEventi = {
                url: eventi[0].fonteUrl,
                etichetta: "Risultati storici Jolpica"
            };
        }

        const schede = eventi.map(evento => {
            const scheda = document.createElement("article");
            scheda.className = "evento-storico";
            const anno = document.createElement("strong");
            anno.className = "anno-evento-storico";
            anno.textContent = evento.anno;
            const testo = document.createElement("p");
            testo.textContent = evento.testo;
            const link = document.createElement("a");
            link.href = evento.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = `Approfondisci: ${evento.titolo}`;
            scheda.append(anno, testo, link);
            return scheda;
        });
        contenitore.replaceChildren(...schede);
        const collegamentoFonte = document.createElement("a");
        collegamentoFonte.href = fonteEventi.url;
        collegamentoFonte.target = "_blank";
        collegamentoFonte.rel = "noopener noreferrer";
        collegamentoFonte.textContent = fonteEventi.etichetta;
        fonte.replaceChildren("Archivio storico consultato: ", collegamentoFonte, ".");
        titolo.textContent = usaDataProva
            ? `Formula 1, nella storia · ${oggi.toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long"
            })} (prova)`
            : "Formula 1, oggi nella storia";
        sezione.hidden = false;
    } catch (errore) {
        console.error("Errore nel recupero degli eventi storici F1:", errore);
        contenitore.replaceChildren();
        fonte.replaceChildren();
        sezione.hidden = true;
    }
}

async function mostraWeekend(anno) {
    const titolo = document.getElementById("titoloWeekendHome");
    const dettaglio = document.getElementById("dettaglioWeekendHome");
    const pulsante = document.getElementById("shortcutWeekendHome");
    let gare;
    if (Number(anno) === 2027) {
        try {
            gare = await recuperaCalendarioOpenF1(anno);
        } catch (errore) {
            console.error("Errore nel recupero del calendario 2027 da OpenF1:", errore);
            titolo.textContent = "Weekend F1";
            dettaglio.textContent = "Calendario 2027 non disponibile al momento.";
            pulsante.disabled = true;
            return;
        }
    } else {
        const dati = await recuperaDati(`/${anno}/races.json?limit=100`);
        gare = dati?.RaceTable?.Races || [];
    }

    if (!gare.length) {
        titolo.textContent = "Weekend F1";
        dettaglio.textContent = `Il calendario ${anno} non è ancora disponibile.`;
        pulsante.disabled = true;
        return;
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const weekend = gare.map(gara => {
        const date = [
            gara.date,
            ...["FirstPractice", "SecondPractice", "ThirdPractice", "SprintQualifying", "Sprint", "Qualifying"]
                .map(chiave => gara[chiave]?.date)
        ].filter(Boolean).map(dataLocale).sort((a, b) => a - b);
        const inizio = gara.weekendStart
            ? dataLocale(gara.weekendStart)
            : date[0];
        const fine = gara.weekendEnd
            ? dataLocale(gara.weekendEnd)
            : date[date.length - 1];
        return { gara, inizio, fine };
    });

    let selezionato = weekend.find(({ inizio, fine }) =>
        inizio <= oggi && oggi <= fine
    );

    if (selezionato && dataLocale(selezionato.gara.date).getTime() === oggi.getTime()) {
        if (Number(anno) === 2027) {
            try {
                const risultati = await recuperaOpenF1(
                    `session_result?session_key=${selezionato.gara.raceSessionKey}`
                );
                if (risultati.length) {
                    selezionato = undefined;
                }
            } catch (errore) {
                console.warn(`Verifica dello stato di ${selezionato.gara.raceName} non disponibile:`, errore);
            }
        } else {
            const risultati = await recuperaDati(`/${anno}/${selezionato.gara.round}/results.json`);
            if (risultati === null) {
                console.warn(`Verifica dello stato di ${selezionato.gara.raceName} non disponibile.`);
            } else if (risultati.RaceTable?.Races?.[0]?.Results?.length) {
                selezionato = undefined;
            }
        }
    }

    if (!selezionato) {
        selezionato = weekend.find(({ inizio }) => inizio > oggi);
    }

    if (!selezionato) {
        titolo.textContent = "Weekend F1";
        dettaglio.textContent = "Non ci sono altri weekend in programma in questa stagione.";
        pulsante.disabled = true;
        return;
    }

    const inCorso = selezionato.inizio <= oggi && oggi <= selezionato.fine;
    titolo.textContent = inCorso ? "Weekend in corso" : "Prossimo weekend";
    dettaglio.textContent =
        `${selezionato.gara.raceName} — ${selezionato.gara.Circuit.Location.locality}, ` +
        `${selezionato.gara.Circuit.Location.country} · ` +
        `${dataLocale(selezionato.gara.date).toLocaleDateString("it-IT")}`;
    pulsante.disabled = false;
    pulsante.onclick = () => apriDettaglioGara(anno, selezionato.gara);
}

async function recuperaNotizieFeed() {
    const risposta = await fetch(FEED_NOTIZIE, { cache: "no-store" });
    if (!risposta.ok) {
        throw new Error(`Feed Sky Sport non disponibile (HTTP ${risposta.status}).`);
    }

    const documento = new DOMParser().parseFromString(await risposta.text(), "application/xml");
    if (documento.querySelector("parsererror")) {
        throw new Error("Il feed Sky Sport ha restituito XML non valido.");
    }

    return [...documento.querySelectorAll("item")]
        .map(notizia => {
            const url = new URL(notizia.querySelector("link")?.textContent.trim() || "");
            const data = new Date(notizia.querySelector("pubDate")?.textContent.trim() || "");
            return {
                titolo: notizia.querySelector("title")?.textContent.trim(),
                descrizione: notizia.querySelector("description")?.textContent.trim() || "",
                url,
                data
            };
        })
        .filter(notizia =>
            notizia.titolo &&
            notizia.url.protocol === "https:" &&
            notizia.url.hostname === "sport.sky.it" &&
            notizia.url.pathname.startsWith("/formula-1/")
        )
        .sort((prima, seconda) => seconda.data - prima.data)
}

async function recuperaNotizieSezioneF1() {
    const risposta = await fetch(SEZIONE_NOTIZIE_F1, { cache: "no-store" });
    if (!risposta.ok) {
        throw new Error(`Sezione F1 Sky Sport non disponibile (HTTP ${risposta.status}).`);
    }

    const documento = new DOMParser().parseFromString(await risposta.text(), "text/html");
    return [...documento.querySelectorAll("a[href]")]
        .map(link => {
            const url = new URL(link.href, SEZIONE_NOTIZIE_F1);
            const corrispondenzaData = url.pathname.match(
                /^\/formula-1\/(\d{4})\/(\d{2})\/(\d{2})\//
            );
            const orario = link.querySelector("time")?.getAttribute("datetime")
                ?.match(/(\d{1,2}):(\d{2})/);
            const titolo = link.querySelector(".c-hero__title, .c-card__title")
                ?.textContent.trim();
            if (!corrispondenzaData || !titolo) {
                return null;
            }

            return {
                titolo,
                descrizione: link.querySelector(".c-hero__abstract, .c-card__abstract")
                    ?.textContent.trim() || "",
                url,
                data: new Date(
                    Number(corrispondenzaData[1]),
                    Number(corrispondenzaData[2]) - 1,
                    Number(corrispondenzaData[3]),
                    Number(orario?.[1] || 0),
                    Number(orario?.[2] || 0)
                )
            };
        })
        .filter(notizia =>
            notizia &&
            notizia.url.protocol === "https:" &&
            notizia.url.hostname === "sport.sky.it"
        );
}

function creaSchedeNotizie(notizie) {
    return notizie.map(notizia => {
        const scheda = document.createElement("article");
        scheda.className = "notizia-home notizia-solo-titolo";
        const titolo = document.createElement("h4");
        const link = document.createElement("a");
        link.href = notizia.url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = notizia.titolo;
        titolo.appendChild(link);
        scheda.appendChild(titolo);
        return scheda;
    });
}

function aggiornaElenchiNotizie(notizie) {
    document.getElementById("elencoNotizieHome").replaceChildren(
        ...creaSchedeNotizie(notizie.slice(0, 3))
    );
    document.getElementById("elencoNotizieCompleto").replaceChildren(
        ...creaSchedeNotizie(notizie)
    );
    document.getElementById("mostraPiuNotizieHome").hidden = notizie.length <= 3;
}

async function caricaNotizie() {
    const contenitore = document.getElementById("elencoNotizieHome");
    const aggiornamento = document.getElementById("aggiornamentoNotizieHome");
    try {
        let notizie;
        try {
            notizie = await recuperaNotizieFeed();
        } catch (erroreFeed) {
            console.warn("Feed generale Sky Sport non disponibile; provo la sezione F1:", erroreFeed);
            notizie = [];
        }
        if (!notizie.length) {
            notizie = await recuperaNotizieSezioneF1();
        }
        if (!notizie.length) {
            throw new Error("La sezione Sky Sport non contiene notizie di Formula 1.");
        }

        notizieDisponibili = notizie;
        aggiornaElenchiNotizie(notizieDisponibili);
        const testoAggiornamento =
            `Fonte: Sky Sport · aggiornato il ${new Date().toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit"
            })}.`;
        aggiornamento.textContent = testoAggiornamento;
        document.getElementById("aggiornamentoNotizieCompleto").textContent = testoAggiornamento;
    } catch (errore) {
        console.error("Errore nel caricamento delle notizie Sky Sport:", errore);
        notizieDisponibili = [];
        const messaggioHome = document.createElement("p");
        messaggioHome.textContent = "Notizie F1 momentaneamente non disponibili da Sky Sport.";
        contenitore.replaceChildren(messaggioHome);
        const messaggioCompleto = document.createElement("p");
        messaggioCompleto.textContent = messaggioHome.textContent;
        document.getElementById("elencoNotizieCompleto").replaceChildren(messaggioCompleto);
        document.getElementById("mostraPiuNotizieHome").hidden = true;
        aggiornamento.textContent = "Impossibile aggiornare il feed Sky Sport.";
        document.getElementById("aggiornamentoNotizieCompleto").textContent =
            aggiornamento.textContent;
    }
}

export async function caricaHome(anno) {
    const pulsanteAggiornamento = document.getElementById("aggiornaNotizieHome");
    pulsanteAggiornamento.onclick = caricaNotizie;
    if (!timerAggiornamentoNotizie) {
        timerAggiornamentoNotizie = window.setInterval(caricaNotizie, 15 * 60 * 1000);
    }

    const [datiPiloti, datiCostruttori] = await Promise.all([
        recuperaDati(`/${anno}/driverstandings.json`),
        recuperaDati(`/${anno}/constructorstandings.json`)
    ]);

    mostraTopPiloti(
        document.getElementById("topPilotiHome"),
        datiPiloti?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || [],
        anno
    );
    mostraTopCostruttori(
        document.getElementById("topCostruttoriHome"),
        datiCostruttori?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [],
        anno
    );
    const fonteClassifiche = document.getElementById("fonteClassificheHome");
    const usaOpenF1 = datiPiloti?.source === "OpenF1" || datiCostruttori?.source === "OpenF1";
    fonteClassifiche.textContent = usaOpenF1
        ? "Classifica da OpenF1: i punti sono aggiornati all'ultimo Gran Premio disponibile."
        : "";

    await Promise.all([mostraWeekend(anno), mostraOnThisDay(), caricaNotizie()]);
}
