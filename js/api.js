const API_URL = "https://api.jolpi.ca/ergast/f1";
const OPENF1_API_URL = "https://api.openf1.org/v1";
const openF1Cache = new Map();
const classificaOpenF1Cache = new Map();
const weekendOpenF1Cache = new Map();
let codaRichiesteOpenF1 = Promise.resolve();
let ultimaRichiestaOpenF1 = 0;

export async function recuperaOpenF1(endpoint) {
    if (!openF1Cache.has(endpoint)) {
        const richiesta = codaRichiesteOpenF1.then(async () => {
            const attesa = Math.max(0, 450 - (Date.now() - ultimaRichiestaOpenF1));
            if (attesa) {
                await new Promise(resolve => window.setTimeout(resolve, attesa));
            }
            ultimaRichiestaOpenF1 = Date.now();
            const risposta = await fetch(`${OPENF1_API_URL}/${endpoint}`);
            if (!risposta.ok) {
                throw new Error(`OpenF1 ha risposto con HTTP ${risposta.status}.`);
            }
            const dati = await risposta.json();
            if (!Array.isArray(dati)) {
                throw new Error("OpenF1 ha restituito dati in un formato non valido.");
            }
            return dati;
        });
        codaRichiesteOpenF1 = richiesta.then(
            () => undefined,
            () => undefined
        );
        openF1Cache.set(endpoint, richiesta);
        richiesta.catch(() => openF1Cache.delete(endpoint));
    }

    return openF1Cache.get(endpoint);
}

export async function recuperaCalendarioOpenF1(anno) {
    const [incontri, sessioni] = await Promise.all([
        recuperaOpenF1(`meetings?year=${anno}`),
        recuperaOpenF1(`sessions?year=${anno}`)
    ]);
    const incontriPerChiave = new Map(
        incontri.map(incontro => [incontro.meeting_key, incontro])
    );
    const gare = sessioni
        .filter(sessione =>
            sessione.session_name === "Race" &&
            !sessione.is_cancelled &&
            incontriPerChiave.has(sessione.meeting_key)
        )
        .sort((prima, seconda) =>
            new Date(prima.date_start) - new Date(seconda.date_start)
        );
    const chiaviSessione = {
        "Practice 1": "FirstPractice",
        "Practice 2": "SecondPractice",
        "Practice 3": "ThirdPractice",
        "Sprint Qualifying": "SprintQualifying",
        "Sprint Shootout": "SprintQualifying",
        "Qualifying": "Qualifying",
        "Sprint": "Sprint"
    };

    return gare.map((gara, indice) => {
        const incontro = incontriPerChiave.get(gara.meeting_key);
        const weekendSessioni = sessioni
            .filter(sessione =>
                sessione.meeting_key === gara.meeting_key &&
                !sessione.is_cancelled
            )
            .sort((prima, seconda) =>
                new Date(prima.date_start) - new Date(seconda.date_start)
            );
        const risultato = {
            season: String(anno),
            round: String(indice + 1),
            raceName: incontro.meeting_name,
            date: gara.date_start.slice(0, 10),
            time: gara.date_start.slice(11),
            raceSessionKey: gara.session_key,
            weekendStart: incontro.date_start.slice(0, 10),
            weekendEnd: gara.date_start.slice(0, 10),
            Circuit: {
                circuitName: incontro.circuit_short_name,
                Location: {
                    locality: incontro.location,
                    country: incontro.country_name
                }
            }
        };

        for (const sessione of weekendSessioni) {
            const chiave = chiaviSessione[sessione.session_name];
            if (chiave) {
                risultato[chiave] = {
                    date: sessione.date_start.slice(0, 10),
                    time: sessione.date_start.slice(11)
                };
            }
        }

        return risultato;
    });
}

