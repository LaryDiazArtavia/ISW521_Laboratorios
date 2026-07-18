"use strict";

/* ──────────────────────────────────────────────────────
   CONFIGURACIÓN
────────────────────────────────────────────────────── */
const BASE = "https://worldcup26.ir";

/* ──────────────────────────────────────────────────────
   ESTADO DE LA APLICACIÓN
────────────────────────────────────────────────────── */
const state = {
  teams: [],
  games: [],
  stadiums: [],

  selectedTeam: null,
  selectedGames: [],

  gamesLoaded: false,
  stadiumsLoaded: false,
  stadiumsError: false
};

/* ──────────────────────────────────────────────────────
   SELECTORES DEL DOM
────────────────────────────────────────────────────── */
const teamSelect = document.getElementById("teamSelect");
const teamInfo = document.getElementById("teamInfo");
const teamFlagImg = document.getElementById("teamFlagImg");
const teamName = document.getElementById("teamName");

const cardsGrid = document.getElementById("cardsGrid");
const sectionEyebrow = document.getElementById("sectionEyebrow");
const eyebrowCount = document.getElementById("eyebrowCount");
const gamesEmptyState = document.getElementById("gamesEmptyState");

const stadiumsEmptyState = document.getElementById("stadiumsEmptyState");
const stadiumsGrid = document.getElementById("stadiumsGrid");
const citiesChips = document.getElementById("citiesChips");
const alertBanner = document.getElementById("alertBanner");
const alertMsg = document.getElementById("alertMsg");

const statsBar = document.getElementById("statsBar");
const citiesSection = document.getElementById("citiesSection");
const apiStatus = document.getElementById("apiStatus");

const screenButtons = document.querySelectorAll("[data-screen]");
const screenPanels = document.querySelectorAll("[data-screen-panel]");
const startButton = document.getElementById("startButton");

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
   BÚSQUEDA DE EQUIPOS
────────────────────────────────────────────────────── */
function getTeamById(teamId) {
  return state.teams.find(
    team => String(team.id) === String(teamId)
  );
}

/* ──────────────────────────────────────────────────────
   BÚSQUEDA DE ESTADIOS
────────────────────────────────────────────────────── */
function getStadiumById(stadiumId) {
  return state.stadiums.find(
    stadium => String(stadium.id) === String(stadiumId)
  );
}

/* ──────────────────────────────────────────────────────
   CONVERSIÓN DE FECHAS
   La API utiliza el formato MM/DD/YYYY HH:mm.
────────────────────────────────────────────────────── */
function parseLocalDate(localDate) {
  if (!localDate || typeof localDate !== "string") {
    return new Date(NaN);
  }

  const [datePart, timePart = "00:00"] =
    localDate.trim().split(" ");

  const [month, day, year] =
    datePart.split("/").map(Number);

  const [hour, minute] =
    timePart.split(":").map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute
  );
}

