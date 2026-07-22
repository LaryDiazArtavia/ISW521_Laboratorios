"use strict";

/* =====================================================
   CONFIGURACIÓN
===================================================== */
const BASE = "https://worldcup26.ir";
const TEST_HTTP_STATUS = null; // 2.1: null, 429 o 500
const TEST_ANALITICA_GAMES_STATUS = null; // 2.4: null, 429 o 500
const TEST_EMPATES_GAMES_STATUS = null; // 2.5: null o 429
const RETRIES = [1000, 2000, 4000, 8000];
const TEAM_RETRIES = [2000, 4000, 8000, 16000];
const GROUPS = [..."ABCDEFGHIJKL"];

const CACHE = {
    teams: "worldcup26_teams",
    games: "worldcup26_games",
    stadiums: "worldcup26_stadiums"
};

/* =====================================================
   ESTADO Y DOM
===================================================== */
const state = {
    teams: [],
    games: [],
    stadiums: [],
    groups: [],
    selectedTeam: null,
    selectedGames: [],

    loaded: {
        teams: false,
        games: false,
        stadiums: false,
        groups: false
    },

    error: {
        teams: false,
        games: false,
        stadiums: false,
        groups: false
    },

    stadiumsLoading: false,
    teamsRetryAttempt: 0,

    analitica: {
        games: [],
        loaded: false,
        error: false,
        loading: false
    },

    empates: {
        games: [],
        loaded: false,
        error: false,
        loading: false,
        completed: false
    },

    cacheSources: {
        teams: null,
        games: null,
        stadiums: null
    }
};

const $ = id => document.getElementById(id);

const setText = (element, value) => {
    if (element) element.textContent = value;
};

const show = (element, value = "block") => {
    if (element) element.style.display = value;
};

const hide = element => {
    if (element) element.style.display = "none";
};

const dom = {
    nav: document.querySelectorAll("[data-screen]"),
    panels: document.querySelectorAll("[data-screen-panel]"),
    apiStatus: $("apiStatus"),

    resilience: {
        box: $("resilienceBanner"),
        title: $("resilienceTitle"),
        message: $("resilienceMessage")
    },

    offline: {
        box: $("offlineBanner"),
        message: $("offlineMessage")
    },

    ruta: {
        selection: $("teamSelectionSection"),
        select: $("teamSelect"),
        info: $("teamInfo"),
        flag: $("teamFlagImg"),
        name: $("teamName"),
        start: $("startButton"),
        cards: $("cardsGrid"),
        gamesEmpty: $("gamesEmptyState"),
        eyebrow: $("sectionEyebrow"),
        eyebrowCount: $("eyebrowCount"),
        citiesSection: $("citiesSection"),
        cities: $("citiesChips"),
        stadiums: $("stadiumsGrid"),
        stadiumsEmpty: $("stadiumsEmptyState"),
        alert: $("alertBanner"),
        alertMessage: $("alertMsg"),
        retryStadiums: $("retryStadiumsButton"),
        stats: $("statsBar"),
        summaryEmpty: $("summaryEmptyState"),
        statGames: $("statGames"),
        statCities: $("statCities"),
        statHome: $("statHome"),
        statAway: $("statAway"),
        statStadiums: $("statStadiums"),
        statCapacity: $("statCapacity")
    },

    goleadas: {
        total: $("goleadasTotal"),
        warning: $("goleadasTeamsWarning"),
        warningMessage: $("goleadasTeamsWarningMessage"),
        empty: $("goleadasEmptyState"),
        eyebrow: $("goleadasEyebrow"),
        count: $("goleadasCount"),
        grid: $("goleadasGrid")
    },

    muro: {
        total: $("muroTotal"),
        status: $("muroStatus"),
        statusMessage: $("muroStatusMessage"),
        empty: $("muroEmptyState"),
        eyebrow: $("muroEyebrow"),
        count: $("muroCount"),
        grid: $("muroGrid")
    },

    analitica: {
        total: $("analiticaTotal"),
        stadiums: $("analiticaStatStadiums"),
        games: $("analiticaStatGames"),
        potential: $("analiticaStatPotential"),
        waiting: $("analiticaWaiting"),
        waitingTitle: $("analiticaWaitingTitle"),
        waitingMessage: $("analiticaWaitingMessage"),
        empty: $("analiticaEmptyState"),
        chart: $("analiticaChart"),
        ranking: $("analiticaRanking")
    },

    empates: {
        total: $("empatesTotal"),
        statTotal: $("empatesStatTotal"),
        statGroups: $("empatesStatGroups"),
        statTop: $("empatesStatTopGroup"),
        retry: $("empatesRetryBanner"),
        retryTitle: $("empatesRetryTitle"),
        retryMessage: $("empatesRetryMessage"),
        countdown: $("empatesCountdown"),
        empty: $("empatesEmptyState"),
        matrix: $("empatesMatrix")
    }
};

let teamsRetryTimer = null;
let teamsRequestInProgress = false;

/* =====================================================
   HTTP, BACKOFF Y CACHÉ
===================================================== */

/* Simula errores sin servidor mock. */
function fetchWithTestStatus(url, status = null) {
    if (![429, 500].includes(status)) {
        return fetch(url);
    }

    return Promise.resolve(
        new Response(
            JSON.stringify({
                simulated: true,
                status
            }),
            {
                status,
                statusText:
                    status === 429
                        ? "Too Many Requests"
                        : "Internal Server Error",
                headers: {
                    "Content-Type": "application/json"
                }
            }
        )
    );
}

/* Countdown antes del próximo intento. */
function waitCountdown(milliseconds, onTick) {
    let seconds = Math.ceil(milliseconds / 1000);
    onTick?.(seconds, false);

    return new Promise(resolve => {
        const timer = setInterval(() => {
            seconds -= 1;

            if (seconds <= 0) {
                clearInterval(timer);
                onTick?.(0, true);
                resolve();
            } else {
                onTick?.(seconds, false);
            }
        }, 1000);
    });
}

/* Petición reutilizable con backoff exponencial. */
function fetchJsonWithBackoff(options, attempt = 0) {
    const {
        url,
        label,
        testStatus = null,
        retryStatuses = [429, 500],
        delays = RETRIES,
        onRetry
    } = options;

    return fetchWithTestStatus(url, testStatus)
        .then(response => {
            if (response.ok) {
                return response.json();
            }

            if (!retryStatuses.includes(response.status)) {
                throw new Error(
                    `Error HTTP ${response.status} en ${label}`
                );
            }

            if (attempt >= delays.length) {
                throw new Error(
                    `Se agotaron los reintentos para ${label}. ` +
                    `Último estado: ${response.status}`
                );
            }

            const delay = delays[attempt];

            console.warn(
                `${label}: HTTP ${response.status}. ` +
                `Reintento ${attempt + 1} en ${delay / 1000}s.`
            );

            return waitCountdown(delay, (seconds, retrying) => {
                onRetry?.({
                    status: response.status,
                    seconds,
                    retrying
                });
            }).then(() => {
                return fetchJsonWithBackoff(options, attempt + 1);
            });
        });
}

function saveCache(key, data) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify({
                savedAt: new Date().toISOString(),
                data
            })
        );
    } catch (error) {
        console.warn(`No se pudo guardar ${key}:`, error);
    }
}

