import { recuperaDati, recuperaUltimiWeekendOpenF1 } from "./api.js";

let pilotiSimulatore = [];
let costruttoriSimulatore = [];
let weekendRimanenti = 0;
let weekendUsatiPerLaStima = [];

function mostraMessaggio(elemento, messaggio) {
    elemento.textContent = messaggio;
}

async function recuperaTuttiIWeekend(endpoint) {
    const primaPagina = await recuperaDati(`${endpoint}?limit=100`);
    if (!primaPagina) {
        throw new Error(`Impossibile caricare i dati ${endpoint}.`);
    }

    const gare = primaPagina.RaceTable?.Races || [];
    const totale = Number(primaPagina.total);
    const limite = Number(primaPagina.limit);
    if (!Number.isFinite(totale) || !Number.isFinite(limite) || limite <= 0) {
        throw new Error(`Risposta non valida per i dati ${endpoint}.`);
    }

    const richiestePagine = [];
    for (let offset = limite; offset < totale; offset += limite) {
        richiestePagine.push(recuperaDati(`${endpoint}?limit=${limite}&offset=${offset}`));
    }

    const pagine = await Promise.all(richiestePagine);
    if (pagine.some(pagina => pagina === null)) {
        throw new Error(`Impossibile caricare tutte le pagine dei dati ${endpoint}.`);
    }

    return gare.concat(...pagine.map(pagina => pagina.RaceTable?.Races || []));
}

function sommaPunti(risultatiPerRound, tipoClassifica) {
    const puntiPerEntita = new Map();
    risultatiPerRound.forEach(gara => {
        const risultati = [
            ...(gara.Results || []),
            ...(gara.SprintResults || [])
        ];
        risultati.forEach(risultato => {
            const codice = tipoClassifica === "piloti"
                ? risultato.Driver.driverId
                : risultato.Constructor.constructorId;
            puntiPerEntita.set(
                codice,
                (puntiPerEntita.get(codice) || 0) + (Number(risultato.points) || 0)
            );
        });
    });
    return puntiPerEntita;
}

function raggruppaRisultatiPerRound(gare, chiaveRisultati) {
    const gruppi = new Map();
    gare.forEach(gara => {
        const round = Number(gara.round);
        if (!gruppi.has(round)) {
            gruppi.set(round, {
                round,
                nome: gara.raceName,
                risultati: new Map()
            });
        }

        const gruppo = gruppi.get(round);
        (gara[chiaveRisultati] || []).forEach(risultato => {
            gruppo.risultati.set(risultato.Driver.driverId, risultato);
        });
    });

    return gruppi;
}

function preparaWeekend(risultatiGara, risultatiSprint) {
    const garePerRound = raggruppaRisultatiPerRound(risultatiGara, "Results");
    const sprintPerRound = raggruppaRisultatiPerRound(risultatiSprint, "SprintResults");

    return [...garePerRound.values()]
        .filter(gara => gara.risultati.size > 0)
        .map(gara => ({
            round: gara.round,
            nome: gara.nome,
            Results: [...gara.risultati.values()],
            SprintResults: [...(sprintPerRound.get(gara.round)?.risultati.values() || [])]
        }))
        .sort((prima, seconda) => prima.round - seconda.round);
}

function stimaPuntiProssimaStagione(entita, weekendCompletati, tipoClassifica) {
    const ultimiWeekend = weekendCompletati.slice(-3);
    if (ultimiWeekend.length === 0) {
        return { ultimiWeekend, mediaPunti: new Map() };
    }

    const puntiPerEntita = sommaPunti(ultimiWeekend, tipoClassifica);
    const mediaPunti = new Map();
    entita.forEach(elemento => {
        mediaPunti.set(
            elemento.codice,
            (puntiPerEntita.get(elemento.codice) || 0) / ultimiWeekend.length
        );
    });

    return { ultimiWeekend, mediaPunti };
}

function mostraRiferimentoGara(nomiWeekend) {
    const previsioni = document.getElementById("previsioniGara");
    previsioni.textContent = nomiWeekend.length
        ? `Stima basata sulla media degli ultimi ${nomiWeekend.length} weekend disputati ` +
          `(${nomiWeekend.join(", ")}), includendo i punti sprint quando presenti, ` +
          `proiettata sui ${weekendRimanenti} weekend rimanenti.`
        : "Stima non disponibile: non risultano ancora weekend disputati in questa stagione.";
}

