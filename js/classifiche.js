import { recuperaDati } from "./api.js";
import { creaCollegamentoPilota, creaElementoScuderia } from "./schedaPilota.js";

function mostraMessaggio(tabella, colonne, messaggio) {
    const riga = document.createElement("tr");
    const cella = document.createElement("td");
    cella.colSpan = colonne;
    cella.textContent = messaggio;
    riga.appendChild(cella);
    tabella.replaceChildren(riga);
}

async function recuperaClassifica(stagione, tipo, tabella, colonne, nomeClassifica) {
    const anno = /^\d{4}$/.test(String(stagione)) ? stagione : new Date().getFullYear();
    const dati = await recuperaDati(`/${anno}/${tipo}standings.json`);

    if (!dati) {
        tabella.dataset.fonte = "non-disponibile";
        mostraMessaggio(tabella, colonne, "Classifica non disponibile.");
        return [];
    }

    tabella.dataset.fonte = dati.source || "Jolpica";
    const classifiche = dati.StandingsTable?.StandingsLists || [];
    const elementi = classifiche[0]?.[nomeClassifica] || [];

    if (elementi.length === 0) {
        mostraMessaggio(tabella, colonne, "Nessun dato disponibile per questa stagione.");
        return [];
    }

    return elementi;
}

export async function caricaClassifica(stagione) {
    const tabella = document.getElementById("tabellaPiloti");
    const anno = /^\d{4}$/.test(String(stagione)) ? stagione : new Date().getFullYear();
    const piloti = await recuperaClassifica(
        stagione,
        "driver",
        tabella,
        5,
        "DriverStandings"
    );

    const righe = piloti.map(pilota => {
        const riga = document.createElement("tr");
        if (Number(pilota.position) === 1) {
            riga.classList.add("classifica-prima");
        }
        const celle = [
            document.createElement("td"),
            document.createElement("td"),
            document.createElement("td"),
            document.createElement("td"),
            document.createElement("td")
        ];

        celle[0].textContent = pilota.position;
        celle[1].appendChild(creaCollegamentoPilota(pilota.Driver, anno, "classifiche"));
        celle[2].appendChild(creaElementoScuderia(
            pilota.Constructors[0]?.name || "N/D",
            anno,
            pilota.Constructors[0]?.constructorId
        ));
        [pilota.points, pilota.wins].forEach((valore, indice) => {
            const cella = document.createElement("td");
            cella.textContent = valore;
            celle[indice + 3] = cella;
        });

        riga.append(...celle);
        return riga;
    });

    if (righe.length > 0) {
        tabella.replaceChildren(...righe);
        if (tabella.dataset.fonte === "OpenF1") {
            const nota = document.createElement("tr");
            const cellaNota = document.createElement("td");
            cellaNota.colSpan = 5;
            cellaNota.textContent = "Fonte alternativa OpenF1; il numero di vittorie non è fornito.";
            nota.appendChild(cellaNota);
            tabella.prepend(nota);
        }
    }
}

export async function caricaClassificaCostruttori(stagione) {
    const tabella = document.getElementById("tabellaCostruttori");
    const costruttori = await recuperaClassifica(
        stagione,
        "constructor",
        tabella,
        4,
        "ConstructorStandings"
    );

    const righe = costruttori.map(costruttore => {
        const riga = document.createElement("tr");
        if (Number(costruttore.position) === 1) {
            riga.classList.add("classifica-prima");
        }
        const celle = [
            document.createElement("td"),
            document.createElement("td"),
            document.createElement("td"),
            document.createElement("td")
        ];
        celle[0].textContent = costruttore.position;
        celle[1].appendChild(creaElementoScuderia(
            costruttore.Constructor.name,
            stagione,
            costruttore.Constructor.constructorId
        ));
        [costruttore.points, costruttore.wins].forEach((valore, indice) => {
            const cella = document.createElement("td");
            cella.textContent = valore;
            celle[indice + 2] = cella;
        });

        riga.append(...celle);
        return riga;
    });

    if (righe.length > 0) {
        tabella.replaceChildren(...righe);
        if (tabella.dataset.fonte === "OpenF1") {
            const nota = document.createElement("tr");
            const cellaNota = document.createElement("td");
            cellaNota.colSpan = 4;
            cellaNota.textContent = "Fonte alternativa OpenF1; il numero di vittorie non è fornito.";
            nota.appendChild(cellaNota);
            tabella.prepend(nota);
        }
    }
}
