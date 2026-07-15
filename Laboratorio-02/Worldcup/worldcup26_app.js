"use strict";

/* ──────────────────────────────────────────────────────
   CONFIGURACIÓN
────────────────────────────────────────────────────── */
const BASE = "https://worldcup26.ir";

/* ──────────────────────────────────────────────────────
   ESTADO DE APLICACIÓN
   Separamos claramente los tres recursos para que el fallo
   de uno no contamine el estado de los otros.
────────────────────────────────────────────────────── */
const state = {
  teams:     [],            // Array<{id, name, flag_url, ...}>
  //
};

/* ──────────────────────────────────────────────────────
   SELECTORES DOM
────────────────────────────────────────────────────── */
const teamSelect     = document.getElementById("teamSelect");
const teamInfo     = document.getElementById("teamInfo");
const cardsGrid       = document.getElementById("cardsGrid");
const statsBar        = document.getElementById("statsBar");
const sectionEyebrow  = document.getElementById("sectionEyebrow");
const citiesSection   = document.getElementById("citiesSection");
const apiStatus       = document.getElementById("apiStatus");
const screenButtons = document.querySelectorAll("[data-screen]");
const screenPanels = document.querySelectorAll("[data-screen-panel]");
const startButton = document.getElementById("startButton");

/* ──────────────────────────────────────────────────────
   POBLAR SELECTOR DE EQUIPOS
   Datos obtenidos de /get/teams, ordenados alfabéticamente.
────────────────────────────────────────────────────── */
function populateTeamSelector() {
  const sortedTeamList = [...state.teams].sort((a, b) => {
    const na = a.name_en ?? "";
    const nb = b.name_en ?? "";
    return na.localeCompare(nb);
  });


  teamSelect.innerHTML =
    `<option value="">— Selecciona un equipo (${sortedTeamList.length}) —</option>`;

  sortedTeamList.forEach(team => {
    const opt = document.createElement("option");
    opt.value = String(team.id);
    opt.textContent = team.name_en ?? `Equipo ${team.id}`;
    teamSelect.appendChild(opt);
  });

  addEventToTeamSelect();
  teamSelect.disabled = false;
}

/* ──────────────────────────────────────────────────────
   EVENTO: cambio de equipo en el selector
────────────────────────────────────────────────────── */
function addEventToTeamSelect() {
  teamSelect.addEventListener("change", () => {
    const teamId = teamSelect.value;

    if (!teamId) {
      teamInfo.style.display = "none";
      return;
    }

    const selectedTeam = state.teams.find(
      team => String(team.id) === teamId
    );

    if (!selectedTeam) {
      console.error("No se encontró el equipo seleccionado.");
      teamInfo.style.display = "none";
      return;
    }

    const flag = document.getElementById("teamFlagImg");
    const name = document.getElementById("teamName");

    flag.src = selectedTeam.flag;
    flag.alt = `Bandera de ${selectedTeam.name_en}`;
    name.textContent = selectedTeam.name_en;

    teamInfo.style.display = "flex";

    console.log("Equipo seleccionado:", selectedTeam);
  });
}

/* ──────────────────────────────────────────────────────
   NAVEGACIÓN ENTRE LAS CINCO PANTALLAS
────────────────────────────────────────────────────── */
function showScreen(screenName) {
  screenPanels.forEach(panel => {
    const isSelected =
      panel.dataset.screenPanel === screenName;

    panel.classList.toggle("active", isSelected);
    panel.hidden = !isSelected;
  });

  screenButtons.forEach(button => {
    const isSelected =
      button.dataset.screen === screenName;

    button.classList.toggle("active", isSelected);
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function configureScreenNavigation() {
  screenButtons.forEach(button => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.screen);
    });
  });

  if (startButton) {
    startButton.addEventListener("click", () => {
      showScreen("equipo");
    });
  }
}

/* ──────────────────────────────────────────────────────
   Init: carga inicial de los tres endpoints
────────────────────────────────────────────────────── */
function init() {
  configureScreenNavigation();

  fetch(`${BASE}/get/teams`)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Error HTTP ${response.status} al cargar los equipos`
        );
      }

      return response.json();
    })
    .then(jsondata => {
      if (!Array.isArray(jsondata.teams)) {
        throw new Error(
          "La respuesta de la API no contiene una lista válida de equipos."
        );
      }

      state.teams = jsondata.teams;
      populateTeamSelector();

      console.log(
        `${state.teams.length} equipos cargados correctamente.`
      );
    })
    .catch(error => {
      console.error("Error al cargar equipos:", error);

      if (teamSelect) {
        teamSelect.innerHTML =
          `<option value="">No se pudieron cargar los equipos</option>`;

        teamSelect.disabled = true;
      }
    });
}

/* Punto de entrada */
init();