"use strict";

/* ──────────────────────────────────────────────────────
   CONFIGURACIÓN
────────────────────────────────────────────────────── */
const BASE = "https://worldcup26.ir";

/*
 * SOLO PARA PRUEBAS:
 * null = funcionamiento normal
 * 429  = simular demasiadas solicitudes
 * 500  = simular error interno
 */
const TEST_HTTP_STATUS = null;

const RETRY_DELAYS = [
  1000,
  2000,
  4000,
  8000
];

const CACHE_KEYS = {
  teams: "worldcup26_teams",
  games: "worldcup26_games",
  stadiums: "worldcup26_stadiums"
};

/*
 * Reintentos en segundo plano para /get/teams.
 * Estos reintentos pertenecen al reto del punto 2.2.
 */
const TEAM_BACKGROUND_RETRY_DELAYS = [
  2000,
  4000,
  8000,
  16000
];

let teamsBackgroundRetryTimer = null;
let teamsRequestInProgress = false;

/* ──────────────────────────────────────────────────────
   ESTADO DE LA APLICACIÓN
────────────────────────────────────────────────────── */
const state = {
  teams: [],
  games: [],
  stadiums: [],
  groups: [],

  goleadas: [],
  muroRanking: [],

  selectedTeam: null,
  selectedGames: [],

  teamsLoaded: false,
  teamsError: false,
  teamsRetryAttempt: 0,

  gamesLoaded: false,
  gamesError: false,

  groupsLoaded: false,
  groupsError: false,

  stadiumsLoaded: false,
  stadiumsError: false,
  stadiumsLoading: false,

  cacheSources: {
    teams: null,
    games: null,
    stadiums: null
  }
};

/* ──────────────────────────────────────────────────────
   SELECTORES DEL DOM
────────────────────────────────────────────────────── */
const teamSelectionSection =
  document.getElementById("teamSelectionSection");

const teamSelect =
  document.getElementById("teamSelect");

const teamInfo =
  document.getElementById("teamInfo");

const teamFlagImg =
  document.getElementById("teamFlagImg");

const teamName =
  document.getElementById("teamName");

const cardsGrid =
  document.getElementById("cardsGrid");

const sectionEyebrow =
  document.getElementById("sectionEyebrow");

const eyebrowCount =
  document.getElementById("eyebrowCount");

const gamesEmptyState =
  document.getElementById("gamesEmptyState");

const stadiumsEmptyState =
  document.getElementById("stadiumsEmptyState");

const stadiumsGrid =
  document.getElementById("stadiumsGrid");

const citiesSection =
  document.getElementById("citiesSection");

const citiesChips =
  document.getElementById("citiesChips");

const alertBanner =
  document.getElementById("alertBanner");

const alertMsg =
  document.getElementById("alertMsg");

const retryStadiumsButton =
  document.getElementById("retryStadiumsButton");

const statsBar =
  document.getElementById("statsBar");

const summaryEmptyState =
  document.getElementById("summaryEmptyState");

const statGames =
  document.getElementById("statGames");

const statCities =
  document.getElementById("statCities");

const statHome =
  document.getElementById("statHome");

const statAway =
  document.getElementById("statAway");

const statStadiums =
  document.getElementById("statStadiums");

const statCapacity =
  document.getElementById("statCapacity");

const apiStatus =
  document.getElementById("apiStatus");

const startButton =
  document.getElementById("startButton");

const resilienceBanner =
  document.getElementById("resilienceBanner");

const resilienceTitle =
  document.getElementById("resilienceTitle");

const resilienceMessage =
  document.getElementById("resilienceMessage");

const offlineBanner =
  document.getElementById("offlineBanner");

const offlineMessage =
  document.getElementById("offlineMessage");

/* ──────────────────────────────────────────────────────
   NAVEGACIÓN ENTRE PANTALLAS
────────────────────────────────────────────────────── */
const screenNavButtons =
  document.querySelectorAll("[data-screen]");

const screenPanels =
  document.querySelectorAll("[data-screen-panel]");

/* ──────────────────────────────────────────────────────
   SELECTORES DE LA PANTALLA 2.2
────────────────────────────────────────────────────── */
const goleadasTotal =
  document.getElementById("goleadasTotal");

const goleadasTeamsWarning =
  document.getElementById("goleadasTeamsWarning");

const goleadasTeamsWarningMessage =
  document.getElementById(
    "goleadasTeamsWarningMessage"
  );

const goleadasEmptyState =
  document.getElementById("goleadasEmptyState");

const goleadasEyebrow =
  document.getElementById("goleadasEyebrow");

const goleadasCount =
  document.getElementById("goleadasCount");

const goleadasGrid =
  document.getElementById("goleadasGrid");

/* ──────────────────────────────────────────────────────
   SELECTORES DE LA PANTALLA 2.3
────────────────────────────────────────────────────── */

const muroTotal =
  document.getElementById("muroTotal");

const muroStatus =
  document.getElementById("muroStatus");

const muroStatusMessage =
  document.getElementById("muroStatusMessage");

const muroEmptyState =
  document.getElementById("muroEmptyState");

const muroEyebrow =
  document.getElementById("muroEyebrow");

const muroCount =
  document.getElementById("muroCount");

const muroGrid =
  document.getElementById("muroGrid");

/* ──────────────────────────────────────────────────────
   UTILIDADES DE ESTADO VISUAL
────────────────────────────────────────────────────── */
function setApiStatus(message) {
  if (apiStatus) {
    apiStatus.textContent = message;
  }
}

function showResilienceBanner(title, message) {
  resilienceTitle.textContent = title;
  resilienceMessage.textContent = message;
  resilienceBanner.hidden = false;
}

function hideResilienceBanner() {
  resilienceBanner.hidden = true;
}

function showStadiumAlert(message) {
  alertMsg.textContent = message;
  alertBanner.hidden = false;
}

function hideStadiumAlert() {
  alertBanner.hidden = true;
}

/* ──────────────────────────────────────────────────────
   GUARDAR DATOS EN LOCALSTORAGE
────────────────────────────────────────────────────── */
function saveToCache(cacheKey, data) {
  const cacheData = {
    savedAt: new Date().toISOString(),
    data
  };

  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify(cacheData)
    );

    return true;
  } catch (error) {
    console.warn(
      `No fue posible guardar ${cacheKey}:`,
      error
    );

    return false;
  }
}

/* ──────────────────────────────────────────────────────
   LEER DATOS DE LOCALSTORAGE
────────────────────────────────────────────────────── */
function getFromCache(cacheKey) {
  try {
    const storedValue =
      localStorage.getItem(cacheKey);

    if (!storedValue) {
      return null;
    }

    const parsedValue =
      JSON.parse(storedValue);

    if (
      !parsedValue ||
      !Array.isArray(parsedValue.data) ||
      !parsedValue.savedAt
    ) {
      return null;
    }

    return parsedValue;
  } catch (error) {
    console.warn(
      `No fue posible leer ${cacheKey}:`,
      error
    );

    return null;
  }
}

