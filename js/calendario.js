import { recuperaCalendarioOpenF1, recuperaDati, recuperaOpenF1 } from "./api.js";
import { cambiaPagina } from "./navigazione.js";
import {
    creaCollegamentoPilota,
    creaCollegamentoPilotaOpenF1,
    creaElementoScuderia
} from "./schedaPilota.js";

const openF1SessionNames = {
    practice1: ["Practice 1"],
    practice2: ["Practice 2"],
    practice3: ["Practice 3"],
    sprintqualifying: ["Sprint Qualifying", "Sprint Shootout"],
    qualifying: ["Qualifying"],
    sprint: ["Sprint"],
    results: ["Race"]
};

function aggiungiMessaggio(tabella, messaggio, colspan) {
    const riga = document.createElement("tr");
    const cella = document.createElement("td");
    cella.colSpan = colspan;
    cella.textContent = messaggio;
    riga.appendChild(cella);
    tabella.appendChild(riga);
}

function formattaTempoGiro(secondi) {
    const millisecondiTotali = Math.round(secondi * 1000);
    const minuti = Math.floor(millisecondiTotali / 60000);
    const secondiRimanenti = Math.floor((millisecondiTotali % 60000) / 1000);
    const millisecondi = millisecondiTotali % 1000;

    return `${minuti}:${String(secondiRimanenti).padStart(2, "0")}.${String(millisecondi).padStart(3, "0")}`;
}

async function trovaSessioneOpenF1(anno, sessione, sessioneProgrammata, gara) {
    if (anno < 2023) {
        throw new Error("OpenF1 offre risultati storici a partire dalla stagione 2023.");
    }

    const nomiSessione = openF1SessionNames[sessione];
    const sessioni = await recuperaOpenF1(`sessions?year=${anno}`);
    const data = sessioneProgrammata?.date || gara?.date;
    if (!data) {
        return null;
    }
    const dataProgrammata = new Date(
        `${data}T${sessioneProgrammata?.time || gara?.time || "12:00:00Z"}`
    );
    return sessioni
        .filter(elemento =>
            nomiSessione?.includes(elemento.session_name) &&
            elemento.date_start &&
            Math.abs(new Date(elemento.date_start) - dataProgrammata) <= 36 * 60 * 60 * 1000
        )
        .sort((prima, seconda) =>
            Math.abs(new Date(prima.date_start) - dataProgrammata) -
            Math.abs(new Date(seconda.date_start) - dataProgrammata)
        )[0];
}

function formattaRisultatoOpenF1(risultato, sessione) {
    if (Array.isArray(risultato.duration)) {
        const tempi = risultato.duration.filter(Number.isFinite);
        if (tempi.length) {
            return formattaTempoGiro(tempi[tempi.length - 1]);
        }
    }

    if (sessione === "results" || sessione === "sprint") {
        if (risultato.dsq) {
            return "Squalificato";
        }
        if (risultato.dns) {
            return "Non partito";
        }
        if (risultato.dnf) {
            return "Ritirato";
        }
        if (Number.isFinite(risultato.gap_to_leader)) {
            return risultato.gap_to_leader === 0
                ? "Vincitore"
                : `+${risultato.gap_to_leader.toFixed(3)} s`;
        }
        return "N/D";
    }

    return Number.isFinite(risultato.duration)
        ? formattaTempoGiro(risultato.duration)
        : "N/D";
}