function formatLocalDate(localDate) {
  const date = parseLocalDate(localDate);

  if (Number.isNaN(date.getTime())) {
    return localDate || "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

/* ──────────────────────────────────────────────────────
   POBLAR EL SELECTOR DE EQUIPOS
────────────────────────────────────────────────────── */
function populateTeamSelector() {
  const sortedTeamList = [...state.teams].sort((a, b) => {
    const nameA = a.name_en ?? "";
    const nameB = b.name_en ?? "";

    return nameA.localeCompare(nameB);
  });

  teamSelect.innerHTML =
    `<option value="">
      — Selecciona un equipo (${sortedTeamList.length}) —
    </option>`;

  sortedTeamList.forEach(team => {
    const option = document.createElement("option");

    option.value = String(team.id);
    option.textContent =
      team.name_en ?? `Equipo ${team.id}`;

    teamSelect.appendChild(option);
  });

  teamSelect.disabled = false;
}

/* ──────────────────────────────────────────────────────
   MOSTRAR EL EQUIPO SELECCIONADO
────────────────────────────────────────────────────── */
function renderSelectedTeam(team) {
  teamFlagImg.src = team.flag;
  teamFlagImg.alt =
    `Bandera de ${team.name_en}`;

  teamName.textContent =
    team.name_en ?? `Equipo ${team.id}`;

  teamInfo.style.display = "flex";
}

/* ──────────────────────────────────────────────────────
   LIMPIAR LA SELECCIÓN
────────────────────────────────────────────────────── */
function clearSelectedTeam() {
  state.selectedTeam = null;
  state.selectedGames = [];

  teamInfo.style.display = "none";

  cardsGrid.innerHTML = "";
  eyebrowCount.textContent = "0";
  sectionEyebrow.classList.remove("visible");

  gamesEmptyState.style.display = "block";
  gamesEmptyState.textContent =
    "Seleccione primero un equipo para consultar su itinerario.";

  stadiumsGrid.innerHTML = "";
  citiesChips.innerHTML = "";

  citiesSection.style.display = "none";
  alertBanner.style.display = "none";

  stadiumsEmptyState.style.display = "block";
  stadiumsEmptyState.textContent =
    "Seleccione un equipo para consultar las ciudades y los estadios de su itinerario.";
}

/* ──────────────────────────────────────────────────────
   FILTRAR Y ORDENAR LOS PARTIDOS DEL EQUIPO
────────────────────────────────────────────────────── */
function updateSelectedTeamGames() {
  if (!state.selectedTeam) {
    return;
  }

  if (!state.gamesLoaded) {
    gamesEmptyState.style.display = "block";
    gamesEmptyState.textContent =
      "Los partidos todavía se están cargando.";

    return;
  }

  const selectedTeamId =
    String(state.selectedTeam.id);

  state.selectedGames = state.games
    .filter(game => {
      const homeTeamId =
        String(game.home_team_id);

      const awayTeamId =
        String(game.away_team_id);

      return (
        homeTeamId === selectedTeamId ||
        awayTeamId === selectedTeamId
      );
    })
    .sort((gameA, gameB) => {
      const dateA =
        parseLocalDate(gameA.local_date);

      const dateB =
        parseLocalDate(gameB.local_date);

      return dateA - dateB;
    });

  renderGames();
}

/* ──────────────────────────────────────────────────────
   OBTENER LA FASE DEL PARTIDO
────────────────────────────────────────────────────── */
function getMatchPhase(game) {
  const phaseCode = String(game.group ?? "")
    .trim()
    .toUpperCase();

  const isGroupStage = /^[A-L]$/.test(phaseCode);

  if (isGroupStage) {
    return {
      text: `Grupo ${phaseCode}`,
      showMatchday: true
    };
  }

  const knockoutPhases = {
    R32: "Ronda de 32",
    R16: "Octavos de final",
    QF: "Cuartos de final",
    SF: "Semifinal",
    F: "Final",
    FINAL: "Final"
  };

  return {
    text: knockoutPhases[phaseCode] ?? "Fase eliminatoria",
    showMatchday: false
  };
}

/* ──────────────────────────────────────────────────────
   CREAR UNA TARJETA DE PARTIDO
────────────────────────────────────────────────────── */
function createMatchCard(game) {
  const selectedTeamId =
    String(state.selectedTeam.id);

  const isHome =
    String(game.home_team_id) === selectedTeamId;

  const opponentId = isHome
    ? game.away_team_id
    : game.home_team_id;

  const opponentTeam =
    getTeamById(opponentId);

  const opponentName =
    opponentTeam?.name_en ??
    (isHome
      ? game.away_team_name_en
      : game.home_team_name_en) ??
    `Equipo ${opponentId}`;

  const selectedTeamName =
    state.selectedTeam.name_en ??
    `Equipo ${state.selectedTeam.id}`;

  const roleName =
    isHome ? "Local" : "Visitante";

  const roleClass =
    isHome ? "role-home" : "role-away";

  const matchPhase = getMatchPhase(game);

  const matchdayText =
    matchPhase.showMatchday && game.matchday
      ? ` · Jornada ${game.matchday}`
      : "";

  const stadium =
  getStadiumById(game.stadium_id);

  let stadiumName = "Pendiente de cargar";
  let stadiumLocation =
    `Identificador del estadio: ${game.stadium_id ?? "No disponible"}`;

  if (state.stadiumsError) {
    stadiumName = "Estadio no disponible";
    stadiumLocation =
      "La información de estadios no pudo cargarse.";
  } else if (state.stadiumsLoaded && stadium) {
    stadiumName =
      stadium.name_en ?? stadium.fifa_name ?? "Nombre no disponible";

    const city =
      stadium.city_en ?? "Ciudad no disponible";

    const country =
      stadium.country_en ?? "País no disponible";

    const formattedCapacity =
      Number(stadium.capacity).toLocaleString("es-CR");

    stadiumLocation =
      `${city}, ${country} · Capacidad: ${formattedCapacity}`;
  } else if (state.stadiumsLoaded && !stadium) {
    stadiumName = "Estadio no encontrado";
    stadiumLocation =
      `No existe información para el estadio ${game.stadium_id}.`;
  }

  const card = document.createElement("article");

  card.className =
    `match-card ${isHome ? "home" : "away"}`;

  card.innerHTML = `
    <div class="card-stripe"></div>

    <div class="card-header">
      <div class="card-matchup">
        <p class="card-round">
          ${matchPhase.text}${matchdayText}
        </p>

        <h3 class="card-teams">
          <span class="team-highlight">
            ${selectedTeamName}
          </span>
          vs ${opponentName}
        </h3>
      </div>

      <span class="card-role-badge ${roleClass}">
        ${roleName}
      </span>
    </div>

    <div class="card-body">
      <div class="card-row">
        <span class="card-icon" aria-hidden="true">📅</span>

        <div class="card-row-content">
          <p class="card-row-label">Fecha y hora</p>

          <p class="card-row-value">
            ${formatLocalDate(game.local_date)}
          </p>
        </div>
      </div>

      <div class="card-row">
        <span class="card-icon" aria-hidden="true">🏟️</span>

        <div class="card-row-content">
          <p class="card-row-label">Estadio</p>

          <p class="card-row-value">
            ${stadiumName}
          </p>

          <p class="card-row-sub">
            ${stadiumLocation}
          </p>
        </div>
      </div>
    </div>
  `;

  return card;
}

/* ──────────────────────────────────────────────────────
   MOSTRAR LOS PARTIDOS EN PANTALLA
────────────────────────────────────────────────────── */
function renderGames() {
  cardsGrid.innerHTML = "";

  eyebrowCount.textContent =
    String(state.selectedGames.length);

  if (state.selectedGames.length === 0) {
    sectionEyebrow.classList.remove("visible");

    gamesEmptyState.style.display = "block";
    gamesEmptyState.textContent =
      "No se encontraron partidos para el equipo seleccionado.";

    return;
  }

  gamesEmptyState.style.display = "none";
  sectionEyebrow.classList.add("visible");

  state.selectedGames.forEach(game => {
    const card = createMatchCard(game);
    cardsGrid.appendChild(card);
  });
}

/* ──────────────────────────────────────────────────────
   CREAR TARJETA DE ESTADIO
────────────────────────────────────────────────────── */
function createStadiumCard(stadium, gamesCount) {
  const card = document.createElement("article");

  card.className = "stadium-card";

  const stadiumName =
    stadium.name_en ??
    stadium.fifa_name ??
    "Estadio sin nombre";

  const city =
    stadium.city_en ?? "Ciudad no disponible";

  const country =
    stadium.country_en ?? "País no disponible";

  const capacity =
    Number(stadium.capacity).toLocaleString("es-CR");

  card.innerHTML = `
    <div class="stadium-card-header">
      <span class="stadium-card-icon" aria-hidden="true">
        🏟️
      </span>

      <div>
        <h3>${stadiumName}</h3>

        <p>
          ${city}, ${country}
        </p>
      </div>
    </div>

    <div class="stadium-card-data">
      <div>
        <span class="stadium-data-label">Capacidad</span>
        <strong>${capacity}</strong>
      </div>

      <div>
        <span class="stadium-data-label">
          Partidos del equipo
        </span>

       <strong>
        ${gamesCount}
        ${gamesCount === 1 ? "partido" : "partidos"}
      </strong>
      </div>
    </div>
  `;

  return card;
}

/* ──────────────────────────────────────────────────────
   MOSTRAR CIUDADES Y ESTADIOS DEL EQUIPO
────────────────────────────────────────────────────── */
function renderStadiumsScreen() {
  stadiumsGrid.innerHTML = "";
  citiesChips.innerHTML = "";

  alertBanner.style.display = "none";
  citiesSection.style.display = "none";

  if (!state.selectedTeam) {
    stadiumsEmptyState.style.display = "block";
    stadiumsEmptyState.textContent =
      "Seleccione un equipo para consultar las ciudades y los estadios de su itinerario.";

    return;
  }

  if (!state.gamesLoaded) {
    stadiumsEmptyState.style.display = "block";
    stadiumsEmptyState.textContent =
      "Los partidos todavía se están cargando.";

    return;
  }

  if (state.stadiumsError) {
    stadiumsEmptyState.style.display = "block";
    stadiumsEmptyState.textContent =
      "Los partidos están disponibles, pero no fue posible cargar los estadios.";

    alertBanner.style.display = "flex";

    alertMsg.textContent =
      "La petición a /get/stadiums falló. Los partidos permanecen disponibles.";

    return;
  }

  if (!state.stadiumsLoaded) {
    stadiumsEmptyState.style.display = "block";
    stadiumsEmptyState.textContent =
      "La información de estadios todavía se está cargando.";

    return;
  }

  const stadiumGameCounts = new Map();

  state.selectedGames.forEach(game => {
    const stadiumId = String(game.stadium_id);

    const currentCount =
      stadiumGameCounts.get(stadiumId) ?? 0;

    stadiumGameCounts.set(
      stadiumId,
      currentCount + 1
    );
  });

  const selectedStadiums = [];

  stadiumGameCounts.forEach((gamesCount, stadiumId) => {
    const stadium =
      getStadiumById(stadiumId);

    if (stadium) {
      selectedStadiums.push({
        stadium,
        gamesCount
      });
    }
  });

  selectedStadiums.sort((itemA, itemB) => {
    const cityA =
      itemA.stadium.city_en ?? "";

    const cityB =
      itemB.stadium.city_en ?? "";

    return cityA.localeCompare(cityB);
  });

  if (selectedStadiums.length === 0) {
    stadiumsEmptyState.style.display = "block";
    stadiumsEmptyState.textContent =
      "No se encontraron estadios para el equipo seleccionado.";

    return;
  }

  stadiumsEmptyState.style.display = "none";
  citiesSection.style.display = "block";

  const uniqueCities = [
    ...new Set(
      selectedStadiums.map(item =>
        item.stadium.city_en ?? "Ciudad no disponible"
      )
    )
  ];

  uniqueCities.forEach(city => {
    const chip = document.createElement("span");

    chip.className = "city-chip";
    chip.textContent = city;

    citiesChips.appendChild(chip);
  });

  selectedStadiums.forEach(item => {
    const card = createStadiumCard(
      item.stadium,
      item.gamesCount
    );

    stadiumsGrid.appendChild(card);
  });
}

/* ──────────────────────────────────────────────────────
   EVENTO DEL SELECTOR
────────────────────────────────────────────────────── */
function addEventToTeamSelect() {
  teamSelect.addEventListener("change", () => {
    const teamId = teamSelect.value;

    if (!teamId) {
      clearSelectedTeam();
      return;
    }

    const selectedTeam =
      getTeamById(teamId);

    if (!selectedTeam) {
      console.error(
        "No se encontró el equipo seleccionado."
      );

      clearSelectedTeam();
      return;
    }

    state.selectedTeam = selectedTeam;

    renderSelectedTeam(selectedTeam);
    updateSelectedTeamGames();
    renderStadiumsScreen();

    console.log(
      "Equipo seleccionado:",
      selectedTeam
    );
  });
}

/* ──────────────────────────────────────────────────────
   CARGAR EQUIPOS
────────────────────────────────────────────────────── */
function loadTeams() {
  fetch(`${BASE}/get/teams`)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Error HTTP ${response.status} al cargar equipos`
        );
      }

      return response.json();
    })
    .then(jsonData => {
      if (!Array.isArray(jsonData.teams)) {
        throw new Error(
          "La API no devolvió una lista válida de equipos."
        );
      }

      state.teams = jsonData.teams;

      populateTeamSelector();

      console.log(
        `${state.teams.length} equipos cargados correctamente.`
      );
    })
    .catch(error => {
      console.error(
        "Error al cargar equipos:",
        error
      );

      teamSelect.innerHTML =
        `<option value="">
          No se pudieron cargar los equipos
        </option>`;

      teamSelect.disabled = true;
    });
}

/* ──────────────────────────────────────────────────────
   CARGAR PARTIDOS
────────────────────────────────────────────────────── */
function loadGames() {
  fetch(`${BASE}/get/games`)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Error HTTP ${response.status} al cargar partidos`
        );
      }

      return response.json();
    })
    .then(jsonData => {
      if (!Array.isArray(jsonData.games)) {
        throw new Error(
          "La API no devolvió una lista válida de partidos."
        );
      }

      state.games = jsonData.games;
      state.gamesLoaded = true;

      console.log(
        `${state.games.length} partidos cargados correctamente.`
      );

      if (state.selectedTeam) {
        updateSelectedTeamGames();
        renderStadiumsScreen();
      }
    })
    .catch(error => {
      state.gamesLoaded = false;

      console.error(
        "Error al cargar partidos:",
        error
      );

      gamesEmptyState.style.display = "block";
      gamesEmptyState.textContent =
        "No fue posible cargar los partidos.";
    });
}

