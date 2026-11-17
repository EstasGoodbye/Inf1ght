import { cambiaPagina, mostraClassifica } from "./navigazione.js";
import { caricaClassifica, caricaClassificaCostruttori } from "./classifiche.js";
import { caricaCalendario } from "./calendario.js";
import { caricaSimulatore, simulaMondiale } from "./simulatore.js";
import { caricaHome } from "./home.js";
window.cambiaPagina = cambiaPagina;
window.mostraClassifica = mostraClassifica;
window.simulaMondiale = simulaMondiale;
window.aggiornaStagione = async function () {
    const selezioneStagione = document.getElementById("stagione");
    const stagione = Number(selezioneStagione.value);
    selezioneStagione.disabled = true;
    try {
        await Promise.all([
            caricaClassifica(stagione),
            caricaClassificaCostruttori(stagione),
            caricaCalendario(stagione),
            caricaSimulatore(stagione),
            caricaHome(stagione)
        ]);
    } finally {
        selezioneStagione.disabled = false;
    }
}

function preparaSelettoreStagione() {
    const selezione = document.getElementById("stagione");
    const annoCorrente = new Date().getFullYear();
    const opzioni = [];
    for (let anno = annoCorrente + 1; anno >= 2020; anno -= 1) {
        opzioni.push(new Option(String(anno), String(anno)));
    }
    selezione.replaceChildren(...opzioni);
    selezione.value = String(annoCorrente);
}

function configuraTema() {
    const pulsante = document.getElementById("cambiaTema");
    const temaSalvato = localStorage.getItem("inf1ght-tema");
    const applicaTema = tema => {
        document.documentElement.dataset.tema = tema;
        pulsante.textContent = tema === "scuro" ? "Tema chiaro" : "Tema scuro";
        pulsante.setAttribute("aria-pressed", String(tema === "scuro"));
    };

    applicaTema(temaSalvato === "scuro" ? "scuro" : "chiaro");
    pulsante.addEventListener("click", () => {
        const tema = document.documentElement.dataset.tema === "scuro" ? "chiaro" : "scuro";
        localStorage.setItem("inf1ght-tema", tema);
        applicaTema(tema);
    });
}

async function inizializzaSito() {
    preparaSelettoreStagione();
    configuraTema();
    cambiaPagina("home");
    await window.aggiornaStagione();
}

document.addEventListener("DOMContentLoaded", inizializzaSito);