function identificativoCostruttore(nome) {
    const nomeNormalizzato = String(nome || "").toLowerCase();
    if (nomeNormalizzato.includes("red bull")) return "red_bull";
    if (nomeNormalizzato.includes("racing bulls")) return "racing_bulls";
    if (nomeNormalizzato.includes("haas")) return "haas";
    if (nomeNormalizzato.includes("aston martin")) return "aston_martin";
    if (nomeNormalizzato.includes("cadillac")) return "cadillac";
    if (nomeNormalizzato.includes("kick sauber") || nomeNormalizzato.includes("sauber")) return "sauber";
    return nomeNormalizzato.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function recuperaClassificaOpenF1(anno, tipo) {
    const chiaveCache = `${anno}-${tipo}`;
    if (!classificaOpenF1Cache.has(chiaveCache)) {
        const richiesta = (async () => {
            const sessioni = (await recuperaOpenF1(
                `sessions?year=${anno}&session_name=Race`
            )).sort((prima, seconda) =>
                new Date(prima.date_start) - new Date(seconda.date_start)
            );
            const ultimoGpConcluso = sessioni
                .filter(sessione =>
                    !sessione.is_cancelled &&
                    sessione.date_end &&
                    new Date(sessione.date_end) <= new Date()
                )
                .sort((prima, seconda) =>
                    new Date(seconda.date_end) - new Date(prima.date_end)
                )[0];

            if (!ultimoGpConcluso) {
                return null;
            }

            const endpoint = tipo === "driver"
                ? "championship_drivers"
                : "championship_teams";
            const richieste = [
                recuperaOpenF1(`${endpoint}?session_key=${ultimoGpConcluso.session_key}`)
            ];
            if (tipo === "driver") {
                richieste.push(
                    recuperaOpenF1(`drivers?session_key=${ultimoGpConcluso.session_key}`)
                );
            }
            const [classifica, piloti = []] = await Promise.all(richieste);
            if (!classifica.length) {
                return null;
            }

            const giro = String(sessioni.indexOf(ultimoGpConcluso) + 1);
            const standings = tipo === "driver"
                ? (() => {
                    const pilotiPerNumero = new Map(
                        piloti.map(pilota => [pilota.driver_number, pilota])
                    );
                    return classifica
                        .filter(voce => pilotiPerNumero.has(voce.driver_number))
                        .map(voce => {
                            const pilota = pilotiPerNumero.get(voce.driver_number);
                            const teamName = pilota.team_name || "Scuderia non disponibile";
                            return {
                                position: String(voce.position_current || ""),
                                points: String(voce.points_current ?? 0),
                                wins: "N/D",
                                Driver: {
                                    driverId: `openf1_${pilota.driver_number}`,
                                    permanentNumber: String(pilota.driver_number),
                                    code: pilota.name_acronym || "",
                                    givenName: pilota.first_name || "",
                                    familyName: pilota.last_name || "",
                                    full_name: pilota.full_name || "",
                                    driver_number: pilota.driver_number,
                                    team_name: teamName
                                },
                                Constructors: [{
                                    constructorId: identificativoCostruttore(teamName),
                                    name: teamName
                                }]
                            };
                        })
                        .sort((prima, seconda) => Number(prima.position) - Number(seconda.position));
                })()
                : classifica
                    .map(voce => ({
                        position: String(voce.position_current || ""),
                        points: String(voce.points_current ?? 0),
                        wins: "N/D",
                        Constructor: {
                            constructorId: identificativoCostruttore(voce.team_name),
                            name: voce.team_name
                        }
                    }))
                    .sort((prima, seconda) => Number(prima.position) - Number(seconda.position));

            return {
                source: "OpenF1",
                StandingsTable: {
                    season: String(anno),
                    round: giro,
                    StandingsLists: [{
                        season: String(anno),
                        round: giro,
                        [tipo === "driver" ? "DriverStandings" : "ConstructorStandings"]: standings
                    }]
                }
            };
        })();
        classificaOpenF1Cache.set(chiaveCache, richiesta);
        richiesta.then(
            dati => {
                if (!dati) classificaOpenF1Cache.delete(chiaveCache);
            },
            () => classificaOpenF1Cache.delete(chiaveCache)
        );
    }

    return classificaOpenF1Cache.get(chiaveCache);
}

function creaRisultatiOpenF1(risultati, piloti) {
    const pilotiPerNumero = new Map(piloti.map(pilota => [pilota.driver_number, pilota]));
    return risultati.map(risultato => {
        const pilota = pilotiPerNumero.get(risultato.driver_number);
        const nomeScuderia = pilota?.team_name || "Scuderia non disponibile";
        return {
            position: String(risultato.position ?? ""),
            points: String(risultato.points ?? 0),
            Driver: {
                driverId: `openf1_${risultato.driver_number}`,
                permanentNumber: String(risultato.driver_number),
                code: pilota?.name_acronym || "",
                givenName: pilota?.first_name || "Pilota",
                familyName: pilota?.last_name || `#${risultato.driver_number}`
            },
            Constructor: {
                constructorId: identificativoCostruttore(nomeScuderia),
                name: nomeScuderia
            }
        };
    });
}

export async function recuperaUltimiWeekendOpenF1(anno, quantita = 3) {
    if (anno < 2023) {
        throw new Error("OpenF1 offre risultati storici a partire dalla stagione 2023.");
    }

    const chiaveCache = `${anno}-${quantita}`;
    if (!weekendOpenF1Cache.has(chiaveCache)) {
        const richiesta = (async () => {
            const sessioni = await recuperaOpenF1(`sessions?year=${anno}`);
            const gare = sessioni
                .filter(sessione =>
                    sessione.session_name === "Race" &&
                    !sessione.is_cancelled &&
                    sessione.date_end &&
                    new Date(sessione.date_end) <= new Date()
                )
                .sort((prima, seconda) =>
                    new Date(prima.date_start) - new Date(seconda.date_start)
                );
            const gareRecenti = gare.slice(-quantita);

            if (!gareRecenti.length) {
                return null;
            }

            const gareRisultati = [];
            const sprintRisultati = [];
            for (const gara of gareRecenti) {
                const sprint = sessioni.find(sessione =>
                    sessione.meeting_key === gara.meeting_key &&
                    sessione.session_name === "Sprint" &&
                    !sessione.is_cancelled &&
                    sessione.date_end &&
                    new Date(sessione.date_end) <= new Date()
                );
                const garaDettaglio = {
                    round: String(gare.indexOf(gara) + 1),
                    raceName: gara.country_name === "United Arab Emirates"
                        ? "Abu Dhabi Grand Prix"
                        : gara.country_name === "Qatar"
                            ? "Qatar Grand Prix"
                            : `${gara.location || gara.country_name} Grand Prix`,
                    Results: []
                };
                const sessioniRisultati = sprint ? [gara, sprint] : [gara];

                for (const sessione of sessioniRisultati) {
                    const [risultati, piloti] = await Promise.all([
                        recuperaOpenF1(`session_result?session_key=${sessione.session_key}`),
                        recuperaOpenF1(`drivers?session_key=${sessione.session_key}`)
                    ]);
                    if (!risultati.length) {
                        continue;
                    }
                    const classificati = creaRisultatiOpenF1(risultati, piloti);
                    if (sessione.session_name === "Sprint") {
                        sprintRisultati.push({
                            round: garaDettaglio.round,
                            raceName: garaDettaglio.raceName,
                            SprintResults: classificati
                        });
                    } else {
                        garaDettaglio.Results = classificati;
                    }
                }

                if (garaDettaglio.Results.length) {
                    gareRisultati.push(garaDettaglio);
                }
            }

            return gareRisultati.length
                ? {
                    gareGara: { RaceTable: { Races: gareRisultati } },
                    gareSprint: { RaceTable: { Races: sprintRisultati } },
                    source: "OpenF1"
                }
                : null;
        })();
        weekendOpenF1Cache.set(chiaveCache, richiesta);
        richiesta.then(
            dati => {
                if (!dati) weekendOpenF1Cache.delete(chiaveCache);
            },
            () => weekendOpenF1Cache.delete(chiaveCache)
        );
    }

    return weekendOpenF1Cache.get(chiaveCache);
}

function tipoClassifica(endpoint) {
    const corrispondenza = endpoint.match(/^\/(\d{4})\/(driver|constructor)standings\.json(?:\?.*)?$/i);
    return corrispondenza
        ? { anno: Number(corrispondenza[1]), tipo: corrispondenza[2].toLowerCase() }
        : null;
}

function classificaVuota(dati, tipo) {
    const elenco = dati?.StandingsTable?.StandingsLists?.[0]?.[
        tipo === "driver" ? "DriverStandings" : "ConstructorStandings"
    ];
    return !Array.isArray(elenco) || elenco.length === 0;
}

export async function recuperaDati(endpoint) {
    const classificaRichiesta = tipoClassifica(endpoint);

    try {
        const risposta = await fetch(API_URL + endpoint);
        if (!risposta.ok) {
            throw new Error(`Jolpica ha risposto con HTTP ${risposta.status}.`);
        }

        const rispostaJson = await risposta.json();
        const dati = rispostaJson.MRData;

        if (classificaRichiesta && classificaVuota(dati, classificaRichiesta.tipo)) {
            const alternativa = await recuperaClassificaOpenF1(
                classificaRichiesta.anno,
                classificaRichiesta.tipo
            );
            if (alternativa) {
                return alternativa;
            }
        }

        return dati;
    } catch (errore) {
        console.error("Errore API Jolpica:", errore);
        if (classificaRichiesta) {
            try {
                const alternativa = await recuperaClassificaOpenF1(
                    classificaRichiesta.anno,
                    classificaRichiesta.tipo
                );
                if (alternativa) {
                    return alternativa;
                }
            } catch (erroreAlternativo) {
                console.error("Errore nel recupero della classifica alternativa OpenF1:", erroreAlternativo);
            }
        }
        return null;
    }
}
