# Laboratorio 2 — World Cup 2026

Aplicación web interactiva desarrollada para el curso **ISW-521 Programación Web I**.

El proyecto consume la API pública del Mundial 2026 y cruza datos de equipos, partidos, grupos y estadios para generar cinco pantallas de análisis.

## Estudiante

**Lary Díaz Artavia**

## Tecnologías

- HTML5
- CSS3
- JavaScript Vanilla
- Fetch API
- DOM
- localStorage
- API REST pública

## API utilizada

```text
https://worldcup26.ir
```

## Endpoints

```text
GET /get/teams
GET /get/games
GET /get/groups
GET /get/stadiums
```

## Funcionalidades

### La Ruta del Campeón

Permite seleccionar un equipo y mostrar sus partidos ordenados por fecha.

Cada tarjeta muestra:

- Rival.
- Condición de local o visitante.
- Fecha.
- Estadio.
- Ciudad.
- País.
- Capacidad.

También calcula la cantidad de ciudades y estadios visitados.

### Rastreador de Goleadas

Muestra los partidos finalizados con una diferencia de tres o más goles.

Los resultados se ordenan de mayor a menor diferencia y muestran nombres, banderas y marcador.

### El Muro

Genera un ranking con los cinco equipos que recibieron menos goles durante todo el Mundial.

En caso de empate, se favorece al equipo que disputó más partidos. También se muestra el próximo rival de cada equipo.

### Analítica de Estadios

Calcula por estadio:

- Cantidad de partidos.
- Capacidad.
- Asistencia potencial.

Los resultados se ordenan de mayor a menor asistencia potencial y se presentan mediante una gráfica de barras.

### Radar de Empates

Filtra los partidos finalizados que terminaron empatados y los agrupa desde el grupo A hasta el grupo L.

Muestra los equipos, las banderas, el marcador y la cantidad de empates por grupo.

## Manejo de errores

La aplicación incluye:

- Manejo visible de errores HTTP.
- Reintentos automáticos.
- Backoff exponencial.
- Countdown para errores 429.
- Datos de respaldo con localStorage.
- Conservación de información ya renderizada cuando falla una petición secundaria.

No se utiliza `alert()` ni se recarga la página para resolver errores.

## Simulación de errores

En `worldcup26_app.js` se pueden modificar estas constantes:

```js
const TEST_HTTP_STATUS = null;
const TEST_ANALITICA_GAMES_STATUS = null;
const TEST_EMPATES_GAMES_STATUS = null;
```

Valores disponibles:

```text
null = funcionamiento normal
429  = demasiadas solicitudes
500  = error interno del servidor
```

Para la entrega final, las tres constantes deben permanecer en `null`.

## Ejecución

1. Abrir la carpeta del proyecto en Visual Studio Code.
2. Abrir `worldcup26_itinerario.html`.
3. Ejecutarlo con la extensión **Live Server**.

El proyecto no necesita dependencias ni instalación con npm.

## Estructura

```text
Worldcup/
├── README.md
├── worldcup26_itinerario.html
├── worldcup26_styles.css
└── worldcup26_app.js
```