/* ──────────────────────────────────────────────────────
   FORMATEAR FECHA DEL RESPALDO
────────────────────────────────────────────────────── */
function formatCacheDate(savedAt) {
  const date = new Date(savedAt);

  if (Number.isNaN(date.getTime())) {
    return "fecha desconocida";
  }

  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

/* ──────────────────────────────────────────────────────
   ACTUALIZAR AVISO DE DATOS GUARDADOS
────────────────────────────────────────────────────── */
function updateOfflineBanner() {
  const labels = {
    teams: "equipos",
    games: "partidos",
    stadiums: "estadios"
  };

  const cachedResources =
    Object.entries(state.cacheSources)
      .filter(([, savedAt]) => savedAt)
      .map(([resourceName, savedAt]) => {
        return (
          `${labels[resourceName]} ` +
          `(${formatCacheDate(savedAt)})`
        );
      });

  if (cachedResources.length === 0) {
    offlineBanner.hidden = true;
    return;
  }

  offlineMessage.textContent =
    "Datos no actualizados utilizados: " +
    cachedResources.join(", ") +
    ".";

  offlineBanner.hidden = false;
}

function markResourceAsCached(
  resourceName,
  savedAt
) {
  state.cacheSources[resourceName] = savedAt;
  updateOfflineBanner();
}

function markResourceAsFresh(resourceName) {
  state.cacheSources[resourceName] = null;
  updateOfflineBanner();
}

/* ──────────────────────────────────────────────────────
   COUNTDOWN DE REINTENTOS
────────────────────────────────────────────────────── */
function runRetryCountdown(
  seconds,
  endpointName,
  statusCode
) {
  return new Promise(resolve => {
    let remainingSeconds = seconds;

    const updateMessage = () => {
      showResilienceBanner(
        `Error HTTP ${statusCode} en ${endpointName}`,
        `Nuevo intento en ${remainingSeconds} segundo${
          remainingSeconds === 1 ? "" : "s"
        }.`
      );
    };

    updateMessage();

    const countdownInterval =
      setInterval(() => {
        remainingSeconds -= 1;

        if (remainingSeconds <= 0) {
          clearInterval(countdownInterval);

          showResilienceBanner(
            `Reintentando ${endpointName}`,
            "Realizando una nueva petición..."
          );

          resolve();
          return;
        }

        updateMessage();
      }, 1000);
  });
}

/* ──────────────────────────────────────────────────────
   FETCH CON REINTENTOS PARA 429 Y 500
────────────────────────────────────────────────────── */
function fetchJsonWithRetry(
  endpoint,
  endpointName,
  attempt = 0
) {
  const requestUrl =
    TEST_HTTP_STATUS === 429 ||
    TEST_HTTP_STATUS === 500
      ? `http://localhost:3001/status/${TEST_HTTP_STATUS}`
      : `${BASE}${endpoint}`;

  return fetch(requestUrl)
    .then(response => {
      if (response.ok) {
        hideResilienceBanner();
        return response.json();
      }

      const isRetryable =
        response.status === 429 ||
        response.status === 500;

      if (!isRetryable) {
        throw new Error(
          `Error HTTP ${response.status} en ${endpointName}`
        );
      }

      if (attempt >= RETRY_DELAYS.length) {
        throw new Error(
          `Se agotaron los reintentos para ${endpointName}. ` +
          `Último estado HTTP: ${response.status}`
        );
      }

      const retryAfterHeader =
        Number(
          response.headers.get("Retry-After")
        );

      const delayMilliseconds =
        response.status === 429 &&
        Number.isFinite(retryAfterHeader) &&
        retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : RETRY_DELAYS[attempt];

      const delaySeconds =
        Math.ceil(
          delayMilliseconds / 1000
        );

      console.warn(
        `${endpointName} devolvió HTTP ${response.status}. ` +
        `Reintento ${attempt + 1} en ${delaySeconds}s.`
      );

      return runRetryCountdown(
        delaySeconds,
        endpointName,
        response.status
      ).then(() => {
        return fetchJsonWithRetry(
          endpoint,
          endpointName,
          attempt + 1
        );
      });
    });
}

/* ──────────────────────────────────────────────────────
   NAVEGACIÓN INTERNA DE LA RUTA DEL CAMPEÓN
────────────────────────────────────────────────────── */
function configureInternalNavigation() {
  if (
    startButton &&
    teamSelectionSection
  ) {
    startButton.addEventListener(
      "click",
      () => {
        teamSelectionSection.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        window.setTimeout(() => {
          teamSelect.focus();
        }, 500);
      }
    );
  }

  if (retryStadiumsButton) {
    retryStadiumsButton.addEventListener(
      "click",
      () => {
        loadStadiums();
      }
    );
  }
}

/* ──────────────────────────────────────────────────────
   MOSTRAR UNA PANTALLA DEL LABORATORIO
────────────────────────────────────────────────────── */
function showScreen(
  screenName,
  moveToTop = true
) {
  screenPanels.forEach(panel => {
    const isActive =
      panel.dataset.screenPanel ===
      screenName;

    panel.classList.toggle(
      "active",
      isActive
    );

    panel.hidden = !isActive;
  });

  screenNavButtons.forEach(button => {
    const isActive =
      button.dataset.screen ===
      screenName;

    button.classList.toggle(
      "active",
      isActive
    );

    if (isActive) {
      button.setAttribute(
        "aria-current",
        "page"
      );
    } else {
      button.removeAttribute(
        "aria-current"
      );
    }
  });

  if (screenName === "goleadas") {
    renderGoleadas();
  }

  if (screenName === "muro") {
  renderMuro();
  }

  if (moveToTop) {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
}

/* ──────────────────────────────────────────────────────
   CONFIGURAR BOTONES DE NAVEGACIÓN
────────────────────────────────────────────────────── */
function configureScreenNavigation() {
  screenNavButtons.forEach(button => {
    button.addEventListener(
      "click",
      () => {
        if (button.disabled) {
          return;
        }

        showScreen(
          button.dataset.screen
        );
      }
    );
  });
}

/* ──────────────────────────────────────────────────────
   BUSCAR EQUIPO POR ID
────────────────────────────────────────────────────── */
function getTeamById(teamId) {
  return state.teams.find(
    team =>
      String(team.id) ===
      String(teamId)
  );
}

/* ──────────────────────────────────────────────────────
   BUSCAR ESTADIO POR ID
────────────────────────────────────────────────────── */
function getStadiumById(stadiumId) {
  return state.stadiums.find(
    stadium =>
      String(stadium.id) ===
      String(stadiumId)
  );
}

/* ──────────────────────────────────────────────────────
   CONVERTIR FECHA DE LA API
────────────────────────────────────────────────────── */
function parseLocalDate(localDate) {
  if (
    !localDate ||
    typeof localDate !== "string"
  ) {
    return new Date(NaN);
  }

  const [
    datePart,
    timePart = "00:00"
  ] = localDate.trim().split(" ");

  const [
    month,
    day,
    year
  ] = datePart
    .split("/")
    .map(Number);

  const [
    hour,
    minute
  ] = timePart
    .split(":")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    hour,
    minute
  );
}

/* ──────────────────────────────────────────────────────
   FORMATEAR FECHA PARA MOSTRARLA
────────────────────────────────────────────────────── */
function formatLocalDate(localDate) {
  const date =
    parseLocalDate(localDate);

  if (Number.isNaN(date.getTime())) {
    return (
      localDate ||
      "Fecha no disponible"
    );
  }

  return new Intl.DateTimeFormat(
    "es-CR",
    {
      dateStyle: "long",
      timeStyle: "short"
    }
  ).format(date);
}

/* ──────────────────────────────────────────────────────
   IDENTIFICAR LA FASE DEL PARTIDO
────────────────────────────────────────────────────── */
function getMatchPhase(game) {
  const phaseCode =
    String(game.group ?? "")
      .trim()
      .toUpperCase();

  if (/^[A-L]$/.test(phaseCode)) {
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
    text:
      knockoutPhases[phaseCode] ??
      "Fase eliminatoria",

    showMatchday: false
  };
}

/* ═══════════════════════════════════════════════════════
   PANTALLA 2.2: RASTREADOR DE GOLEADAS
═══════════════════════════════════════════════════════ */

/* Determina si un partido ya terminó */
function isFinishedGame(game) {
  if (game.finished === true) {
    return true;
  }

  const finishedValue =
    String(game.finished ?? "")
      .trim()
      .toUpperCase();

  return (
    finishedValue === "TRUE" ||
    finishedValue === "FINISHED"
  );
}

/* Convierte un marcador a número */
function parseGameScore(score) {
  if (
    score === null ||
    score === undefined ||
    score === ""
  ) {
    return null;
  }

  const numericScore =
    Number(score);

  return Number.isFinite(
    numericScore
  )
    ? numericScore
    : null;
}

/* Obtiene los datos visibles de un equipo */
function getGoleadaTeamData(
  teamId,
  apiFallbackName
) {
  const team =
    getTeamById(teamId);

  if (state.teamsLoaded && team) {
    return {
      id: teamId,
      name:
        team.name_en ??
        `Equipo ID ${teamId}`,
      flag: team.flag ?? "",
      dataAvailable: true
    };
  }

  /*
   * Si /get/teams todavía no está disponible,
   * se debe mostrar el identificador.
   */
  if (!state.teamsLoaded) {
    return {
      id: teamId,
      name: `Equipo ID ${teamId}`,
      flag: "",
      dataAvailable: false
    };
  }

  return {
    id: teamId,
    name:
      apiFallbackName ??
      `Equipo ID ${teamId}`,
    flag: "",
    dataAvailable: false
  };
}

/* Calcula y ordena todas las goleadas */
function calculateGoleadas() {
  state.goleadas =
    state.games
      .filter(game => {
        return isFinishedGame(game);
      })
      .map(game => {
        const homeScore =
          parseGameScore(
            game.home_score
          );

        const awayScore =
          parseGameScore(
            game.away_score
          );

        if (
          homeScore === null ||
          awayScore === null
        ) {
          return null;
        }

        return {
          game,
          homeScore,
          awayScore,
          difference: Math.abs(
            homeScore - awayScore
          )
        };
      })
      .filter(result => {
        return (
          result !== null &&
          result.difference >= 3
        );
      })
      .sort((resultA, resultB) => {
        const differenceOrder =
          resultB.difference -
          resultA.difference;

        if (differenceOrder !== 0) {
          return differenceOrder;
        }

        return (
          Number(resultA.game.id || 0) -
          Number(resultB.game.id || 0)
        );
      });

  return state.goleadas;
}

/* Crea el elemento visual de una bandera */
function createGoleadaFlagMarkup(team) {
  if (team.flag) {
    return `
      <img
        src="${team.flag}"
        alt="Bandera de ${team.name}"
        loading="lazy"
      >
    `;
  }

  return `
    <span
      class="goleada-flag-placeholder"
      aria-label="Bandera no disponible"
    >
      ID
    </span>
  `;
}

/* Crea una tarjeta de goleada */
function createGoleadaCard(result) {
  const {
    game,
    homeScore,
    awayScore,
    difference
  } = result;

  const homeTeam =
    getGoleadaTeamData(
      game.home_team_id,
      game.home_team_name_en
    );

  const awayTeam =
    getGoleadaTeamData(
      game.away_team_id,
      game.away_team_name_en
    );

  const homeIsWinner =
    homeScore > awayScore;

  const awayIsWinner =
    awayScore > homeScore;

  const matchPhase =
    getMatchPhase(game);

  const card =
    document.createElement(
      "article"
    );

  card.className =
    "goleada-card";

  card.innerHTML = `
    <div class="goleada-card-top">
      <div>
        <span class="goleada-phase">
          ${matchPhase.text}
        </span>

        <p class="goleada-date">
          ${formatLocalDate(game.local_date)}
        </p>
      </div>

      <span class="goleada-difference">
        Diferencia: ${difference}
      </span>
    </div>

    <div class="goleada-match">

      <div class="goleada-team ${
        homeIsWinner ? "winner" : ""
      }">
        <div class="goleada-flag">
          ${createGoleadaFlagMarkup(homeTeam)}
        </div>

        <span class="goleada-team-role">
          Local
        </span>

        <strong>
          ${homeTeam.name}
        </strong>
      </div>

      <div class="goleada-score">
        <span>
          ${homeScore}
        </span>

        <small>
          —
        </small>

        <span>
          ${awayScore}
        </span>
      </div>

      <div class="goleada-team ${
        awayIsWinner ? "winner" : ""
      }">
        <div class="goleada-flag">
          ${createGoleadaFlagMarkup(awayTeam)}
        </div>

        <span class="goleada-team-role">
          Visitante
        </span>

        <strong>
          ${awayTeam.name}
        </strong>
      </div>

    </div>
  `;

  return card;
}

/* Muestra las goleadas en la pantalla */
function renderGoleadas() {
  if (
    !goleadasGrid ||
    !goleadasEmptyState
  ) {
    return;
  }

  goleadasGrid.innerHTML = "";

  goleadasTotal.textContent = "0";
  goleadasCount.textContent = "0";

  goleadasEyebrow.classList.remove(
    "visible"
  );

  if (!state.gamesLoaded) {
    goleadasEmptyState.style.display =
      "block";

    goleadasEmptyState.textContent =
      state.gamesError
        ? "No fue posible cargar los partidos."
        : "Cargando los partidos terminados...";

    return;
  }

  const results =
    calculateGoleadas();

  const teamsUnavailable =
    !state.teamsLoaded;

  goleadasTeamsWarning.hidden =
    !teamsUnavailable;

  if (teamsUnavailable) {
    goleadasTeamsWarningMessage.textContent =
      "Las goleadas permanecen visibles usando los identificadores de los equipos. /get/teams se reintentará automáticamente en segundo plano.";
  }

  goleadasTotal.textContent =
    String(results.length);

  goleadasCount.textContent =
    String(results.length);

  if (results.length === 0) {
    goleadasEmptyState.style.display =
      "block";

    goleadasEmptyState.textContent =
      "No se encontraron partidos terminados con una diferencia de tres o más goles.";

    return;
  }

  goleadasEmptyState.style.display =
    "none";

  goleadasEyebrow.classList.add(
    "visible"
  );

  results.forEach(result => {
    goleadasGrid.appendChild(
      createGoleadaCard(result)
    );
  });
}

/* ──────────────────────────────────────────────────────
   POBLAR SELECTOR DE EQUIPOS
────────────────────────────────────────────────────── */
function populateTeamSelector() {
  const sortedTeams =
    [...state.teams].sort(
      (teamA, teamB) => {
        return (
          teamA.name_en ?? ""
        ).localeCompare(
          teamB.name_en ?? ""
        );
      }
    );

  teamSelect.innerHTML =
    `<option value="">` +
    `— Selecciona un equipo (${sortedTeams.length}) —` +
    `</option>`;

  sortedTeams.forEach(team => {
    const option =
      document.createElement("option");

    option.value =
      String(team.id);

    option.textContent =
      team.name_en ??
      `Equipo ${team.id}`;

    teamSelect.appendChild(option);
  });

  teamSelect.disabled = false;
}

/* ──────────────────────────────────────────────────────
   MOSTRAR EQUIPO SELECCIONADO
────────────────────────────────────────────────────── */
function renderSelectedTeam(team) {
  teamFlagImg.src =
    team.flag;

  teamFlagImg.alt =
    `Bandera de ${team.name_en}`;

  teamName.textContent =
    team.name_en ??
    `Equipo ${team.id}`;

  teamInfo.style.display = "flex";
}

/* ──────────────────────────────────────────────────────
   LIMPIAR EQUIPO SELECCIONADO
────────────────────────────────────────────────────── */
function clearSelectedTeam() {
  state.selectedTeam = null;
  state.selectedGames = [];

  teamInfo.style.display = "none";
  teamFlagImg.src = "";
  teamName.textContent = "—";

  cardsGrid.innerHTML = "";

  eyebrowCount.textContent = "0";

  sectionEyebrow.classList.remove(
    "visible"
  );

  gamesEmptyState.style.display =
    "block";

  gamesEmptyState.textContent =
    "Seleccione un equipo para consultar su itinerario.";

  stadiumsGrid.innerHTML = "";
  citiesChips.innerHTML = "";

  citiesSection.style.display =
    "none";

  hideStadiumAlert();

  stadiumsEmptyState.style.display =
    "block";

  stadiumsEmptyState.textContent =
    "Seleccione un equipo para consultar las ciudades y estadios de su itinerario.";

  statsBar.style.display = "none";

  summaryEmptyState.style.display =
    "block";

  summaryEmptyState.textContent =
    "Seleccione un equipo para generar el resumen.";

  statGames.textContent = "—";
  statCities.textContent = "—";
  statHome.textContent = "—";
  statAway.textContent = "—";
  statStadiums.textContent = "—";
  statCapacity.textContent = "—";
}

/* ──────────────────────────────────────────────────────
   EVENTO DEL SELECTOR DE EQUIPOS
────────────────────────────────────────────────────── */
function addEventToTeamSelect() {
  teamSelect.addEventListener(
    "change",
    () => {
      const teamId =
        teamSelect.value;

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

      state.selectedTeam =
        selectedTeam;

      renderSelectedTeam(
        selectedTeam
      );

      updateSelectedTeamGames();
      renderStadiumsSection();
      renderSummarySection();

      console.log(
        "Equipo seleccionado:",
        selectedTeam
      );
    }
  );
}

/* ──────────────────────────────────────────────────────
   FILTRAR Y ORDENAR PARTIDOS DEL EQUIPO
────────────────────────────────────────────────────── */
function updateSelectedTeamGames() {
  if (!state.selectedTeam) {
    return;
  }

  if (!state.gamesLoaded) {
    gamesEmptyState.style.display =
      "block";

    gamesEmptyState.textContent =
      "Los partidos todavía se están cargando.";

    return;
  }

  const selectedTeamId =
    String(
      state.selectedTeam.id
    );

  state.selectedGames =
    state.games
      .filter(game => {
        return (
          String(
            game.home_team_id
          ) === selectedTeamId ||
          String(
            game.away_team_id
          ) === selectedTeamId
        );
      })
      .sort(
        (gameA, gameB) => {
          return (
            parseLocalDate(
              gameA.local_date
            ) -
            parseLocalDate(
              gameB.local_date
            )
          );
        }
      );

  renderGames();
}

/* ──────────────────────────────────────────────────────
   CREAR TARJETA DE PARTIDO
────────────────────────────────────────────────────── */
function createMatchCard(game) {
  const selectedTeamId =
    String(
      state.selectedTeam.id
    );

  const isHome =
    String(
      game.home_team_id
    ) === selectedTeamId;

  const opponentId =
    isHome
      ? game.away_team_id
      : game.home_team_id;

  const opponentTeam =
    getTeamById(opponentId);

  const opponentName =
    opponentTeam?.name_en ??
    (
      isHome
        ? game.away_team_name_en
        : game.home_team_name_en
    ) ??
    `Equipo ${opponentId}`;

  const selectedTeamName =
    state.selectedTeam.name_en ??
    `Equipo ${state.selectedTeam.id}`;

  const roleName =
    isHome
      ? "Local"
      : "Visitante";

  const roleClass =
    isHome
      ? "role-home"
      : "role-away";

  const matchPhase =
    getMatchPhase(game);

  const matchdayText =
    matchPhase.showMatchday &&
    game.matchday
      ? ` · Jornada ${game.matchday}`
      : "";

  const stadium =
    getStadiumById(
      game.stadium_id
    );

  let stadiumName =
    "Pendiente de cargar";

  let stadiumLocation =
    `Identificador del estadio: ${
      game.stadium_id ??
      "No disponible"
    }`;

  if (state.stadiumsError) {
    stadiumName =
      "Estadio no disponible";

    stadiumLocation =
      "La información de estadios no pudo cargarse.";
  } else if (
    state.stadiumsLoaded &&
    stadium
  ) {
    stadiumName =
      stadium.name_en ??
      stadium.fifa_name ??
      "Nombre no disponible";

    const city =
      stadium.city_en ??
      "Ciudad no disponible";

    const country =
      stadium.country_en ??
      "País no disponible";

    const formattedCapacity =
      Number(
        stadium.capacity || 0
      ).toLocaleString("es-CR");

    stadiumLocation =
      `${city}, ${country} · ` +
      `Capacidad: ${formattedCapacity}`;
  } else if (
    state.stadiumsLoaded &&
    !stadium
  ) {
    stadiumName =
      "Estadio no encontrado";

    stadiumLocation =
      `No existe información para el estadio ${game.stadium_id}.`;
  }

  const card =
    document.createElement(
      "article"
    );

  card.className =
    `match-card ${
      isHome
        ? "home"
        : "away"
    }`;

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
        <span
          class="card-icon"
          aria-hidden="true"
        >
          📅
        </span>

        <div class="card-row-content">
          <p class="card-row-label">
            Fecha y hora
          </p>

          <p class="card-row-value">
            ${formatLocalDate(game.local_date)}
          </p>
        </div>
      </div>

      <div class="card-row">
        <span
          class="card-icon"
          aria-hidden="true"
        >
          🏟️
        </span>

        <div class="card-row-content">
          <p class="card-row-label">
            Estadio
          </p>

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
   MOSTRAR PARTIDOS
────────────────────────────────────────────────────── */
function renderGames() {
  cardsGrid.innerHTML = "";

  eyebrowCount.textContent =
    String(
      state.selectedGames.length
    );

  if (
    state.selectedGames.length === 0
  ) {
    sectionEyebrow.classList.remove(
      "visible"
    );

    gamesEmptyState.style.display =
      "block";

    gamesEmptyState.textContent =
      "No se encontraron partidos para el equipo seleccionado.";

    return;
  }

  gamesEmptyState.style.display =
    "none";

  sectionEyebrow.classList.add(
    "visible"
  );

  state.selectedGames.forEach(
    game => {
      cardsGrid.appendChild(
        createMatchCard(game)
      );
    }
  );
}

/* ──────────────────────────────────────────────────────
   CREAR TARJETA DE ESTADIO
────────────────────────────────────────────────────── */
function createStadiumCard(
  stadium,
  gamesCount
) {
  const stadiumName =
    stadium.name_en ??
    stadium.fifa_name ??
    "Estadio sin nombre";

  const city =
    stadium.city_en ??
    "Ciudad no disponible";

  const country =
    stadium.country_en ??
    "País no disponible";

  const capacity =
    Number(
      stadium.capacity || 0
    ).toLocaleString("es-CR");

  const card =
    document.createElement(
      "article"
    );

  card.className =
    "stadium-card";

  card.innerHTML = `
    <div class="stadium-card-header">
      <span
        class="stadium-card-icon"
        aria-hidden="true"
      >
        🏟️
      </span>

      <div>
        <h3>
          ${stadiumName}
        </h3>

        <p>
          ${city}, ${country}
        </p>
      </div>
    </div>

    <div class="stadium-card-data">

      <div>
        <span class="stadium-data-label">
          Capacidad
        </span>

        <strong>
          ${capacity}
        </strong>
      </div>

      <div>
        <span class="stadium-data-label">
          Partidos del equipo
        </span>

        <strong>
          ${gamesCount}
          ${
            gamesCount === 1
              ? "partido"
              : "partidos"
          }
        </strong>
      </div>

    </div>
  `;

  return card;
}

/* ──────────────────────────────────────────────────────
   MOSTRAR CIUDADES Y ESTADIOS
────────────────────────────────────────────────────── */
function renderStadiumsSection() {
  stadiumsGrid.innerHTML = "";
  citiesChips.innerHTML = "";

  citiesSection.style.display =
    "none";

  hideStadiumAlert();

  if (!state.selectedTeam) {
    stadiumsEmptyState.style.display =
      "block";

    stadiumsEmptyState.textContent =
      "Seleccione un equipo para consultar las ciudades y estadios de su itinerario.";

    return;
  }

  if (!state.gamesLoaded) {
    stadiumsEmptyState.style.display =
      "block";

    stadiumsEmptyState.textContent =
      "Los partidos todavía se están cargando.";

    return;
  }

  if (state.stadiumsError) {
    stadiumsEmptyState.style.display =
      "block";

    stadiumsEmptyState.textContent =
      "Los partidos están disponibles, pero no fue posible cargar los estadios.";

    showStadiumAlert(
      "La petición a /get/stadiums falló. " +
      "Los partidos permanecen disponibles y puede reintentar solo los estadios."
    );

    return;
  }

  if (!state.stadiumsLoaded) {
    stadiumsEmptyState.style.display =
      "block";

    stadiumsEmptyState.textContent =
      "La información de estadios todavía se está cargando.";

    return;
  }

  const stadiumGameCounts =
    new Map();

  state.selectedGames.forEach(
    game => {
      const stadiumId =
        String(
          game.stadium_id
        );

      const currentCount =
        stadiumGameCounts.get(
          stadiumId
        ) ?? 0;

      stadiumGameCounts.set(
        stadiumId,
        currentCount + 1
      );
    }
  );

  const selectedStadiums = [];

  stadiumGameCounts.forEach(
    (
      gamesCount,
      stadiumId
    ) => {
      const stadium =
        getStadiumById(
          stadiumId
        );

      if (stadium) {
        selectedStadiums.push({
          stadium,
          gamesCount
        });
      }
    }
  );

  selectedStadiums.sort(
    (itemA, itemB) => {
      return (
        itemA.stadium.city_en ??
        ""
      ).localeCompare(
        itemB.stadium.city_en ??
        ""
      );
    }
  );

  if (
    selectedStadiums.length === 0
  ) {
    stadiumsEmptyState.style.display =
      "block";

    stadiumsEmptyState.textContent =
      "No se encontraron estadios para el equipo seleccionado.";

    return;
  }

  stadiumsEmptyState.style.display =
    "none";

  citiesSection.style.display =
    "block";

  const uniqueCities = [
    ...new Set(
      selectedStadiums.map(
        item => {
          return (
            item.stadium.city_en ??
            "Ciudad no disponible"
          );
        }
      )
    )
  ];

  uniqueCities.forEach(
    city => {
      const chip =
        document.createElement(
          "span"
        );

      chip.className =
        "city-chip";

      chip.textContent =
        city;

      citiesChips.appendChild(
        chip
      );
    }
  );

  selectedStadiums.forEach(
    item => {
      stadiumsGrid.appendChild(
        createStadiumCard(
          item.stadium,
          item.gamesCount
        )
      );
    }
  );
}

/* ──────────────────────────────────────────────────────
   MOSTRAR RESUMEN DEL RECORRIDO
────────────────────────────────────────────────────── */
function renderSummarySection() {
  if (!state.selectedTeam) {
    statsBar.style.display =
      "none";

    summaryEmptyState.style.display =
      "block";

    summaryEmptyState.textContent =
      "Seleccione un equipo para generar el resumen.";

    return;
  }

  if (!state.gamesLoaded) {
    statsBar.style.display =
      "none";

    summaryEmptyState.style.display =
      "block";

    summaryEmptyState.textContent =
      "Los partidos todavía se están cargando.";

    return;
  }

  const selectedTeamId =
    String(
      state.selectedTeam.id
    );

  const homeGames =
    state.selectedGames.filter(
      game => {
        return (
          String(
            game.home_team_id
          ) === selectedTeamId
        );
      }
    ).length;

  const awayGames =
    state.selectedGames.filter(
      game => {
        return (
          String(
            game.away_team_id
          ) === selectedTeamId
        );
      }
    ).length;

  statGames.textContent =
    String(
      state.selectedGames.length
    );

  statHome.textContent =
    String(homeGames);

  statAway.textContent =
    String(awayGames);

  if (
    !state.stadiumsLoaded ||
    state.stadiumsError
  ) {
    statCities.textContent = "—";
    statStadiums.textContent = "—";
    statCapacity.textContent = "—";

    statsBar.style.display =
      "grid";

    summaryEmptyState.style.display =
      "none";

    return;
  }

  const uniqueStadiumsMap =
    new Map();

  state.selectedGames.forEach(
    game => {
      const stadium =
        getStadiumById(
          game.stadium_id
        );

      if (stadium) {
        uniqueStadiumsMap.set(
          String(stadium.id),
          stadium
        );
      }
    }
  );

  const uniqueStadiums =
    [
      ...uniqueStadiumsMap.values()
    ];

  const uniqueCities =
    new Set(
      uniqueStadiums.map(
        stadium => {
          return (
            stadium.city_en ??
            "Ciudad no disponible"
          );
        }
      )
    );

  const totalCapacity =
    uniqueStadiums.reduce(
      (total, stadium) => {
        return (
          total +
          Number(
            stadium.capacity || 0
          )
        );
      },
      0
    );

  const averageCapacity =
    uniqueStadiums.length > 0
      ? Math.round(
          totalCapacity /
          uniqueStadiums.length
        )
      : 0;

  statCities.textContent =
    String(
      uniqueCities.size
    );

  statStadiums.textContent =
    String(
      uniqueStadiums.length
    );

  statCapacity.textContent =
    averageCapacity.toLocaleString(
      "es-CR"
    );

  statsBar.style.display =
    "grid";

  summaryEmptyState.style.display =
    "none";
}

/* ═══════════════════════════════════════════════════════
   PANTALLA 2.3: EL MURO
═══════════════════════════════════════════════════════ */

/*
 * Extrae los 48 identificadores desde los 12 grupos.
 */
function getGroupTeamIds() {
  const teamIds = [];

  state.groups.forEach(group => {
    if (!Array.isArray(group.teams)) {
      return;
    }

    group.teams.forEach(groupTeam => {
      const teamId =
        String(groupTeam.team_id ?? "").trim();

      if (
        teamId &&
        teamId !== "0" &&
        !teamIds.includes(teamId)
      ) {
        teamIds.push(teamId);
      }
    });
  });

  return teamIds;
}

/*
 * Calcula los goles recibidos por cada equipo
 * utilizando todos los partidos terminados.
 */
function calculateMuroRanking() {
  const teamIds =
    getGroupTeamIds();

  const defensiveMap =
    new Map();

  teamIds.forEach(teamId => {
    defensiveMap.set(teamId, {
      teamId,
      goalsAgainst: 0,
      gamesPlayed: 0
    });
  });

  state.games
    .filter(game => isFinishedGame(game))
    .forEach(game => {
      const homeTeamId =
        String(game.home_team_id ?? "");

      const awayTeamId =
        String(game.away_team_id ?? "");

      const homeScore =
        parseGameScore(game.home_score);

      const awayScore =
        parseGameScore(game.away_score);

      if (
        homeScore === null ||
        awayScore === null
      ) {
        return;
      }

      const homeRecord =
        defensiveMap.get(homeTeamId);

      if (homeRecord) {
        homeRecord.goalsAgainst +=
          awayScore;

        homeRecord.gamesPlayed += 1;
      }

      const awayRecord =
        defensiveMap.get(awayTeamId);

      if (awayRecord) {
        awayRecord.goalsAgainst +=
          homeScore;

        awayRecord.gamesPlayed += 1;
      }
    });

  state.muroRanking =
    [...defensiveMap.values()]
      .sort((teamA, teamB) => {
        const goalsOrder =
          teamA.goalsAgainst -
          teamB.goalsAgainst;

        if (goalsOrder !== 0) {
          return goalsOrder;
        }

        /*
         * Desempate determinista mediante ID.
         * El criterio principal sigue siendo goles recibidos.
         */
        return (
          Number(teamA.teamId) -
          Number(teamB.teamId)
        );
      })
      .slice(0, 5);

  return state.muroRanking;
}

/*
 * Busca el próximo partido no terminado de un equipo.
 */
function findNextGameForTeam(teamId) {
  const normalizedTeamId =
    String(teamId);

  const upcomingGames =
    state.games
      .filter(game => {
        if (isFinishedGame(game)) {
          return false;
        }

        const homeTeamId =
          String(game.home_team_id ?? "");

        const awayTeamId =
          String(game.away_team_id ?? "");

        return (
          homeTeamId === normalizedTeamId ||
          awayTeamId === normalizedTeamId
        );
      })
      .sort((gameA, gameB) => {
        return (
          parseLocalDate(gameA.local_date) -
          parseLocalDate(gameB.local_date)
        );
      });

  return upcomingGames[0] ?? null;
}

/*
 * Determina el rival del siguiente partido.
 * Se ejecuta de forma independiente para cada equipo.
 */
function getNextOpponentForTeam(teamId) {
  try {
    const nextGame =
      findNextGameForTeam(teamId);

    if (!nextGame) {
      return {
        available: true,
        name: "Sin próximo partido",
        flag: "",
        date: ""
      };
    }

    const normalizedTeamId =
      String(teamId);

    const isHome =
      String(nextGame.home_team_id) ===
      normalizedTeamId;

    const opponentId =
      isHome
        ? String(nextGame.away_team_id ?? "")
        : String(nextGame.home_team_id ?? "");

    /*
     * En algunas llaves eliminatorias el rival
     * todavía puede aparecer como un texto pendiente.
     */
    if (
      !opponentId ||
      opponentId === "0"
    ) {
      const opponentLabel =
        isHome
          ? nextGame.away_team_label
          : nextGame.home_team_label;

      if (!opponentLabel) {
        throw new Error(
          `No existe rival para el equipo ${teamId}`
        );
      }

      return {
        available: true,
        name: opponentLabel,
        flag: "",
        date: formatLocalDate(
          nextGame.local_date
        )
      };
    }

    const opponentTeam =
      getTeamById(opponentId);

    const fallbackName =
      isHome
        ? nextGame.away_team_name_en
        : nextGame.home_team_name_en;

    const opponentName =
      opponentTeam?.name_en ??
      fallbackName;

    if (!opponentName) {
      throw new Error(
        `No fue posible resolver el rival ${opponentId}`
      );
    }

    return {
      available: true,
      name: opponentName,
      flag: opponentTeam?.flag ?? "",
      date: formatLocalDate(
        nextGame.local_date
      )
    };
  } catch (error) {
    console.error(
      `Error al buscar el rival del equipo ${teamId}:`,
      error
    );

    /*
     * El error solo afecta este registro.
     */
    return {
      available: false,
      name: "Próximo rival no disponible",
      flag: "",
      date: ""
    };
  }
}

/*
 * Genera la bandera o un respaldo visual.
 */
function createMuroFlagMarkup(
  flag,
  teamName
) {
  if (flag) {
    return `
      <img
        src="${flag}"
        alt="Bandera de ${teamName}"
        loading="lazy"
      >
    `;
  }

  return `
    <span
      class="muro-flag-placeholder"
      aria-label="Bandera no disponible"
    >
      ID
    </span>
  `;
}

/*
 * Crea una tarjeta del ranking.
 */
function createMuroCard(
  rankingItem,
  position
) {
  const team =
    getTeamById(
      rankingItem.teamId
    );

  const teamName =
    team?.name_en ??
    `Equipo ID ${rankingItem.teamId}`;

  const teamFlag =
    team?.flag ?? "";

  /*
   * Esta búsqueda está aislada por equipo.
   * Un error no evita generar las otras tarjetas.
   */
  const nextOpponent =
    getNextOpponentForTeam(
      rankingItem.teamId
    );

  const opponentFlagMarkup =
    nextOpponent.flag
      ? `
          <img
            src="${nextOpponent.flag}"
            alt="Bandera de ${nextOpponent.name}"
            loading="lazy"
          >
        `
      : `
          <span
            class="muro-rival-placeholder"
            aria-hidden="true"
          >
            VS
          </span>
        `;

  const card =
    document.createElement("article");

  card.className = "muro-card";

  if (position === 1) {
    card.classList.add("first-place");
  }

  card.innerHTML = `
    <div class="muro-position">
      <span>
        ${position}
      </span>
    </div>

    <div class="muro-team-main">

      <div class="muro-team-flag">
        ${createMuroFlagMarkup(
          teamFlag,
          teamName
        )}
      </div>

      <div class="muro-team-info">
        <span>
          Equipo
        </span>

        <h3>
          ${teamName}
        </h3>
      </div>

    </div>

    <div class="muro-stat">

      <span>
        Goles recibidos
      </span>

      <strong>
        ${rankingItem.goalsAgainst}
      </strong>

      <small>
        ${rankingItem.gamesPlayed}
        ${
          rankingItem.gamesPlayed === 1
            ? "partido"
            : "partidos"
        }
      </small>

    </div>

    <div class="muro-next-game">

      <span class="muro-next-label">
        Próximo rival
      </span>

      <div class="muro-rival">

        <div class="muro-rival-flag">
          ${opponentFlagMarkup}
        </div>

        <div>
          <strong class="${
            nextOpponent.available
              ? ""
              : "muro-rival-error"
          }">
            ${nextOpponent.name}
          </strong>

          ${
            nextOpponent.date
              ? `
                  <small>
                    ${nextOpponent.date}
                  </small>
                `
              : ""
          }
        </div>

      </div>

    </div>
  `;

  return card;
}

/*
 * Renderiza el ranking defensivo.
 */
function renderMuro() {
  if (
    !muroGrid ||
    !muroEmptyState
  ) {
    return;
  }

  muroGrid.innerHTML = "";

  muroCount.textContent = "0";
  muroTotal.textContent = "0";

  muroEyebrow.classList.remove(
    "visible"
  );

  muroStatus.hidden = true;

  if (!state.groupsLoaded) {
    muroEmptyState.style.display =
      "block";

    muroEmptyState.textContent =
      state.groupsError
        ? "No fue posible cargar los grupos."
        : "Cargando los grupos del Mundial...";

    return;
  }

  if (!state.gamesLoaded) {
    muroEmptyState.style.display =
      "block";

    muroEmptyState.textContent =
      state.gamesError
        ? "No fue posible cargar los partidos."
        : "Cargando los partidos del Mundial...";

    return;
  }

  const ranking =
    calculateMuroRanking();

  if (!state.teamsLoaded) {
    muroStatus.hidden = false;

    muroStatusMessage.textContent =
      "El ranking está disponible, pero los nombres y banderas de los equipos todavía no pudieron cargarse.";
  }

  muroTotal.textContent =
    String(ranking.length);

  muroCount.textContent =
    String(ranking.length);

  if (ranking.length === 0) {
    muroEmptyState.style.display =
      "block";

    muroEmptyState.textContent =
      "No fue posible construir el ranking defensivo.";

    return;
  }

  muroEmptyState.style.display =
    "none";

  muroEyebrow.classList.add(
    "visible"
  );

  ranking.forEach(
    (rankingItem, index) => {
      muroGrid.appendChild(
        createMuroCard(
          rankingItem,
          index + 1
        )
      );
    }
  );
}

/* ──────────────────────────────────────────────────────
   CARGAR GRUPOS
────────────────────────────────────────────────────── */

function loadGroups() {
  fetch(`${BASE}/get/groups`)
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Error HTTP ${response.status} al cargar grupos`
        );
      }

      return response.json();
    })
    .then(jsonData => {
      const receivedGroups =
        Array.isArray(jsonData.groups)
          ? jsonData.groups
          : Array.isArray(jsonData)
            ? jsonData
            : null;

      if (!receivedGroups) {
        throw new Error(
          "La API no devolvió una lista válida de grupos."
        );
      }

      state.groups =
        receivedGroups;

      state.groupsLoaded = true;
      state.groupsError = false;

      console.log(
        `${state.groups.length} grupos cargados correctamente.`
      );

      renderMuro();
    })
    .catch(error => {
      state.groups = [];
      state.groupsLoaded = false;
      state.groupsError = true;

      console.error(
        "Error al cargar grupos:",
        error
      );

      renderMuro();
    });
}

/* ──────────────────────────────────────────────────────
   CARGAR EQUIPOS
────────────────────────────────────────────────────── */
function loadTeams(
  isBackgroundRetry = false
) {
  if (teamsRequestInProgress) {
    return;
  }

  teamsRequestInProgress = true;

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
      if (
        !Array.isArray(
          jsonData.teams
        )
      ) {
        throw new Error(
          "La API no devolvió una lista válida de equipos."
        );
      }

      state.teams =
        jsonData.teams;

      state.teamsLoaded = true;
      state.teamsError = false;
      state.teamsRetryAttempt = 0;

      clearTeamsBackgroundRetry();

      saveToCache(
        CACHE_KEYS.teams,
        state.teams
      );

      markResourceAsFresh(
        "teams"
      );

      populateTeamSelector();
      renderGoleadas();
      renderMuro();

      console.log(
        `${state.teams.length} equipos cargados correctamente.`
      );
    })
    .catch(error => {
      console.error(
        "Error al cargar equipos:",
        error
      );

      const cachedTeams =
        getFromCache(
          CACHE_KEYS.teams
        );

      if (
        cachedTeams &&
        Array.isArray(
          cachedTeams.data
        )
      ) {
        state.teams =
          cachedTeams.data;

        state.teamsLoaded = true;
        state.teamsError = false;

        markResourceAsCached(
          "teams",
          cachedTeams.savedAt
        );

        populateTeamSelector();
        renderGoleadas();
        renderMuro();

        console.warn(
          "Se utilizaron equipos guardados en localStorage."
        );

        return;
      }

      state.teams = [];
      state.teamsLoaded = false;
      state.teamsError = true;

      teamSelect.innerHTML = `
        <option value="">
          Equipos temporalmente no disponibles
        </option>
      `;

      teamSelect.disabled = true;

      /*
       * La pantalla 2.2 no desaparece.
       * Se vuelve a dibujar utilizando IDs.
       */
      renderGoleadas();
      renderMuro();
      scheduleTeamsBackgroundRetry();
    })
    .finally(() => {
      teamsRequestInProgress = false;

      if (
        isBackgroundRetry &&
        state.teamsLoaded
      ) {
        console.log(
          "/get/teams se recuperó en segundo plano."
        );
      }
    });
}

/* ──────────────────────────────────────────────────────
   CANCELAR REINTENTO PENDIENTE DE EQUIPOS
────────────────────────────────────────────────────── */
function clearTeamsBackgroundRetry() {
  if (teamsBackgroundRetryTimer) {
    clearTimeout(
      teamsBackgroundRetryTimer
    );

    teamsBackgroundRetryTimer = null;
  }
}

/* ──────────────────────────────────────────────────────
   PROGRAMAR REINTENTO DE EQUIPOS EN SEGUNDO PLANO
────────────────────────────────────────────────────── */
function scheduleTeamsBackgroundRetry() {
  if (
    state.teamsRetryAttempt >=
    TEAM_BACKGROUND_RETRY_DELAYS.length
  ) {
    if (goleadasTeamsWarningMessage) {
      goleadasTeamsWarningMessage.textContent =
        "No fue posible recuperar los nombres y banderas. Las goleadas continúan visibles utilizando los identificadores de los equipos.";
    }

    return;
  }

  const delay =
    TEAM_BACKGROUND_RETRY_DELAYS[
      state.teamsRetryAttempt
    ];

  state.teamsRetryAttempt += 1;

  console.warn(
    "Nuevo intento de /get/teams en " +
    `${delay / 1000} segundos.`
  );

  if (goleadasTeamsWarningMessage) {
    goleadasTeamsWarningMessage.textContent =
      "Las goleadas permanecen visibles usando identificadores. " +
      `/get/teams se reintentará en ${delay / 1000} segundos.`;
  }

  clearTeamsBackgroundRetry();

  teamsBackgroundRetryTimer =
    setTimeout(() => {
      loadTeams(true);
    }, delay);
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
      if (
        !Array.isArray(
          jsonData.games
        )
      ) {
        throw new Error(
          "La API no devolvió una lista válida de partidos."
        );
      }

      state.games =
        jsonData.games;

      state.gamesLoaded = true;
      state.gamesError = false;

      saveToCache(
        CACHE_KEYS.games,
        state.games
      );

      markResourceAsFresh(
        "games"
      );

      console.log(
        `${state.games.length} partidos cargados correctamente.`
      );

      if (state.selectedTeam) {
        updateSelectedTeamGames();
        renderStadiumsSection();
        renderSummarySection();
      }

      renderGoleadas();
      renderMuro();
    })
    .catch(error => {
      console.error(
        "Error al cargar partidos desde la API:",
        error
      );

      const cachedGames =
        getFromCache(
          CACHE_KEYS.games
        );

      if (
        cachedGames &&
        Array.isArray(
          cachedGames.data
        )
      ) {
        state.games =
          cachedGames.data;

        state.gamesLoaded = true;
        state.gamesError = false;

        markResourceAsCached(
          "games",
          cachedGames.savedAt
        );

        console.warn(
          "Se utilizaron partidos guardados en localStorage."
        );

        if (state.selectedTeam) {
          updateSelectedTeamGames();
          renderStadiumsSection();
          renderSummarySection();
        }

        renderGoleadas();
        renderMuro();
        return;
      }

      state.games = [];
      state.gamesLoaded = false;
      state.gamesError = true;

      gamesEmptyState.style.display =
        "block";

      gamesEmptyState.textContent =
        "No fue posible cargar los partidos y no existen datos guardados.";

      renderGoleadas();
      renderMuro();
    });
}

/* ──────────────────────────────────────────────────────
   CARGAR ESTADIOS
────────────────────────────────────────────────────── */
function loadStadiums() {
  if (state.stadiumsLoading) {
    return;
  }

  state.stadiumsLoading = true;
  state.stadiumsError = false;

  hideStadiumAlert();

  if (retryStadiumsButton) {
    retryStadiumsButton.disabled =
      true;
  }

  fetchJsonWithRetry(
    "/get/stadiums",
    "estadios"
  )
    .then(jsonData => {
      if (
        !Array.isArray(
          jsonData.stadiums
        )
      ) {
        throw new Error(
          "La API no devolvió una lista válida de estadios."
        );
      }

      state.stadiums =
        jsonData.stadiums;

      state.stadiumsLoaded =
        true;

      state.stadiumsError =
        false;

      saveToCache(
        CACHE_KEYS.stadiums,
        state.stadiums
      );

      markResourceAsFresh(
        "stadiums"
      );

      hideResilienceBanner();
      hideStadiumAlert();

      console.log(
        `${state.stadiums.length} estadios cargados correctamente.`
      );

      if (state.selectedTeam) {
        renderGames();
        renderStadiumsSection();
        renderSummarySection();
      }
    })
    .catch(error => {
      console.error(
        "Error al cargar estadios desde la API:",
        error
      );

      const cachedStadiums =
        getFromCache(
          CACHE_KEYS.stadiums
        );

      if (cachedStadiums) {
        state.stadiums =
          cachedStadiums.data;

        state.stadiumsLoaded =
          true;

        state.stadiumsError =
          false;

        markResourceAsCached(
          "stadiums",
          cachedStadiums.savedAt
        );

        hideResilienceBanner();
        hideStadiumAlert();

        console.warn(
          "Se utilizaron estadios guardados en localStorage."
        );

        if (state.selectedTeam) {
          renderGames();
          renderStadiumsSection();
          renderSummarySection();
        }

        return;
      }

      state.stadiums = [];

      state.stadiumsLoaded =
        false;

      state.stadiumsError =
        true;

      showResilienceBanner(
        "No se pudieron cargar los estadios",
        "Se agotaron los reintentos y no existen datos guardados."
      );

      showStadiumAlert(
        "Los partidos permanecen visibles. " +
        "Puede reintentar únicamente la carga de estadios."
      );

      if (state.selectedTeam) {
        renderGames();
        renderStadiumsSection();
        renderSummarySection();
      }
    })
    .finally(() => {
      state.stadiumsLoading =
        false;

      if (retryStadiumsButton) {
        retryStadiumsButton.disabled =
          false;
      }
    });
}

/* ──────────────────────────────────────────────────────
   INICIALIZACIÓN
────────────────────────────────────────────────────── */
function init() {
  configureScreenNavigation();
  configureInternalNavigation();
  addEventToTeamSelect();
  clearSelectedTeam();

  showScreen(
    "ruta",
    false
  );

  loadTeams();
  loadGames();
  loadGroups();
  loadStadiums();

  setApiStatus(
    "API worldcup26.ir"
  );
}

/* Punto de entrada */
init();