async function caricaClassificaOpenF1(anno, sessione, sessioneProgrammata, gara, tabella, mostraPunti) {
    const sessioneOpenF1 = await trovaSessioneOpenF1(anno, sessione, sessioneProgrammata, gara);

    if (!sessioneOpenF1) {
        throw new Error("OpenF1 non ha dati per questa sessione o questo weekend.");
    }

    const chiaveSessione = sessioneOpenF1.session_key;
    const [risultati, piloti] = await Promise.all([
        recuperaOpenF1(`session_result?session_key=${chiaveSessione}`),
        recuperaOpenF1(`drivers?session_key=${chiaveSessione}`)
    ]);

    if (!risultati.length) {
        return false;
    }

    const pilotiPerNumero = new Map(
        piloti.map(pilota => [pilota.driver_number, pilota])
    );
    const risultatiOrdinati = risultati.sort((prima, seconda) => {
        const posizionePrima = Number(prima.position);
        const posizioneSeconda = Number(seconda.position);
        const primaClassificata = prima.position != null && Number.isFinite(posizionePrima);
        const secondaClassificata = seconda.position != null && Number.isFinite(posizioneSeconda);
        if (primaClassificata && secondaClassificata) {
            return posizionePrima - posizioneSeconda;
        }
        if (primaClassificata !== secondaClassificata) {
            return primaClassificata ? -1 : 1;
        }
        return (Number(seconda.number_of_laps) || 0) - (Number(prima.number_of_laps) || 0);
    });

    aggiungiMessaggio(
        tabella,
        "Risultati classificati da OpenF1 (fonte alternativa).",
        mostraPunti ? 5 : 4
    );

    for (const risultato of risultatiOrdinati) {
        const pilota = pilotiPerNumero.get(risultato.driver_number);
        const riga = document.createElement("tr");
        const posizione = document.createElement("td");
        posizione.textContent = risultato.position ?? "—";
        const nome = document.createElement("td");
        if (pilota) {
            nome.appendChild(await creaCollegamentoPilotaOpenF1(pilota, anno, "dettaglioGara"));
        } else {
            nome.textContent = `Pilota #${risultato.driver_number}`;
        }
        const scuderia = document.createElement("td");
        scuderia.appendChild(creaElementoScuderia(
            pilota?.team_name || "Scuderia non disponibile",
            anno
        ));
        const tempo = document.createElement("td");
        tempo.textContent = formattaRisultatoOpenF1(risultato, sessione);
        riga.append(posizione, nome, scuderia, tempo);
        if (mostraPunti) {
            const punti = document.createElement("td");
            punti.textContent = Number.isFinite(risultato.points) ? risultato.points : "0";
            riga.appendChild(punti);
        }
        tabella.appendChild(riga);
    }

    return risultatiOrdinati.length > 0;
}

async function caricaTempiGiroOpenF1(anno, sessione, sessioneProgrammata, gara, tabella) {
    const sessioneOpenF1 = await trovaSessioneOpenF1(anno, sessione, sessioneProgrammata, gara);
    if (!sessioneOpenF1) {
        throw new Error("OpenF1 non ha dati per questa sessione o questo weekend.");
    }

    const chiaveSessione = sessioneOpenF1.session_key;
    const [piloti, giri] = await Promise.all([
        recuperaOpenF1(`drivers?session_key=${chiaveSessione}`),
        recuperaOpenF1(`laps?session_key=${chiaveSessione}`)
    ]);
    const pilotiPerNumero = new Map(piloti.map(pilota => [pilota.driver_number, pilota]));
    const miglioriGiri = new Map();
    giri.forEach(giro => {
        if (
            typeof giro.lap_duration !== "number" ||
            !Number.isFinite(giro.lap_duration) ||
            giro.lap_duration <= 0 ||
            giro.is_pit_out_lap
        ) {
            return;
        }
        const migliore = miglioriGiri.get(giro.driver_number);
        if (!migliore || giro.lap_duration < migliore.lap_duration) {
            miglioriGiri.set(giro.driver_number, giro);
        }
    });
    const risultati = [...miglioriGiri.values()].sort((prima, seconda) =>
        prima.lap_duration - seconda.lap_duration
    );
    if (!risultati.length) {
        throw new Error("OpenF1 non ha tempi sul giro validi per questa sessione.");
    }

    aggiungiMessaggio(
        tabella,
        "OpenF1: ordine per miglior giro, non classifica ufficiale.",
        4
    );
    for (const [indice, giro] of risultati.entries()) {
        const pilota = pilotiPerNumero.get(giro.driver_number);
        const riga = document.createElement("tr");
        const posizione = document.createElement("td");
        posizione.textContent = indice + 1;
        const nome = document.createElement("td");
        if (pilota) {
            nome.appendChild(await creaCollegamentoPilotaOpenF1(pilota, anno, "dettaglioGara"));
        } else {
            nome.textContent = `Pilota #${giro.driver_number}`;
        }
        const scuderia = document.createElement("td");
        scuderia.appendChild(creaElementoScuderia(
            pilota?.team_name || "Scuderia non disponibile",
            anno
        ));
        const tempo = document.createElement("td");
        tempo.textContent = formattaTempoGiro(giro.lap_duration);
        riga.append(posizione, nome, scuderia, tempo);
        tabella.appendChild(riga);
    }
}