export async function caricaSimulatore(anno) {
    pilotiSimulatore = [];
    costruttoriSimulatore = [];
    weekendRimanenti = 0;
    weekendUsatiPerLaStima = [];

    const selezione = document.getElementById("pilotaDaSeguire");
    const selezioneCostruttore = document.getElementById("costruttoreDaSeguire");
    const previsioni = document.getElementById("previsioniGara");
    const tabella = document.getElementById("classificaSimulata");
    const tabellaCostruttori = document.getElementById("classificaCostruttoriSimulata");
    const esito = document.getElementById("esitoSimulazione");
    const esitoCostruttore = document.getElementById("esitoCostruttoreSimulazione");
    const stato = document.getElementById("statoSimulatore");

    selezione.replaceChildren(new Option("Caricamento piloti...", ""));
    selezioneCostruttore.replaceChildren(new Option("Caricamento costruttori...", ""));
    previsioni.replaceChildren();
    tabella.replaceChildren();
    tabellaCostruttori.replaceChildren();
    esito.textContent = "";
    esitoCostruttore.textContent = "";
    stato.textContent = "Calcolo della proiezione a fine stagione...";

    let datiClassifica;
    let datiClassificaCostruttori;
    let gareCalendario;
    let gareGara;
    let gareSprint;
    let usaOpenF1 = false;
    try {
        [datiClassifica, datiClassificaCostruttori, gareCalendario] = await Promise.all([
            recuperaDati(`/${anno}/driverstandings.json`),
            recuperaDati(`/${anno}/constructorstandings.json`),
            recuperaDati(`/${anno}/races.json?limit=100`)
        ]);
    } catch (errore) {
        console.error("Errore nel caricamento dei dati per il simulatore:", errore);
        selezione.replaceChildren(new Option("Dati non disponibili", ""));
        selezioneCostruttore.replaceChildren(new Option("Dati non disponibili", ""));
        stato.textContent = `Impossibile calcolare la stima: ${errore.message}`;
        return;
    }

    const calendario = gareCalendario?.RaceTable?.Races || [];
    if (!calendario.length) {
        selezione.replaceChildren(new Option("Dati non ancora disponibili", ""));
        selezioneCostruttore.replaceChildren(new Option("Dati non ancora disponibili", ""));
        stato.textContent = `La stagione ${anno} non è ancora iniziata o i suoi dati non sono stati pubblicati.`;
        return;
    }

    try {
        [gareGara, gareSprint] = await Promise.all([
            recuperaTuttiIWeekend(`/${anno}/results.json`),
            recuperaTuttiIWeekend(`/${anno}/sprint.json`)
        ]);
    } catch (errore) {
        if (anno >= 2023) {
            try {
                const risultatiAlternativi = await recuperaUltimiWeekendOpenF1(anno, 3);
                if (risultatiAlternativi) {
                    gareGara = risultatiAlternativi.gareGara.RaceTable.Races;
                    gareSprint = risultatiAlternativi.gareSprint.RaceTable.Races;
                    usaOpenF1 = true;
                } else {
                    throw errore;
                }
            } catch (erroreAlternativo) {
                console.error("Risultati Jolpica e OpenF1 non disponibili per il simulatore:", erroreAlternativo);
                stato.textContent = `Impossibile calcolare la stima: ${erroreAlternativo.message}`;
                return;
            }
        } else {
            console.error("Errore nel caricamento dei risultati per il simulatore:", errore);
            stato.textContent = `Impossibile calcolare la stima: ${errore.message}`;
            return;
        }
    }

    const pilotiClassifica = datiClassifica?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
    if (!pilotiClassifica?.length) {
        selezione.replaceChildren(new Option("Dati non disponibili", ""));
        stato.textContent = `Classifica piloti ${anno} non disponibile.`;
    }
    const costruttoriClassifica =
        datiClassificaCostruttori?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || [];
    if (!costruttoriClassifica.length) {
        selezioneCostruttore.replaceChildren(new Option("Dati non disponibili", ""));
        document.getElementById("statoSimulatore").textContent =
            `Classifica costruttori ${anno} non disponibile.`;
    }

    if (!pilotiClassifica?.length && !costruttoriClassifica.length) {
        return;
    }

    const weekendCompletati = preparaWeekend(gareGara, gareSprint);
    const ultimoRoundCompletato = weekendCompletati[weekendCompletati.length - 1]?.round || 0;
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    weekendRimanenti = calendario.filter(gara =>
        Number(gara.round) > ultimoRoundCompletato &&
        new Date(`${gara.date}T00:00:00`) >= oggi
    ).length;
    pilotiSimulatore = (pilotiClassifica || []).map(pilota => ({
        nome: `${pilota.Driver.givenName} ${pilota.Driver.familyName}`,
        codice: pilota.Driver.driverId,
        puntiAttuali: Number(pilota.points),
        puntiPrevisti: 0
    }));

    const stimaPiloti = stimaPuntiProssimaStagione(
        pilotiSimulatore,
        weekendCompletati,
        "piloti"
    );
    weekendUsatiPerLaStima = stimaPiloti.ultimiWeekend.map(gara => gara.nome);
    pilotiSimulatore = pilotiSimulatore.map(pilota => ({
        ...pilota,
        puntiPrevisti: Math.round(
            (stimaPiloti.mediaPunti.get(pilota.codice) || 0) * weekendRimanenti
        )
    }));

    costruttoriSimulatore = costruttoriClassifica.map(costruttore => ({
        nome: costruttore.Constructor.name,
        codice: costruttore.Constructor.constructorId,
        puntiAttuali: Number(costruttore.points),
        puntiPrevisti: 0
    }));
    const stimaCostruttori = stimaPuntiProssimaStagione(
        costruttoriSimulatore,
        weekendCompletati,
        "costruttori"
    );
    costruttoriSimulatore = costruttoriSimulatore.map(costruttore => ({
        ...costruttore,
        puntiPrevisti: Math.round(
            (stimaCostruttori.mediaPunti.get(costruttore.codice) || 0) * weekendRimanenti
        )
    }));

    const opzioni = [
        new Option("Seleziona un pilota", ""),
        ...pilotiSimulatore.map(pilota => new Option(pilota.nome, pilota.codice))
    ];
    selezione.replaceChildren(...opzioni);
    selezione.onchange = simulaMondiale;
    selezioneCostruttore.replaceChildren(
        new Option("Seleziona un costruttore", ""),
        ...costruttoriSimulatore.map(costruttore => new Option(costruttore.nome, costruttore.codice))
    );
    selezioneCostruttore.onchange = simulaMondiale;

    mostraRiferimentoGara(weekendUsatiPerLaStima);
    if (weekendCompletati.length === 0) {
        stato.textContent = `Nessun risultato di gara disponibile per il ${anno}; la stima a fine stagione non è calcolabile.`;
    } else if (weekendRimanenti === 0) {
        stato.textContent = `La stagione ${anno} risulta conclusa: la classifica stimata coincide con quella attuale.`;
    } else {
        stato.textContent =
            `Stima a fine stagione basata sulla media degli ultimi ${weekendUsatiPerLaStima.length} ` +
            `weekend disputati e proiettata sui ${weekendRimanenti} weekend rimanenti.`;
    }
    if (usaOpenF1 || datiClassifica?.source === "OpenF1" || datiClassificaCostruttori?.source === "OpenF1") {
        stato.textContent += " Alcuni dati provengono dalla fonte alternativa OpenF1.";
    }
    selezione.value = "";
    selezioneCostruttore.value = "";
    simulaMondiale();
}