/* ──────────────────────────────────────────────────────
   CARGAR ESTADIOS
────────────────────────────────────────────────────── */
function loadStadiums() {
  fetch(`${BASE}/get/stadiums`)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Error HTTP ${response.status} al cargar estadios`
        );
      }

      return response.json();
    })
    .then(jsonData => {
      console.log("Respuesta completa de estadios:", jsonData);

      if (!Array.isArray(jsonData.stadiums)) {
        throw new Error(
          "La API no devolvió una lista válida de estadios."
        );
      }

      state.stadiums = jsonData.stadiums;
      state.stadiumsLoaded = true;
      state.stadiumsError = false;

      console.log(
        `${state.stadiums.length} estadios cargados correctamente.`
      );

      console.log(
        "Primer estadio recibido:",
        state.stadiums[0]
      );

      if (state.selectedTeam) {
        renderGames();
        renderStadiumsScreen();
      }
    })
    .catch(error => {
      state.stadiumsLoaded = false;
      state.stadiumsError = true;

      console.error(
        "Error al cargar estadios:",
        error
      );

      if (state.selectedTeam) {
        renderGames();
        renderStadiumsScreen();
      }
    });
}

/* ──────────────────────────────────────────────────────
   INICIALIZACIÓN
────────────────────────────────────────────────────── */
function init() {
  configureScreenNavigation();
  addEventToTeamSelect();

  loadTeams();
  loadGames();
  loadStadiums();
}

/* Punto de entrada */
init();