function readCache(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key));

        return (
            parsed &&
            Array.isArray(parsed.data) &&
            parsed.savedAt
                ? parsed
                : null
        );
    } catch (error) {
        console.warn(`No se pudo leer ${key}:`, error);
        return null;
    }
}

function formatCacheDate(value) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? "fecha desconocida"
        : new Intl.DateTimeFormat("es-CR", {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
}

function markCache(resource, savedAt = null) {
    state.cacheSources[resource] = savedAt;

    const labels = {
        teams: "equipos",
        games: "partidos",
        stadiums: "estadios"
    };

    const cached = Object
        .entries(state.cacheSources)
        .filter(([, date]) => date)
        .map(([name, date]) => {
            return `${labels[name]} (${formatCacheDate(date)})`;
        });

    if (!dom.offline.box) return;

    dom.offline.box.hidden = cached.length === 0;

    if (cached.length) {
        setText(
            dom.offline.message,
            `Datos no actualizados: ${cached.join(", ")}.`
        );
    }
}

function showResilience(title, message) {
    setText(dom.resilience.title, title);
    setText(dom.resilience.message, message);

    if (dom.resilience.box) {
        dom.resilience.box.hidden = false;
    }
}

function hideResilience() {
    if (dom.resilience.box) {
        dom.resilience.box.hidden = true;
    }
}

function showStadiumAlert(message) {
    setText(dom.ruta.alertMessage, message);

    if (dom.ruta.alert) {
        dom.ruta.alert.hidden = false;
    }
}

function hideStadiumAlert() {
    if (dom.ruta.alert) {
        dom.ruta.alert.hidden = true;
    }
}

/* =====================================================
   UTILIDADES DE DATOS
===================================================== */
const getTeamById = id => {
    return state.teams.find(
        team => String(team.id) === String(id)
    );
};

const getStadiumById = id => {
    return state.stadiums.find(
        stadium => String(stadium.id) === String(id)
    );
};

function getTeamData(id, fallbackName, showId = false) {
    const team = getTeamById(id);

    return {
        id,
        name:
            team?.name_en ??
            (
                showId &&
                !state.loaded.teams
                    ? `Equipo ID ${id}`
                    : fallbackName
            ) ??
            `Equipo ${id}`,
        flag: team?.flag ?? ""
    };
}

function flagMarkup(team, placeholderClass) {
    return team.flag
        ? `
        <img
          src="${team.flag}"
          alt="Bandera de ${team.name}"
          loading="lazy"
        >
      `
        : `
        <span
          class="${placeholderClass}"
          aria-label="Bandera no disponible"
        >
          ID
        </span>
      `;
}

function parseLocalDate(value) {
    if (!value || typeof value !== "string") {
        return new Date(NaN);
    }

    const [datePart, timePart = "00:00"] =
        value.trim().split(" ");

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

function formatLocalDate(value) {
    const date = parseLocalDate(value);

    return Number.isNaN(date.getTime())
        ? value || "Fecha no disponible"
        : new Intl.DateTimeFormat("es-CR", {
            dateStyle: "long",
            timeStyle: "short"
        }).format(date);
}

function isFinishedGame(game) {
    return (
        game.finished === true ||
        ["TRUE", "FINISHED"].includes(
            String(game.finished ?? "")
                .trim()
                .toUpperCase()
        )
    );
}

function parseScore(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function getMatchPhase(game) {
    const code = String(game.group ?? "")
        .trim()
        .toUpperCase();

    if (/^[A-L]$/.test(code)) {
        return {
            text: `Grupo ${code}`,
            showMatchday: true
        };
    }

    const phases = {
        R32: "Ronda de 32",
        R16: "Octavos de final",
        QF: "Cuartos de final",
        SF: "Semifinal",
        F: "Final",
        FINAL: "Final"
    };

    return {
        text: phases[code] ?? "Fase eliminatoria",
        showMatchday: false
    };
}

/* =====================================================
   NAVEGACIÓN
===================================================== */
function showScreen(name, moveToTop = true) {
    dom.panels.forEach(panel => {
        const active =
            panel.dataset.screenPanel === name;

        panel.hidden = !active;
        panel.classList.toggle("active", active);
    });

    dom.nav.forEach(button => {
        const active =
            button.dataset.screen === name;

        button.classList.toggle("active", active);

        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    if (name === "goleadas") {
        renderGoleadas();
    }

    if (name === "muro") {
        renderMuro();
    }

    if (name === "analitica") {
        renderAnalitica();

        if (
            !state.analitica.loaded &&
            !state.analitica.loading
        ) {
            loadAnaliticaGames();
        }
    }

    if (name === "empates") {
        syncEmpatesFromGames();
        renderEmpates();

        if (
            !state.empates.completed &&
            !state.empates.loading
        ) {
            loadEmpatesGames();
        }
    }

    if (moveToTop) {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

function configureNavigation() {
    dom.nav.forEach(button => {
        button.addEventListener("click", () => {
            if (!button.disabled) {
                showScreen(button.dataset.screen);
            }
        });
    });

    dom.ruta.start?.addEventListener("click", () => {
        dom.ruta.selection?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        setTimeout(() => {
            dom.ruta.select?.focus();
        }, 500);
    });

    dom.ruta.retryStadiums?.addEventListener(
        "click",
        loadStadiums
    );

    dom.ruta.select?.addEventListener(
        "change",
        selectTeam
    );
}

/* =====================================================
   2.1 LA RUTA DEL CAMPEÓN
===================================================== */

/* Llena el selector con los equipos de la API. */
function populateTeamSelector() {
    const teams = [...state.teams].sort(
        (a, b) =>
            (a.name_en ?? "").localeCompare(
                b.name_en ?? ""
            )
    );

    dom.ruta.select.innerHTML = `
    <option value="">
      — Selecciona un equipo (${teams.length}) —
    </option>
    ${teams.map(team => `
      <option value="${team.id}">
        ${team.name_en ?? `Equipo ${team.id}`}
      </option>
    `).join("")}
  `;

    dom.ruta.select.disabled = false;
}

/* Restablece la pantalla cuando no hay equipo seleccionado. */
function clearSelectedTeam() {
    state.selectedTeam = null;
    state.selectedGames = [];

    hide(dom.ruta.info);

    if (dom.ruta.flag) {
        dom.ruta.flag.src = "";
        dom.ruta.flag.alt = "";
    }

    setText(dom.ruta.name, "—");
    setText(dom.ruta.eyebrowCount, "0");

    dom.ruta.cards.innerHTML = "";
    dom.ruta.stadiums.innerHTML = "";
    dom.ruta.cities.innerHTML = "";

    dom.ruta.eyebrow.classList.remove("visible");

    show(dom.ruta.gamesEmpty);
    setText(
        dom.ruta.gamesEmpty,
        "Seleccione un equipo para consultar su itinerario."
    );

    hide(dom.ruta.citiesSection);

    show(dom.ruta.stadiumsEmpty);
    setText(
        dom.ruta.stadiumsEmpty,
        "Seleccione un equipo para consultar las ciudades y estadios."
    );

    hideStadiumAlert();

    hide(dom.ruta.stats);

    show(dom.ruta.summaryEmpty);
    setText(
        dom.ruta.summaryEmpty,
        "Seleccione un equipo para generar el resumen."
    );

    [
        dom.ruta.statGames,
        dom.ruta.statCities,
        dom.ruta.statHome,
        dom.ruta.statAway,
        dom.ruta.statStadiums,
        dom.ruta.statCapacity
    ].forEach(element => setText(element, "—"));
}

/* Se ejecuta cuando cambia el selector. */
function selectTeam() {
    const team =
        getTeamById(dom.ruta.select.value);

    if (!team) {
        clearSelectedTeam();
        return;
    }

    state.selectedTeam = team;

    if (dom.ruta.flag) {
        dom.ruta.flag.src = team.flag ?? "";
        dom.ruta.flag.alt =
            `Bandera de ${
                team.name_en ??
                `Equipo ${team.id}`
            }`;
    }

    setText(
        dom.ruta.name,
        team.name_en ?? `Equipo ${team.id}`
    );

    show(dom.ruta.info, "flex");
    updateSelectedTeamGames();
}

/* Filtra y ordena los partidos del equipo. */
function updateSelectedTeamGames() {
    if (!state.selectedTeam) return;

    if (!state.loaded.games) {
        show(dom.ruta.gamesEmpty);

        setText(
            dom.ruta.gamesEmpty,
            "Los partidos todavía se están cargando."
        );

        return;
    }

    const teamId =
        String(state.selectedTeam.id);

    state.selectedGames = state.games
        .filter(game =>
            String(game.home_team_id) === teamId ||
            String(game.away_team_id) === teamId
        )
        .sort((a, b) =>
            parseLocalDate(a.local_date) -
            parseLocalDate(b.local_date)
        );

    renderGames();
    renderStadiumsSection();
    renderSummarySection();
}

/* Genera una tarjeta de partido. */
function createMatchCard(game) {
    const selectedId =
        String(state.selectedTeam.id);

    const isHome =
        String(game.home_team_id) === selectedId;

    const opponentId = isHome
        ? game.away_team_id
        : game.home_team_id;

    const opponent = getTeamData(
        opponentId,
        isHome
            ? game.away_team_name_en
            : game.home_team_name_en
    );

    const phase = getMatchPhase(game);

    const matchday =
        phase.showMatchday && game.matchday
            ? ` · Jornada ${game.matchday}`
            : "";

    const stadium =
        getStadiumById(game.stadium_id);

    let stadiumName = "Pendiente de cargar";

    let stadiumDetails =
        `Identificador del estadio: ${
            game.stadium_id ?? "No disponible"
        }`;

    if (state.error.stadiums) {
        stadiumName = "Estadio no disponible";
        stadiumDetails =
            "La información de estadios no pudo cargarse.";
    } else if (
        state.loaded.stadiums &&
        stadium
    ) {
        stadiumName =
            stadium.name_en ??
            stadium.fifa_name ??
            "Nombre no disponible";

        stadiumDetails =
            `${stadium.city_en ?? "Ciudad no disponible"}, ` +
            `${stadium.country_en ?? "País no disponible"} · ` +
            `Capacidad: ${
                Number(
                    stadium.capacity || 0
                ).toLocaleString("es-CR")
            }`;
    } else if (state.loaded.stadiums) {
        stadiumName = "Estadio no encontrado";
        stadiumDetails =
            `No existe información para el estadio ${game.stadium_id}.`;
    }

    return `
    <article class="match-card ${isHome ? "home" : "away"}">
      <div class="card-stripe"></div>

      <div class="card-header">
        <div class="card-matchup">
          <p class="card-round">
            ${phase.text}${matchday}
          </p>

          <h3 class="card-teams">
            <span class="team-highlight">
              ${
                  state.selectedTeam.name_en ??
                  `Equipo ${state.selectedTeam.id}`
              }
            </span>
            vs ${opponent.name}
          </h3>
        </div>

        <span class="card-role-badge ${
            isHome ? "role-home" : "role-away"
        }">
          ${isHome ? "Local" : "Visitante"}
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
              ${stadiumDetails}
            </p>
          </div>
        </div>
      </div>
    </article>
  `;
}

/* Muestra los partidos del equipo seleccionado. */
function renderGames() {
    dom.ruta.cards.innerHTML = "";

    setText(
        dom.ruta.eyebrowCount,
        state.selectedGames.length
    );

    if (!state.selectedGames.length) {
        dom.ruta.eyebrow.classList.remove(
            "visible"
        );

        show(dom.ruta.gamesEmpty);

        setText(
            dom.ruta.gamesEmpty,
            "No se encontraron partidos para el equipo seleccionado."
        );

        return;
    }

    hide(dom.ruta.gamesEmpty);

    dom.ruta.eyebrow.classList.add(
        "visible"
    );

    dom.ruta.cards.innerHTML =
        state.selectedGames
            .map(createMatchCard)
            .join("");
}

/* Genera una tarjeta de estadio. */
function createStadiumCard(
    stadium,
    gamesCount
) {
    return `
    <article class="stadium-card">
      <div class="stadium-card-header">
        <span
          class="stadium-card-icon"
          aria-hidden="true"
        >
          🏟️
        </span>

        <div>
          <h3>
            ${
                stadium.name_en ??
                stadium.fifa_name ??
                "Estadio sin nombre"
            }
          </h3>

          <p>
            ${stadium.city_en ?? "Ciudad no disponible"},
            ${stadium.country_en ?? "País no disponible"}
          </p>
        </div>
      </div>

      <div class="stadium-card-data">
        <div>
          <span class="stadium-data-label">
            Capacidad
          </span>

          <strong>
            ${
                Number(
                    stadium.capacity || 0
                ).toLocaleString("es-CR")
            }
          </strong>
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
    </article>
  `;
}

/* Muestra las ciudades y estadios del recorrido. */
function renderStadiumsSection() {
    dom.ruta.stadiums.innerHTML = "";
    dom.ruta.cities.innerHTML = "";

    hide(dom.ruta.citiesSection);
    hideStadiumAlert();

    if (!state.selectedTeam) return;

    if (!state.loaded.games) {
        show(dom.ruta.stadiumsEmpty);

        setText(
            dom.ruta.stadiumsEmpty,
            "Los partidos todavía se están cargando."
        );

        return;
    }

    if (state.error.stadiums) {
        show(dom.ruta.stadiumsEmpty);

        setText(
            dom.ruta.stadiumsEmpty,
            "Los partidos están disponibles, pero no fue posible cargar los estadios."
        );

        showStadiumAlert(
            "La petición a /get/stadiums falló. " +
            "Los partidos permanecen disponibles y puede reintentar solo los estadios."
        );

        return;
    }

    if (!state.loaded.stadiums) {
        show(dom.ruta.stadiumsEmpty);

        setText(
            dom.ruta.stadiumsEmpty,
            "La información de estadios todavía se está cargando."
        );

        return;
    }

    const counts = new Map();

    state.selectedGames.forEach(game => {
        const id = String(game.stadium_id);

        counts.set(
            id,
            (counts.get(id) ?? 0) + 1
        );
    });

    const items = [...counts.entries()]
        .map(([id, gamesCount]) => ({
            stadium: getStadiumById(id),
            gamesCount
        }))
        .filter(item => item.stadium)
        .sort((a, b) =>
            (a.stadium.city_en ?? "").localeCompare(
                b.stadium.city_en ?? ""
            )
        );

    if (!items.length) {
        show(dom.ruta.stadiumsEmpty);

        setText(
            dom.ruta.stadiumsEmpty,
            "No se encontraron estadios para el equipo seleccionado."
        );

        return;
    }

    hide(dom.ruta.stadiumsEmpty);
    show(dom.ruta.citiesSection);

    const cities = [
        ...new Set(
            items.map(item =>
                item.stadium.city_en ??
                "Ciudad no disponible"
            )
        )
    ];

    dom.ruta.cities.innerHTML =
        cities
            .map(city => `
      <span class="city-chip">
        ${city}
      </span>
    `)
            .join("");

    dom.ruta.stadiums.innerHTML =
        items
            .map(item =>
                createStadiumCard(
                    item.stadium,
                    item.gamesCount
                )
            )
            .join("");
}

/* Calcula y muestra el resumen del recorrido. */
function renderSummarySection() {
    if (
        !state.selectedTeam ||
        !state.loaded.games
    ) {
        return;
    }

    const teamId =
        String(state.selectedTeam.id);

    const homeGames =
        state.selectedGames
            .filter(game =>
                String(game.home_team_id) === teamId
            )
            .length;

    const awayGames =
        state.selectedGames.length -
        homeGames;

    setText(
        dom.ruta.statGames,
        state.selectedGames.length
    );

    setText(
        dom.ruta.statHome,
        homeGames
    );

    setText(
        dom.ruta.statAway,
        awayGames
    );

    if (
        !state.loaded.stadiums ||
        state.error.stadiums
    ) {
        [
            dom.ruta.statCities,
            dom.ruta.statStadiums,
            dom.ruta.statCapacity
        ].forEach(element =>
            setText(element, "—")
        );
    } else {
        const stadiumMap = new Map();

        state.selectedGames.forEach(game => {
            const stadium =
                getStadiumById(game.stadium_id);

            if (stadium) {
                stadiumMap.set(
                    String(stadium.id),
                    stadium
                );
            }
        });

        const stadiums = [
            ...stadiumMap.values()
        ];

        const cities = new Set(
            stadiums.map(stadium =>
                stadium.city_en ??
                "Ciudad no disponible"
            )
        );

        const averageCapacity =
            stadiums.length
                ? Math.round(
                    stadiums.reduce(
                        (total, stadium) =>
                            total +
                            Number(
                                stadium.capacity || 0
                            ),
                        0
                    ) / stadiums.length
                )
                : 0;

        setText(
            dom.ruta.statCities,
            cities.size
        );

        setText(
            dom.ruta.statStadiums,
            stadiums.length
        );

        setText(
            dom.ruta.statCapacity,
            averageCapacity.toLocaleString(
                "es-CR"
            )
        );
    }

    show(dom.ruta.stats, "grid");
    hide(dom.ruta.summaryEmpty);
}

/* =====================================================
   2.2 RASTREADOR DE GOLEADAS
===================================================== */

/* Partidos terminados con diferencia de 3 o más goles. */
function calculateGoleadas() {
    return state.games
        .filter(isFinishedGame)
        .map(game => {
            const homeScore =
                parseScore(game.home_score);

            const awayScore =
                parseScore(game.away_score);

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
                difference:
                    Math.abs(
                        homeScore - awayScore
                    )
            };
        })
        .filter(result =>
            result &&
            result.difference >= 3
        )
        .sort((a, b) =>
            b.difference -
            a.difference ||
            Number(a.game.id || 0) -
            Number(b.game.id || 0)
        );
}

/* Genera una tarjeta de goleada. */
function createGoleadaCard(result) {
    const {
        game,
        homeScore,
        awayScore,
        difference
    } = result;

    const homeTeam = getTeamData(
        game.home_team_id,
        game.home_team_name_en,
        true
    );

    const awayTeam = getTeamData(
        game.away_team_id,
        game.away_team_name_en,
        true
    );

    const phase = getMatchPhase(game);

    return `
    <article class="goleada-card">
      <div class="goleada-card-top">
        <div>
          <span class="goleada-phase">
            ${phase.text}
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
            homeScore > awayScore
                ? "winner"
                : ""
        }">
          <div class="goleada-flag">
            ${
                flagMarkup(
                    homeTeam,
                    "goleada-flag-placeholder"
                )
            }
          </div>

          <span class="goleada-team-role">
            Local
          </span>

          <strong>
            ${homeTeam.name}
          </strong>
        </div>

        <div class="goleada-score">
          <span>${homeScore}</span>
          <small>—</small>
          <span>${awayScore}</span>
        </div>

        <div class="goleada-team ${
            awayScore > homeScore
                ? "winner"
                : ""
        }">
          <div class="goleada-flag">
            ${
                flagMarkup(
                    awayTeam,
                    "goleada-flag-placeholder"
                )
            }
          </div>

          <span class="goleada-team-role">
            Visitante
          </span>

          <strong>
            ${awayTeam.name}
          </strong>
        </div>
      </div>
    </article>
  `;
}

/* Renderiza todas las goleadas. */
function renderGoleadas() {
    if (!dom.goleadas.grid) return;

    dom.goleadas.grid.innerHTML = "";

    setText(dom.goleadas.total, "0");
    setText(dom.goleadas.count, "0");

    dom.goleadas.eyebrow.classList.remove(
        "visible"
    );

    if (!state.loaded.games) {
        show(dom.goleadas.empty);

        setText(
            dom.goleadas.empty,
            state.error.games
                ? "No fue posible cargar los partidos."
                : "Cargando los partidos terminados..."
        );

        return;
    }

    const results = calculateGoleadas();

    dom.goleadas.warning.hidden =
        state.loaded.teams;

    if (!state.loaded.teams) {
        setText(
            dom.goleadas.warningMessage,
            "Las goleadas permanecen visibles usando IDs. " +
            "/get/teams se reintentará automáticamente."
        );
    }

    setText(
        dom.goleadas.total,
        results.length
    );

    setText(
        dom.goleadas.count,
        results.length
    );

    if (!results.length) {
        show(dom.goleadas.empty);

        setText(
            dom.goleadas.empty,
            "No se encontraron partidos terminados con diferencia de tres o más goles."
        );

        return;
    }

    hide(dom.goleadas.empty);

    dom.goleadas.eyebrow.classList.add(
        "visible"
    );

    dom.goleadas.grid.innerHTML =
        results
            .map(createGoleadaCard)
            .join("");
}

/* =====================================================
   2.3 EL MURO
===================================================== */

/* Obtiene los IDs de los equipos presentes en los grupos. */
function getGroupTeamIds() {
    const ids = new Set();

    state.groups.forEach(group => {
        (group.teams ?? []).forEach(item => {
            const id =
                String(item.team_id ?? "").trim();

            if (id && id !== "0") {
                ids.add(id);
            }
        });
    });

    return [...ids];
}

/* Calcula los cinco equipos con menos goles recibidos. */
function calculateMuroRanking() {
    const records = new Map(
        getGroupTeamIds().map(id => [
            id,
            {
                teamId: id,
                goalsAgainst: 0,
                gamesPlayed: 0
            }
        ])
    );

    state.games
        .filter(isFinishedGame)
        .forEach(game => {
            const homeId =
                String(game.home_team_id ?? "");

            const awayId =
                String(game.away_team_id ?? "");

            const homeScore =
                parseScore(game.home_score);

            const awayScore =
                parseScore(game.away_score);

            if (
                homeScore === null ||
                awayScore === null
            ) {
                return;
            }

            const homeRecord =
                records.get(homeId);

            const awayRecord =
                records.get(awayId);

            if (homeRecord) {
                homeRecord.goalsAgainst += awayScore;
                homeRecord.gamesPlayed += 1;
            }

            if (awayRecord) {
                awayRecord.goalsAgainst += homeScore;
                awayRecord.gamesPlayed += 1;
            }
        });

    return [...records.values()]
        .sort((a, b) =>
            a.goalsAgainst -
            b.goalsAgainst ||
            Number(a.teamId) -
            Number(b.teamId)
        )
        .slice(0, 5);
}

/* Busca el siguiente partido no finalizado del equipo. */
function findNextGame(teamId) {
    const id = String(teamId);

    return state.games
        .filter(game => {
            const participates =
                String(game.home_team_id) === id ||
                String(game.away_team_id) === id;

            return (
                !isFinishedGame(game) &&
                participates
            );
        })
        .sort((a, b) =>
            parseLocalDate(a.local_date) -
            parseLocalDate(b.local_date)
        )[0] ?? null;
}

/*
 * Resuelve el próximo rival.
 * Un fallo afecta solamente a esa tarjeta.
 */
function getNextOpponent(teamId) {
    try {
        const game =
            findNextGame(teamId);

        if (!game) {
            return {
                available: true,
                name: "Sin próximo partido",
                flag: "",
                date: ""
            };
        }

        const isHome =
            String(game.home_team_id) ===
            String(teamId);

        const opponentId = isHome
            ? game.away_team_id
            : game.home_team_id;

        const pendingLabel = isHome
            ? game.away_team_label
            : game.home_team_label;

        const fallbackName = isHome
            ? game.away_team_name_en
            : game.home_team_name_en;

        if (
            !opponentId ||
            String(opponentId) === "0"
        ) {
            if (!pendingLabel) {
                throw new Error(
                    "El rival aún no está definido."
                );
            }

            return {
                available: true,
                name: pendingLabel,
                flag: "",
                date:
                    formatLocalDate(
                        game.local_date
                    )
            };
        }

        const opponent = getTeamData(
            opponentId,
            fallbackName
        );

        return {
            available: true,
            ...opponent,
            date:
                formatLocalDate(
                    game.local_date
                )
        };
    } catch (error) {
        console.error(
            `Error al buscar el rival del equipo ${teamId}:`,
            error
        );

        return {
            available: false,
            name: "Próximo rival no disponible",
            flag: "",
            date: ""
        };
    }
}

/* Genera una tarjeta del ranking defensivo. */
function createMuroCard(item, position) {
    const team = getTeamData(
        item.teamId,
        null,
        true
    );

    const opponent =
        getNextOpponent(item.teamId);

    const opponentFlag = opponent.flag
        ? `
        <img
          src="${opponent.flag}"
          alt="Bandera de ${opponent.name}"
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

    return `
    <article class="muro-card ${
        position === 1
            ? "first-place"
            : ""
    }">
      <div class="muro-position">
        <span>${position}</span>
      </div>

      <div class="muro-team-main">
        <div class="muro-team-flag">
          ${
              flagMarkup(
                  team,
                  "muro-flag-placeholder"
              )
          }
        </div>

        <div class="muro-team-info">
          <span>Equipo</span>
          <h3>${team.name}</h3>
        </div>
      </div>

      <div class="muro-stat">
        <span>Goles recibidos</span>

        <strong>
          ${item.goalsAgainst}
        </strong>

        <small>
          ${item.gamesPlayed}
          ${
              item.gamesPlayed === 1
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
            ${opponentFlag}
          </div>

          <div>
            <strong class="${
                opponent.available
                    ? ""
                    : "muro-rival-error"
            }">
              ${opponent.name}
            </strong>

            ${
                opponent.date
                    ? `
                    <small>
                      ${opponent.date}
                    </small>
                  `
                    : ""
            }
          </div>
        </div>
      </div>
    </article>
  `;
}

/* Renderiza los cinco mejores registros defensivos. */
function renderMuro() {
    if (!dom.muro.grid) return;

    dom.muro.grid.innerHTML = "";

    setText(dom.muro.total, "0");
    setText(dom.muro.count, "0");

    dom.muro.eyebrow.classList.remove(
        "visible"
    );

    dom.muro.status.hidden = true;

    if (
        !state.loaded.groups ||
        !state.loaded.games
    ) {
        show(dom.muro.empty);

        setText(
            dom.muro.empty,
            state.error.groups
                ? "No fue posible cargar los grupos."
                : state.error.games
                    ? "No fue posible cargar los partidos."
                    : "Cargando grupos y partidos del Mundial..."
        );

        return;
    }

    const ranking =
        calculateMuroRanking();

    if (!state.loaded.teams) {
        dom.muro.status.hidden = false;

        setText(
            dom.muro.statusMessage,
            "El ranking está disponible, pero faltan nombres y banderas."
        );
    }

    setText(
        dom.muro.total,
        ranking.length
    );

    setText(
        dom.muro.count,
        ranking.length
    );

    if (!ranking.length) {
        show(dom.muro.empty);

        setText(
            dom.muro.empty,
            "No fue posible construir el ranking defensivo."
        );

        return;
    }

    hide(dom.muro.empty);

    dom.muro.eyebrow.classList.add(
        "visible"
    );

    dom.muro.grid.innerHTML =
        ranking
            .map((item, index) =>
                createMuroCard(
                    item,
                    index + 1
                )
            )
            .join("");
}

/* =====================================================
   2.4 ANALÍTICA DE ESTADIOS
===================================================== */

/*
 * Cruza los estadios con sus partidos
 * y calcula la asistencia potencial.
 */
function calculateAnalitica() {
    const gameCounts = new Map();

    state.analitica.games.forEach(game => {
        const stadiumId =
            String(game.stadium_id ?? "").trim();

        if (!stadiumId) return;

        gameCounts.set(
            stadiumId,
            (
                gameCounts.get(stadiumId) ??
                0
            ) + 1
        );
    });

    return state.stadiums
        .map(stadium => {
            const capacity =
                Number(stadium.capacity || 0);

            const gamesCount =
                state.analitica.loaded
                    ? (
                        gameCounts.get(
                            String(stadium.id)
                        ) ?? 0
                    )
                    : null;

            return {
                stadium,
                capacity,
                gamesCount,
                potential:
                    gamesCount === null
                        ? null
                        : capacity * gamesCount
            };
        })
        .sort((a, b) => {
            if (
                a.potential === null ||
                b.potential === null
            ) {
                return b.capacity - a.capacity;
            }

            return (
                b.potential -
                a.potential ||
                b.capacity -
                a.capacity
            );
        });
}

/* Genera una fila de la gráfica comparativa. */
function createAnaliticaChartRow(
    item,
    maxCapacity,
    maxGames
) {
    const stadiumName =
        item.stadium.name_en ??
        item.stadium.fifa_name ??
        "Estadio sin nombre";

    const capacityWidth =
        maxCapacity > 0
            ? Math.max(
                2,
                Math.round(
                    item.capacity /
                    maxCapacity *
                    100
                )
            )
            : 0;

    const gamesWidth =
        item.gamesCount !== null &&
        maxGames > 0
            ? Math.max(
                2,
                Math.round(
                    item.gamesCount /
                    maxGames *
                    100
                )
            )
            : 0;

    return `
    <article class="analitica-chart-row">
      <div class="analitica-stadium-name">
        <strong>
          ${stadiumName}
        </strong>

        <span>
          ${
              item.stadium.city_en ??
              "Ciudad no disponible"
          }
        </span>
      </div>

      <div class="analitica-bars">
        <div class="analitica-bar-group">
          <div class="analitica-bar-header">
            <span>Capacidad</span>

            <strong>
              ${
                  item.capacity.toLocaleString(
                      "es-CR"
                  )
              }
            </strong>
          </div>

          <div class="analitica-bar-track">
            <div
              class="analitica-bar analitica-capacity-bar"
              style="width: ${capacityWidth}%"
            ></div>
          </div>
        </div>

        <div class="analitica-bar-group">
          <div class="analitica-bar-header">
            <span>Partidos</span>

            <strong>
              ${
                  item.gamesCount === null
                      ? "Esperando datos"
                      : `${item.gamesCount} partidos`
              }
            </strong>
          </div>

          <div class="analitica-bar-track">
            <div
              class="analitica-bar analitica-games-bar"
              style="width: ${gamesWidth}%"
            ></div>
          </div>
        </div>
      </div>
    </article>
  `;
}

/* Genera una fila del ranking de asistencia. */
function createAnaliticaRankingRow(
    item,
    position
) {
    const stadium = item.stadium;

    return `
    <article class="analitica-ranking-row">
      <div class="analitica-ranking-position">
        ${position}
      </div>

      <div class="analitica-ranking-stadium">
        <span>Estadio</span>

        <strong>
          ${
              stadium.name_en ??
              stadium.fifa_name ??
              "Estadio sin nombre"
          }
        </strong>

        <small>
          ${
              stadium.city_en ??
              "Ciudad no disponible"
          },
          ${
              stadium.country_en ??
              "País no disponible"
          }
        </small>
      </div>

      <div class="analitica-ranking-data">
        <span>Capacidad</span>

        <strong>
          ${
              item.capacity.toLocaleString(
                  "es-CR"
              )
          }
        </strong>
      </div>

      <div class="analitica-ranking-data">
        <span>Partidos</span>

        <strong>
          ${item.gamesCount ?? "—"}
        </strong>
      </div>

      <div class="analitica-ranking-data potential">
        <span>
          Asistencia potencial
        </span>

        <strong>
          ${
              item.potential === null
                  ? "Esperando datos de partidos"
                  : item.potential.toLocaleString(
                      "es-CR"
                  )
          }
        </strong>
      </div>
    </article>
  `;
}

/*
 * Los estadios permanecen visibles aunque
 * falle la petición independiente de partidos.
 */
function renderAnalitica() {
    if (!dom.analitica.chart) return;

    dom.analitica.chart.innerHTML = "";
    dom.analitica.ranking.innerHTML = "";

    setText(dom.analitica.total, "0");
    setText(dom.analitica.stadiums, "—");
    setText(dom.analitica.games, "—");
    setText(dom.analitica.potential, "—");

    if (!state.loaded.stadiums) {
        show(dom.analitica.empty);

        setText(
            dom.analitica.empty,
            state.error.stadiums
                ? "No fue posible cargar los estadios."
                : "Cargando los estadios..."
        );

        dom.analitica.waiting.hidden = true;

        return;
    }

    const ranking =
        calculateAnalitica();

    setText(
        dom.analitica.total,
        ranking.length
    );

    setText(
        dom.analitica.stadiums,
        ranking.length
    );

    hide(dom.analitica.empty);

    dom.analitica.waiting.hidden =
        state.analitica.loaded;

    if (!state.analitica.loaded) {
        setText(
            dom.analitica.waitingTitle,
            state.analitica.error
                ? "No fue posible cargar los partidos"
                : "Esperando datos de partidos"
        );

        setText(
            dom.analitica.waitingMessage,
            state.analitica.error
                ? (
                    "Los estadios permanecen visibles. " +
                    "Se agotaron los reintentos."
                )
                : (
                    "Los estadios permanecen visibles " +
                    "mientras /get/games se reintenta."
                )
        );
    } else {
        setText(
            dom.analitica.games,
            state.analitica.games.length
        );

        setText(
            dom.analitica.potential,
            (
                ranking[0]?.potential ??
                0
            ).toLocaleString("es-CR")
        );
    }

    const maxCapacity = Math.max(
        ...ranking.map(
            item => item.capacity
        ),
        0
    );

    const maxGames = Math.max(
        ...ranking.map(
            item => item.gamesCount ?? 0
        ),
        0
    );

    dom.analitica.chart.innerHTML =
        ranking
            .map(item =>
                createAnaliticaChartRow(
                    item,
                    maxCapacity,
                    maxGames
                )
            )
            .join("");

    dom.analitica.ranking.innerHTML =
        ranking
            .map((item, index) =>
                createAnaliticaRankingRow(
                    item,
                    index + 1
                )
            )
            .join("");
}

/*
 * Carga independiente para Analítica.
 * Solo esta petición entra en backoff.
 */
function loadAnaliticaGames() {
    if (state.analitica.loading) return;

    state.analitica.loading = true;
    state.analitica.error = false;

    renderAnalitica();

    fetchJsonWithBackoff({
        url: `${BASE}/get/games`,
        label: "/get/games de Analítica",
        testStatus:
            TEST_ANALITICA_GAMES_STATUS,
        retryStatuses: [429, 500],

        onRetry: ({
            status,
            seconds,
            retrying
        }) => {
            dom.analitica.waiting.hidden =
                false;

            setText(
                dom.analitica.waitingTitle,
                retrying
                    ? "Reintentando partidos"
                    : `Error HTTP ${status} en /get/games`
            );

            setText(
                dom.analitica.waitingMessage,
                retrying
                    ? "Realizando una nueva petición..."
                    : (
                        "Los estadios permanecen visibles. " +
                        `Nuevo intento en ${seconds} ` +
                        `segundo${
                            seconds === 1 ? "" : "s"
                        }.`
                    )
            );
        }
    })
        .then(data => {
            if (!Array.isArray(data.games)) {
                throw new Error(
                    "La API no devolvió una lista válida de partidos."
                );
            }

            state.analitica.games = data.games;
            state.analitica.loaded = true;
            state.analitica.error = false;

            renderAnalitica();
        })
        .catch(error => {
            console.error(
                "Error en Analítica:",
                error
            );

            state.analitica.error = true;

            renderAnalitica();
        })
        .finally(() => {
            state.analitica.loading = false;
        });
}

/* =====================================================
   2.5 RADAR DE EMPATES
===================================================== */

/*
 * Usa los partidos principales para dibujar
 * la matriz antes de realizar su petición independiente.
 */
function syncEmpatesFromGames() {
    if (
        state.loaded.games &&
        !state.empates.loaded
    ) {
        state.empates.games = [
            ...state.games
        ];

        state.empates.loaded = true;
        state.empates.error = false;
    }
}

/* Filtra los empates terminados y los agrupa de A a L. */
function calculateEmpates() {
    const grouped =
        Object.fromEntries(
            GROUPS.map(group => [
                group,
                []
            ])
        );

    state.empates.games
        .filter(game => {
            const homeScore =
                parseScore(game.home_score);

            const awayScore =
                parseScore(game.away_score);

            return (
                isFinishedGame(game) &&
                homeScore !== null &&
                awayScore !== null &&
                homeScore === awayScore
            );
        })
        .forEach(game => {
            const group =
                String(game.group ?? "")
                    .trim()
                    .toUpperCase();

            if (grouped[group]) {
                grouped[group].push(game);
            }
        });

    GROUPS.forEach(group => {
        grouped[group].sort((a, b) =>
            parseLocalDate(a.local_date) -
            parseLocalDate(b.local_date)
        );
    });

    return grouped;
}

/* Genera la celda visual de un empate. */
function createEmpateMatch(game) {
    const homeTeam = getTeamData(
        game.home_team_id,
        game.home_team_name_en
    );

    const awayTeam = getTeamData(
        game.away_team_id,
        game.away_team_name_en
    );

    return `
    <article class="empate-match">
      <p class="empate-match-date">
        ${formatLocalDate(game.local_date)}
      </p>

      <div class="empate-team-row">
        <div class="empate-team">
          <div class="empate-team-flag">
            ${
                flagMarkup(
                    homeTeam,
                    "empate-flag-placeholder"
                )
            }
          </div>

          <strong>
            ${homeTeam.name}
          </strong>
        </div>

        <span class="empate-score">
          ${parseScore(game.home_score)}
        </span>
      </div>

      <div class="empate-separator">
        Empate
      </div>

      <div class="empate-team-row">
        <div class="empate-team">
          <div class="empate-team-flag">
            ${
                flagMarkup(
                    awayTeam,
                    "empate-flag-placeholder"
                )
            }
          </div>

          <strong>
            ${awayTeam.name}
          </strong>
        </div>

        <span class="empate-score">
          ${parseScore(game.away_score)}
        </span>
      </div>
    </article>
  `;
}

/* Genera la tarjeta de un grupo. */
function createEmpatesGroup(group, games) {
    return `
    <article class="empates-group-card">
      <div class="empates-group-header">
        <div>
          <span>Grupo</span>
          <strong>${group}</strong>
        </div>

        <div class="empates-group-count">
          ${games.length}
          ${games.length === 1 ? "empate" : "empates"}
        </div>
      </div>

      <div class="empates-group-content">
        ${
            games.length
                ? games
                    .map(createEmpateMatch)
                    .join("")
                : `
                <p class="empates-group-empty">
                  Sin empates registrados.
                </p>
              `
        }
      </div>
    </article>
  `;
}

/* Busca el grupo con mayor cantidad de empates. */
function getTopEmpatesGroup(grouped) {
    let topGroup = null;
    let highestCount = 0;

    GROUPS.forEach(group => {
        const count =
            grouped[group].length;

        if (count > highestCount) {
            topGroup = group;
            highestCount = count;
        }
    });

    return topGroup
        ? `Grupo ${topGroup} (${highestCount})`
        : "Sin empates";
}

/*
 * Renderiza los grupos.
 * Durante un 429 la matriz existente no se elimina.
 */
function renderEmpates() {
    if (!dom.empates.matrix) return;

    if (!state.empates.loaded) {
        show(dom.empates.empty);

        setText(
            dom.empates.empty,
            state.empates.error
                ? "No fue posible cargar los partidos."
                : "Preparando la matriz de empates..."
        );

        return;
    }

    const grouped =
        calculateEmpates();

    const total = GROUPS.reduce(
        (sum, group) =>
            sum + grouped[group].length,
        0
    );

    setText(dom.empates.total, total);
    setText(dom.empates.statTotal, total);

    setText(
        dom.empates.statGroups,
        `${GROUPS.length} / 12`
    );

    setText(
        dom.empates.statTop,
        getTopEmpatesGroup(grouped)
    );

    hide(dom.empates.empty);

    dom.empates.matrix.innerHTML =
        GROUPS
            .map(group =>
                createEmpatesGroup(
                    group,
                    grouped[group]
                )
            )
            .join("");
}

/*
 * Carga independiente para Empates.
 * Solo los errores 429 activan el backoff.
 */
function loadEmpatesGames() {
    if (state.empates.loading) return;

    state.empates.loading = true;
    state.empates.error = false;

    fetchJsonWithBackoff({
        url: `${BASE}/get/games`,
        label: "/get/games de Empates",
        testStatus:
            TEST_EMPATES_GAMES_STATUS,
        retryStatuses: [429],

        onRetry: ({
            seconds,
            retrying
        }) => {
            dom.empates.retry.hidden = false;

            setText(
                dom.empates.retryTitle,
                retrying
                    ? "Reintentando partidos"
                    : "Límite de solicitudes alcanzado"
            );

            setText(
                dom.empates.retryMessage,
                retrying
                    ? "Realizando una nueva petición a /get/games..."
                    : (
                        "Los grupos ya dibujados permanecen visibles. " +
                        `Nuevo intento en ${seconds} ` +
                        `segundo${
                            seconds === 1 ? "" : "s"
                        }.`
                    )
            );

            setText(
                dom.empates.countdown,
                retrying ? "0" : seconds
            );
        }
    })
        .then(data => {
            if (!Array.isArray(data.games)) {
                throw new Error(
                    "La API no devolvió una lista válida de partidos."
                );
            }

            state.empates.games = data.games;
            state.empates.loaded = true;
            state.empates.error = false;
            state.empates.completed = true;

            dom.empates.retry.hidden = true;

            renderEmpates();
        })
        .catch(error => {
            console.error(
                "Error en Radar de Empates:",
                error
            );

            state.empates.error = true;
            state.empates.completed = true;
            dom.empates.retry.hidden = false;

            setText(
                dom.empates.retryTitle,
                "No se pudieron actualizar los partidos"
            );

            setText(
                dom.empates.retryMessage,
                "Los grupos ya dibujados permanecen visibles. " +
                "Se agotaron los reintentos automáticos."
            );

            setText(
                dom.empates.countdown,
                "—"
            );

            /*
             * Si ya existía una matriz, no se
             * vuelve a dibujar ni se elimina.
             */
            if (!state.empates.loaded) {
                renderEmpates();
            }
        })
        .finally(() => {
            state.empates.loading = false;
        });
}

/* =====================================================
   ACTUALIZACIÓN DE PANTALLAS
===================================================== */
function refreshTeamViews() {
    renderGoleadas();
    renderMuro();
    renderEmpates();
}

function refreshGameViews() {
    if (state.selectedTeam) {
        updateSelectedTeamGames();
    }

    renderGoleadas();
    renderMuro();
    renderAnalitica();
    renderEmpates();
}

function refreshStadiumViews() {
    if (state.selectedTeam) {
        renderGames();
        renderStadiumsSection();
        renderSummarySection();
    }

    renderAnalitica();
}

/* =====================================================
   CARGA DE EQUIPOS
===================================================== */
function clearTeamsRetry() {
    if (teamsRetryTimer) {
        clearTimeout(teamsRetryTimer);
    }

    teamsRetryTimer = null;
}

/* Reintento en segundo plano exigido en 2.2. */
function scheduleTeamsRetry() {
    if (
        state.teamsRetryAttempt >=
        TEAM_RETRIES.length
    ) {
        setText(
            dom.goleadas.warningMessage,
            "No fue posible recuperar nombres y banderas. " +
            "Las goleadas continúan visibles utilizando IDs."
        );

        return;
    }

    const delay =
        TEAM_RETRIES[
            state.teamsRetryAttempt
        ];

    state.teamsRetryAttempt += 1;

    setText(
        dom.goleadas.warningMessage,
        "Las goleadas permanecen visibles utilizando IDs. " +
        `/get/teams se reintentará en ${delay / 1000} segundos.`
    );

    clearTeamsRetry();

    teamsRetryTimer = setTimeout(() => {
        loadTeams(true);
    }, delay);
}

function loadTeams(
    isBackgroundRetry = false
) {
    if (teamsRequestInProgress) return;

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
        .then(data => {
            if (!Array.isArray(data.teams)) {
                throw new Error(
                    "La API no devolvió una lista válida de equipos."
                );
            }

            state.teams = data.teams;
            state.loaded.teams = true;
            state.error.teams = false;
            state.teamsRetryAttempt = 0;

            clearTeamsRetry();

            saveCache(
                CACHE.teams,
                state.teams
            );

            markCache("teams");

            populateTeamSelector();
            refreshTeamViews();

            if (isBackgroundRetry) {
                console.log(
                    "/get/teams se recuperó en segundo plano."
                );
            }
        })
        .catch(error => {
            console.error(
                "Error al cargar equipos:",
                error
            );

            const cached =
                readCache(CACHE.teams);

            if (cached) {
                state.teams = cached.data;
                state.loaded.teams = true;
                state.error.teams = false;

                markCache(
                    "teams",
                    cached.savedAt
                );

                populateTeamSelector();
                refreshTeamViews();

                return;
            }

            state.teams = [];
            state.loaded.teams = false;
            state.error.teams = true;

            dom.ruta.select.innerHTML = `
        <option value="">
          Equipos temporalmente no disponibles
        </option>
      `;

            dom.ruta.select.disabled = true;

            refreshTeamViews();
            scheduleTeamsRetry();
        })
        .finally(() => {
            teamsRequestInProgress = false;
        });
}

/* =====================================================
   CARGA DE PARTIDOS
===================================================== */
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
        .then(data => {
            if (!Array.isArray(data.games)) {
                throw new Error(
                    "La API no devolvió una lista válida de partidos."
                );
            }

            state.games = data.games;
            state.loaded.games = true;
            state.error.games = false;

            syncEmpatesFromGames();

            saveCache(
                CACHE.games,
                state.games
            );

            markCache("games");
            refreshGameViews();
        })
        .catch(error => {
            console.error(
                "Error al cargar partidos:",
                error
            );

            const cached =
                readCache(CACHE.games);

            if (cached) {
                state.games = cached.data;
                state.loaded.games = true;
                state.error.games = false;

                syncEmpatesFromGames();

                markCache(
                    "games",
                    cached.savedAt
                );

                refreshGameViews();

                return;
            }

            state.games = [];
            state.loaded.games = false;
            state.error.games = true;

            show(dom.ruta.gamesEmpty);

            setText(
                dom.ruta.gamesEmpty,
                "No fue posible cargar los partidos y no existen datos guardados."
            );

            refreshGameViews();
        });
}

/* =====================================================
   CARGA DE GRUPOS
===================================================== */
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
        .then(data => {
            const groups =
                Array.isArray(data.groups)
                    ? data.groups
                    : Array.isArray(data)
                        ? data
                        : null;

            if (!groups) {
                throw new Error(
                    "La API no devolvió una lista válida de grupos."
                );
            }

            state.groups = groups;
            state.loaded.groups = true;
            state.error.groups = false;

            renderMuro();
        })
        .catch(error => {
            console.error(
                "Error al cargar grupos:",
                error
            );

            state.groups = [];
            state.loaded.groups = false;
            state.error.groups = true;

            renderMuro();
        });
}

/* =====================================================
   CARGA DE ESTADIOS
===================================================== */
function loadStadiums() {
    if (state.stadiumsLoading) return;

    state.stadiumsLoading = true;
    state.error.stadiums = false;

    hideStadiumAlert();

    if (dom.ruta.retryStadiums) {
        dom.ruta.retryStadiums.disabled = true;
    }

    fetchJsonWithBackoff({
        url: `${BASE}/get/stadiums`,
        label: "estadios",
        testStatus: TEST_HTTP_STATUS,
        retryStatuses: [429, 500],

        onRetry: ({
            status,
            seconds,
            retrying
        }) => {
            showResilience(
                retrying
                    ? "Reintentando estadios"
                    : `Error HTTP ${status} en estadios`,

                retrying
                    ? "Realizando una nueva petición..."
                    : (
                        `Nuevo intento en ${seconds} ` +
                        `segundo${
                            seconds === 1 ? "" : "s"
                        }.`
                    )
            );
        }
    })
        .then(data => {
            if (!Array.isArray(data.stadiums)) {
                throw new Error(
                    "La API no devolvió una lista válida de estadios."
                );
            }

            state.stadiums = data.stadiums;
            state.loaded.stadiums = true;
            state.error.stadiums = false;

            saveCache(
                CACHE.stadiums,
                state.stadiums
            );

            markCache("stadiums");

            hideResilience();
            hideStadiumAlert();

            refreshStadiumViews();
        })
        .catch(error => {
            console.error(
                "Error al cargar estadios:",
                error
            );

            const cached =
                readCache(CACHE.stadiums);

            if (cached) {
                state.stadiums = cached.data;
                state.loaded.stadiums = true;
                state.error.stadiums = false;

                markCache(
                    "stadiums",
                    cached.savedAt
                );

                hideResilience();
                hideStadiumAlert();

                refreshStadiumViews();

                return;
            }

            state.stadiums = [];
            state.loaded.stadiums = false;
            state.error.stadiums = true;

            showResilience(
                "No se pudieron cargar los estadios",
                "Se agotaron los reintentos y no existen datos guardados."
            );

            showStadiumAlert(
                "Los partidos permanecen visibles. " +
                "Puede reintentar únicamente la carga de estadios."
            );

            refreshStadiumViews();
        })
        .finally(() => {
            state.stadiumsLoading = false;

            if (dom.ruta.retryStadiums) {
                dom.ruta.retryStadiums.disabled = false;
            }
        });
}

/* =====================================================
   INICIALIZACIÓN
===================================================== */
function init() {
    configureNavigation();
    clearSelectedTeam();

    showScreen("ruta", false);

    loadTeams();
    loadGames();
    loadGroups();
    loadStadiums();

    setText(
        dom.apiStatus,
        "API worldcup26.ir"
    );
}

init();