export function simulaMondiale() {
    const pilotaSelezionato = document.getElementById("pilotaDaSeguire").value;
    const costruttoreSelezionato = document.getElementById("costruttoreDaSeguire").value;
    const tabella = document.getElementById("classificaSimulata");
    const tabellaCostruttori = document.getElementById("classificaCostruttoriSimulata");
    const esito = document.getElementById("esitoSimulazione");
    const esitoCostruttore = document.getElementById("esitoCostruttoreSimulazione");

    if (pilotiSimulatore.length === 0 && costruttoriSimulatore.length === 0) {
        mostraMessaggio(esito, "La simulazione non è disponibile.");
        return;
    }

    function aggiornaClassifica(entita, selezionato, elementoTabella, elementoEsito, nomeTipo) {
        const classifica = entita
            .map(elemento => ({
                ...elemento,
                totale: elemento.puntiAttuali + elemento.puntiPrevisti
            }))
            .sort((prima, seconda) =>
                seconda.totale - prima.totale ||
                seconda.puntiPrevisti - prima.puntiPrevisti ||
                seconda.puntiAttuali - prima.puntiAttuali
            );

        const righe = classifica.map((elemento, indice) => {
            const riga = document.createElement("tr");
            if (indice === 0) {
                riga.classList.add("classifica-prima");
            }
            [
                indice + 1,
                elemento.nome,
                elemento.puntiAttuali,
                `+${elemento.puntiPrevisti}`,
                elemento.totale
            ].forEach(valore => {
                const cella = document.createElement("td");
                cella.textContent = valore;
                riga.appendChild(cella);
            });
            return riga;
        });
        elementoTabella.replaceChildren(...righe);

        if (!selezionato) {
            mostraMessaggio(elementoEsito, `Seleziona un ${nomeTipo} per evidenziare la sua posizione stimata.`);
            return;
        }

        const posizione = classifica.findIndex(elemento => elemento.codice === selezionato) + 1;
        const risultato = classifica[posizione - 1];
        if (!risultato) {
            mostraMessaggio(elementoEsito, `Il ${nomeTipo} selezionato non è presente nella classifica.`);
            return;
        }

        elementoEsito.textContent =
            `${risultato.nome}: posizione stimata ${posizione} a fine stagione, ` +
            `con ${risultato.puntiAttuali} punti attuali e ${risultato.puntiPrevisti} punti ` +
            `stimati sui ${weekendRimanenti} weekend rimanenti, per un totale di ${risultato.totale}.`;
    }

    if (pilotiSimulatore.length) {
        aggiornaClassifica(
            pilotiSimulatore,
            pilotaSelezionato,
            tabella,
            esito,
            "pilota"
        );
    }
    if (costruttoriSimulatore.length) {
        aggiornaClassifica(
            costruttoriSimulatore,
            costruttoreSelezionato,
            tabellaCostruttori,
            esitoCostruttore,
            "costruttore"
        );
    }
}
