
export function cambiaPagina(nomePagina) {
    let pagine = document.querySelectorAll(".pagina");

    pagine.forEach(pagina => {
        pagina.style.display = "none";
    });
    document.getElementById(nomePagina).style.display = "block";
}
export function mostraClassifica(tipo) {
    document.getElementById("classificaPiloti").style.display = "none";
    document.getElementById("classificaCostruttori").style.display = "none";

    if (tipo === "piloti") {
        document.getElementById("classificaPiloti").style.display = "block";
    }

    if (tipo === "costruttori") {
        document.getElementById("classificaCostruttori").style.display = "block";
    }
}