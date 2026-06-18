// Selecciona el botón que cambia entre modo claro y modo oscuro.
const themeButton = document.querySelector(".theme-toggle");

// Guarda una referencia al body para agregar o quitar la clase del modo oscuro.
const body = document.body;

// Recupera del navegador la preferencia de tema guardada anteriormente.
const savedTheme = localStorage.getItem("taskuni-theme");

// Si el usuario ya había elegido el modo oscuro, se aplica al cargar la página.
if (savedTheme === "dark") {
    body.classList.add("dark-theme");
    themeButton.textContent = "Modo claro";
    themeButton.setAttribute("aria-label", "Cambiar a modo claro");
}

// Evento que se ejecuta cuando el usuario presiona el botón de modo claro/oscuro.
themeButton.addEventListener("click", function () {
    body.classList.toggle("dark-theme");

    const darkModeIsActive = body.classList.contains("dark-theme");

    // Guarda la preferencia del usuario en localStorage.
    if (darkModeIsActive) {
        localStorage.setItem("taskuni-theme", "dark");
        themeButton.textContent = "Modo claro";
        themeButton.setAttribute("aria-label", "Cambiar a modo claro");
    } else {
        localStorage.setItem("taskuni-theme", "light");
        themeButton.textContent = "Modo oscuro";
        themeButton.setAttribute("aria-label", "Cambiar a modo oscuro");
    }
});

// Datos de ejemplo para mostrar tareas según el día seleccionado en el calendario.
const calendarTasks = {
    12: [
        { title: "Quiz de programación", priority: "Media", className: "medium" }
    ],
    15: [
        { title: "Proyecto de programación web", priority: "Alta", className: "high" },
        { title: "Repaso de base de datos", priority: "Media", className: "medium" }
    ],
    17: [
        { title: "Práctica de inglés", priority: "Media", className: "medium" }
    ],
    24: [
        { title: "Entrega de laboratorio", priority: "Alta", className: "high" },
        { title: "Lectura de accesibilidad web", priority: "Baja", className: "low" }
    ]
};

// Selecciona los elementos del calendario.
const calendarDays = document.querySelectorAll(".calendar-day");
const selectedDayTitle = document.querySelector("#selected-day-title");
const calendarTaskList = document.querySelector("#calendar-task-list");
const todayButton = document.querySelector(".today-button");

// Actualiza la lista de tareas según el día seleccionado.
function updateCalendarTasks(day) {
    selectedDayTitle.textContent = `Tareas del ${day} de junio`;
    calendarTaskList.innerHTML = "";

    const tasks = calendarTasks[day];

    if (!tasks) {
        const emptyItem = document.createElement("li");
        emptyItem.textContent = "No hay tareas registradas para este día.";
        calendarTaskList.appendChild(emptyItem);
        return;
    }

    tasks.forEach(function (task) {
        const listItem = document.createElement("li");

        const taskTitle = document.createElement("span");
        taskTitle.textContent = task.title;

        const priority = document.createElement("strong");
        priority.textContent = task.priority;
        priority.classList.add("priority", task.className);

        listItem.appendChild(taskTitle);
        listItem.appendChild(priority);

        calendarTaskList.appendChild(listItem);
    });
}

// Permite seleccionar días del calendario.
calendarDays.forEach(function (dayButton) {
    dayButton.addEventListener("click", function () {
        calendarDays.forEach(function (button) {
            button.classList.remove("active-day");
        });

        dayButton.classList.add("active-day");

        const selectedDay = dayButton.textContent.trim();
        updateCalendarTasks(selectedDay);
    });
});

// El botón Hoy vuelve al día principal del ejemplo.
todayButton.addEventListener("click", function () {
    calendarDays.forEach(function (button) {
        button.classList.remove("active-day");
    });

    const defaultDay = document.querySelector('.calendar-day[data-day="15"]');
    defaultDay.classList.add("active-day");
    updateCalendarTasks("15");
});

// Selecciona el formulario de contacto y el mensaje que aparece debajo.
const contactForm = document.querySelector(".contact-form");
const formMessage = document.querySelector(".form-message");

// Evita que el formulario recargue la página o envíe los datos por la URL.
contactForm.addEventListener("submit", function (event) {
    event.preventDefault();

    formMessage.textContent = "Gracias por su interés en TaskUni. Pronto recibirá más información.";
    formMessage.classList.add("is-visible");

    contactForm.reset();
});