export async function caricaCalendario(anno) {
    let contenitore = document.getElementById("listaGare");
    const fonte = document.getElementById("fonteCalendario");
    contenitore.replaceChildren();
    fonte.replaceChildren();

    let gare;
    if (Number(anno) === 2027) {
        try {
            gare = await recuperaCalendarioOpenF1(anno);
        } catch (errore) {
            console.error("Errore nel recupero del calendario 2027 da OpenF1:", errore);
            contenitore.textContent = "Calendario 2027 non disponibile al momento.";
            return;
        }
        const link = document.createElement("a");
        link.href = "https://api.openf1.org/v1/meetings?year=2027";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "OpenF1";
        fonte.append("Calendario 2027 fornito da ", link, ".");
    } else {
        const dati = await recuperaDati(`/${anno}/races.json`);
        gare = dati?.RaceTable?.Races || [];
    }

    if (!gare.length) {
        contenitore.textContent = `Il calendario ${anno} non è ancora stato pubblicato.`;
        return;
    }

    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);

    for (const gara of gare) {
        const dateWeekend = [
            gara.date,
            ...["FirstPractice", "SecondPractice", "ThirdPractice", "SprintQualifying", "Sprint", "Qualifying"]
                .map(chiave => gara[chiave]?.date)
        ]
            .filter(Boolean)
            .map(data => new Date(`${data}T00:00:00`))
            .sort((prima, seconda) => prima - seconda);
        const dataGara = new Date(`${gara.date}T00:00:00`);
        const dataInizioWeekend = gara.weekendStart
            ? new Date(`${gara.weekendStart}T00:00:00`)
            : dateWeekend[0];
        const dataFineWeekend = gara.weekendEnd
            ? new Date(`${gara.weekendEnd}T00:00:00`)
            : dateWeekend[dateWeekend.length - 1];
        let stato;
        let classeStato;

        if (dataFineWeekend < oggi) {
            stato = "Concluso";
            classeStato = "weekend-disputato";
        } else if (dataInizioWeekend <= oggi && oggi <= dataFineWeekend) {
            try {
                let conclusa = false;
                let risultatiGara;
                if (Number(anno) === 2027) {
                    conclusa = (await recuperaOpenF1(
                        `session_result?session_key=${gara.raceSessionKey}`
                    )).length > 0;
                } else {
                    risultatiGara = await recuperaDati(`/${anno}/${gara.round}/results.json`);
                }
                if (Number(anno) !== 2027 && risultatiGara === null) {
                    console.warn(`Verifica dello stato di ${gara.raceName} non disponibile.`);
                    stato = "Verifica non disponibile";
                    classeStato = "weekend-in-corso";
                } else if (
                    conclusa ||
                    risultatiGara?.RaceTable?.Races?.[0]?.Results?.length > 0
                ) {
                    stato = "Concluso";
                    classeStato = "weekend-disputato";
                } else {
                    stato = "In corso";
                    classeStato = "weekend-in-corso";
                }
            } catch (errore) {
                console.error(`Impossibile verificare lo stato di ${gara.raceName}:`, errore);
                stato = "Verifica non disponibile";
                classeStato = "weekend-in-corso";
            }
        } else {
            stato = "Da disputare";
            classeStato = "weekend-da-disputare";
        }

        let elemento = document.createElement("div");
        elemento.classList.add(classeStato);
        elemento.dataset.stato = classeStato;
        elemento.style.cursor = "pointer";
        elemento.addEventListener("click", function() {
            apriDettaglioGara(anno, gara);
        });
        const titolo = document.createElement("h3");
        titolo.textContent = `${gara.round}. ${gara.raceName}`;
        const circuito = document.createElement("p");
        circuito.textContent = `Circuito: ${gara.Circuit.circuitName}`;
        const localita = document.createElement("p");
        localita.textContent = `Località: ${gara.Circuit.Location.locality}, ${gara.Circuit.Location.country}`;
        const data = document.createElement("p");
        data.textContent = `Data: ${dataGara.toLocaleDateString("it-IT")}`;
        const statoGara = document.createElement("p");
        statoGara.textContent = `Stato: ${stato}`;
        elemento.append(titolo, circuito, localita, data, statoGara);

        contenitore.appendChild(elemento);
    }
}
export async function apriDettaglioGara(anno, gara) {
    cambiaPagina("dettaglioGara");

    document.getElementById("titoloDettaglioGara").textContent =
        gara.raceName + " - " + gara.Circuit.circuitName;

    let select = document.getElementById("sessioneGara");

    select.innerHTML = "";

    let sessioni = [
        { chiave: "FirstPractice", valore: "practice1", etichetta: "Prove libere 1" },
        { chiave: "SecondPractice", valore: "practice2", etichetta: "Prove libere 2" },
        { chiave: "ThirdPractice", valore: "practice3", etichetta: "Prove libere 3" },
        { chiave: "SprintQualifying", valore: "sprintqualifying", etichetta: "Qualifiche Sprint" },
        { chiave: "Qualifying", valore: "qualifying", etichetta: "Qualifiche" },
        { chiave: "Sprint", valore: "sprint", etichetta: "Sprint" },
        { chiave: "gara", valore: "results", etichetta: "Gara" }
    ];

    sessioni
        .filter(sessione => sessione.chiave === "gara" || gara[sessione.chiave])
        .sort((prima, seconda) => {
            let dataPrima = prima.chiave === "gara" ? gara.date : gara[prima.chiave].date;
            let oraPrima = prima.chiave === "gara" ? gara.time : gara[prima.chiave].time;
            let dataSeconda = seconda.chiave === "gara" ? gara.date : gara[seconda.chiave].date;
            let oraSeconda = seconda.chiave === "gara" ? gara.time : gara[seconda.chiave].time;
            return new Date(`${dataPrima}T${oraPrima || "00:00:00Z"}`) -
                new Date(`${dataSeconda}T${oraSeconda || "00:00:00Z"}`);
        })
        .forEach(sessione => {
            select.add(new Option(sessione.etichetta, sessione.valore));
        });

    select.onchange = function() {
        caricaRisultatiSessione(anno, gara.round, select.value, gara);
    };

    await caricaRisultatiSessione(anno, gara.round, select.value, gara);
}
async function caricaRisultatiSessione(anno, round, sessione, garaSelezionata) {
    let chiaveSessione = {
        practice1: "FirstPractice",
        practice2: "SecondPractice",
        practice3: "ThirdPractice",
        sprintqualifying: "SprintQualifying",
        qualifying: "Qualifying",
        sprint: "Sprint"
    }[sessione];
    let sessioneProgrammata = garaSelezionata && garaSelezionata[chiaveSessione];
    let sessioniSenzaRisultati = [
        "practice1",
        "practice2",
        "practice3",
        "sprintqualifying"
    ];
    let tabella = document.getElementById("risultatiGara");
    let mostraPunti = !sessioniSenzaRisultati.includes(sessione) && sessione !== "qualifying";
    document.getElementById("intestazionePunti").hidden = !mostraPunti;

    tabella.innerHTML = "";
    const dataSessione = sessioneProgrammata?.date || garaSelezionata?.date;
    const sessioneFutura = dataSessione &&
        new Date(`${dataSessione}T00:00:00`) > new Date(new Date().toDateString());

    if (sessioniSenzaRisultati.includes(sessione)) {
        let sessioneNome = document.querySelector(`#sessioneGara option[value="${sessione}"]`).textContent;
        let orario = sessioneProgrammata
            ? new Date(`${sessioneProgrammata.date}T${sessioneProgrammata.time || "00:00:00Z"}`)
                .toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" })
            : "";
        let dettaglio = orario ? ` Orario: ${orario} (ora locale).` : "";
        if (sessioneFutura) {
            aggiungiMessaggio(tabella, `${sessioneNome}: sessione non ancora disputata.${dettaglio}`, 4);
            return;
        }
        try {
            const risultatiCaricati = await caricaClassificaOpenF1(
                anno,
                sessione,
                sessioneProgrammata,
                garaSelezionata,
                tabella,
                false
            );
            if (risultatiCaricati) {
                return;
            }
            await caricaTempiGiroOpenF1(
                anno,
                sessione,
                sessioneProgrammata,
                garaSelezionata,
                tabella
            );
        } catch (errore) {
            console.error("Errore nel caricamento dei risultati OpenF1:", errore);
            aggiungiMessaggio(
                tabella,
                `${sessioneNome}: risultati non disponibili. Fonte alternativa: OpenF1. ${errore.message}${dettaglio}`,
                4
            );
        }
        return;
    }

    if (sessioneFutura) {
        aggiungiMessaggio(
            tabella,
            "Risultati non ancora disponibili: la sessione deve ancora disputarsi.",
            mostraPunti ? 5 : 4
        );
        return;
    }

    let dati = await recuperaDati(`/${anno}/${round}/${sessione}.json`);
    let gara = dati?.RaceTable?.Races?.[0];

    let risultati = [];

    if (sessione === "results") {
        risultati = gara?.Results || [];
    }

    if (sessione === "qualifying") {
        risultati = gara?.QualifyingResults || [];
    }

    if (sessione === "sprint") {
        risultati = gara?.SprintResults || [];
    }

    if (risultati.length === 0) {
        try {
            const risultatiAlternativi = await caricaClassificaOpenF1(
                anno,
                sessione,
                sessioneProgrammata,
                garaSelezionata,
                tabella,
                mostraPunti
            );
            if (risultatiAlternativi) {
                return;
            }
        } catch (errore) {
            console.error("Errore nel caricamento dei risultati classificati OpenF1:", errore);
        }
        aggiungiMessaggio(
            tabella,
            "Risultati non disponibili: Jolpica ed OpenF1 non hanno restituito una classifica per questa sessione.",
            mostraPunti ? 5 : 4
        );
        return;
    }

    risultati.forEach(risultato => {
        let tempo = "N/D";

        if (sessione === "qualifying") {
            tempo = [
                risultato.Q1,
                risultato.Q2,
                risultato.Q3
            ].filter(Boolean).join(" | ") || "N/D";
        } else {
            tempo = risultato.Time?.time || risultato.status || "N/D";
        }

        let riga = document.createElement("tr");

        const posizione = document.createElement("td");
        posizione.textContent = risultato.position;
        const nome = document.createElement("td");
        nome.appendChild(creaCollegamentoPilota(risultato.Driver, anno, "dettaglioGara"));
        const scuderia = document.createElement("td");
        scuderia.appendChild(creaElementoScuderia(
            risultato.Constructor.name,
            anno,
            risultato.Constructor.constructorId
        ));
        const cellaTempo = document.createElement("td");
        cellaTempo.textContent = tempo;
        riga.append(posizione, nome, scuderia, cellaTempo);

        if (mostraPunti) {
            const punti = document.createElement("td");
            punti.textContent = risultato.points;
            riga.appendChild(punti);
        }

        tabella.appendChild(riga);
    });
}