const places = window.SECRET_MOSCOW_PLACES;
const DEFAULT_YANDEX_MAPS_KEY = "d0e7278b-1c42-448b-91c8-e17a315bbc82";
const categories = ["все", ...Array.from(new Set(places.map((place) => place.category)))];
const state = {
  category: "все",
  detailsHidden: false,
  search: "",
  selectedId: places[0].id,
  map: null,
  clusterer: null,
  placemarks: new Map()
};

const elements = {
  categoryStrip: document.querySelector("#categoryStrip"),
  countLabel: document.querySelector("#countLabel"),
  detailsPanel: document.querySelector("#detailsPanel"),
  mapKeyInput: document.querySelector("#mapKeyInput"),
  mapKeyPanel: document.querySelector("#mapKeyPanel"),
  placeList: document.querySelector("#placeList"),
  randomPlaceButton: document.querySelector("#randomPlaceButton"),
  resetButton: document.querySelector("#resetButton"),
  saveMapKeyButton: document.querySelector("#saveMapKeyButton"),
  searchInput: document.querySelector("#searchInput")
};

const categoryMeta = {
  "рестораны и кафе": { icon: "utensils", accent: "tomato" },
  "музеи и выставки": { icon: "sparkles", accent: "cobalt" },
  "парки и прогулки": { icon: "trees", accent: "lime" },
  "спорт и активность": { icon: "activity", accent: "blue" },
  "мастер-классы": { icon: "palette", accent: "violet" },
  "пространства": { icon: "gem", accent: "pink" },
  "спа и красота": { icon: "flower", accent: "peach" },
  "события": { icon: "ticket", accent: "amber" },
  "все": { icon: "layout-grid", accent: "ink" }
};

function getCategoryMeta(category) {
  return categoryMeta[category] || { icon: "map-pin", accent: "ink" };
}

function createIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function linkToYandex(place) {
  const text = encodeURIComponent(place.address || place.title);
  return `https://yandex.ru/maps/?text=${text}`;
}

function formatDrive(access) {
  if (!access || !access.fromHome) return "маршрут уточнить";
  return `~${access.fromHome.minutes} мин · ${access.fromHome.km} км`;
}

function formatMetro(access) {
  if (!access || !access.metro || !access.metro.length) return "метро уточнить";
  return access.metro.slice(0, 2).map((station) => `${station.name} ${station.distanceKm} км`).join(" · ");
}

function filteredPlaces() {
  const query = state.search.trim().toLowerCase();
  return places.filter((place) => {
    const categoryMatch = state.category === "все" || place.category === state.category;
    const text = `${place.title} ${place.address} ${place.description} ${place.tags.join(" ")}`.toLowerCase();
    return categoryMatch && (!query || text.includes(query));
  });
}

function renderCategories() {
  elements.categoryStrip.innerHTML = categories.map((category) => {
    const active = category === state.category ? "active" : "";
    const meta = getCategoryMeta(category);
    return `
      <button class="category-chip ${active}" data-category="${category}" data-accent="${meta.accent}">
        <i data-lucide="${meta.icon}"></i>${category}
      </button>
    `;
  }).join("");
}

function renderList() {
  const visible = filteredPlaces();
  elements.countLabel.textContent = `${visible.length} мест`;
  elements.placeList.innerHTML = visible.map((place) => {
    const active = place.id === state.selectedId ? "active" : "";
    const meta = getCategoryMeta(place.category);
    const social = [
      place.links.instagram && "Instagram",
      place.links.telegram && "Telegram",
      place.links.site && "сайт"
    ].filter(Boolean).slice(0, 2).join(" · ");
    return `
      <button class="place-row ${active}" data-id="${place.id}" data-accent="${meta.accent}">
        <span class="row-kicker"><i data-lucide="${meta.icon}"></i>${place.category}</span>
        <span class="row-title">${place.title}</span>
        <span class="row-description">${place.description}</span>
        <span class="row-access">
          <span><i data-lucide="car"></i>${formatDrive(place.access)}</span>
          <span><i data-lucide="train-front"></i>${formatMetro(place.access)}</span>
        </span>
        <span class="row-footer">
          <span>${place.tags.slice(0, 2).join(" / ")}</span>
          <span>${social || "план"}</span>
        </span>
      </button>
    `;
  }).join("");
  createIcons();
}

function renderDetails() {
  const place = places.find((item) => item.id === state.selectedId) || filteredPlaces()[0] || places[0];
  if (!place) return;
  elements.detailsPanel.classList.toggle("hidden", state.detailsHidden);
  const meta = getCategoryMeta(place.category);

  const links = [
    place.links.site && ["Сайт", "globe", place.links.site],
    place.links.instagram && ["Instagram", "instagram", place.links.instagram],
    place.links.telegram && ["Telegram", "send", place.links.telegram],
    ["Яндекс", "map-pinned", linkToYandex(place)]
  ].filter(Boolean);

  elements.detailsPanel.innerHTML = `
    <div class="details-art" data-accent="${meta.accent}"></div>
    <div class="details-top">
      <span class="details-category"><i data-lucide="${meta.icon}"></i>${place.category}</span>
      <button class="icon-button compact" id="closeDetailsButton" title="Свернуть" aria-label="Свернуть">
        <i data-lucide="panel-right-close"></i>
      </button>
    </div>
    <h2>${place.title}</h2>
    <p class="address"><i data-lucide="map-pin"></i>${place.address}</p>
    <div class="access-strip">
      <div>
        <span><i data-lucide="car"></i>Из дома</span>
        <strong>${formatDrive(place.access)}</strong>
        <small>${place.access?.fromHome?.note || "примерный ориентир"}</small>
      </div>
      <div>
        <span><i data-lucide="train-front"></i>Метро рядом</span>
        <strong>${place.access?.metro?.[0]?.name || "уточнить"}</strong>
        <small>${formatMetro(place.access)}</small>
      </div>
    </div>
    <p class="details-lead">${place.description}</p>
    <div class="tag-cloud">${place.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
    <div class="visit-plan">
      <section>
        <span>Почему сюда</span>
        <p>${place.description}</p>
      </section>
      <section>
        <span>Что сделать</span>
        <p>Открыть соцсети или сайт, проверить актуальный формат и добавить конкретный план визита.</p>
      </section>
      <section>
        <span>Когда идти</span>
        <p>${place.tags.includes("лето") ? "Летом или в теплый выходной." : "В свободный вечер или на выходных."}</p>
      </section>
      <section>
        <span>С кем идти</span>
        <p>${place.tags.includes("с детьми") ? "С детьми или семьей." : place.tags.includes("pet-friendly") ? "Одной, с подругой или с питомцем." : "Одной, с подругой или небольшой компанией."}</p>
      </section>
      <section>
        <span>Сколько времени</span>
        <p>Заложить 1-2 часа, а для загородных мест - половину дня.</p>
      </section>
      <section>
        <span>Проверить перед визитом</span>
        <p>Расписание, бронь, билеты, адрес и актуальные сторис/посты места.</p>
      </section>
    </div>
    <div class="link-row">
      ${links.map(([label, icon, url]) => `
        <a href="${url}" target="_blank" rel="noreferrer">
          <i data-lucide="${icon}"></i>${label}
        </a>
      `).join("")}
    </div>
  `;
  createIcons();
}

function selectPlace(id, focusMap = true) {
  state.selectedId = id;
  state.detailsHidden = false;
  const place = places.find((item) => item.id === id);
  renderList();
  renderDetails();

  if (focusMap && state.map && place) {
    state.map.setCenter(place.coords, 14, { duration: 250 });
    const placemark = state.placemarks.get(id);
    if (placemark) placemark.balloon.open();
  }
}

function syncMapVisibility() {
  if (!state.clusterer) return;
  state.clusterer.removeAll();
  filteredPlaces().forEach((place) => {
    const placemark = state.placemarks.get(place.id);
    if (placemark) state.clusterer.add(placemark);
  });
}

function renderAll() {
  renderCategories();
  renderList();
  renderDetails();
  createIcons();
}

function loadYandexScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(resolve);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.onload = () => window.ymaps.ready(resolve);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function initMap(apiKey) {
  elements.mapKeyPanel.classList.add("hidden");
  loadYandexScript(apiKey).then(() => {
  state.map = new ymaps.Map("map", {
      center: [55.7558, 37.6176],
      zoom: 11,
      controls: ["zoomControl", "geolocationControl"]
    }, {
      suppressMapOpenBlock: true,
      yandexMapDisablePoiInteractivity: true
    });

    state.clusterer = new ymaps.Clusterer({
      preset: "islands#invertedDarkGreenClusterIcons",
      groupByCoordinates: false,
      clusterDisableClickZoom: false
    });

    places.forEach((place) => {
      const placemark = new ymaps.Placemark(place.coords, {
        hintContent: place.title,
        balloonContentHeader: place.title,
        balloonContentBody: `<strong>${place.category}</strong><br>${place.address}`,
        balloonContentFooter: `<a href="${linkToYandex(place)}" target="_blank" rel="noreferrer">Открыть в Яндекс.Картах</a>`
      }, {
        preset: "islands#darkGreenDotIcon"
      });
      placemark.events.add("click", () => selectPlace(place.id, false));
      state.placemarks.set(place.id, placemark);
      state.clusterer.add(placemark);
    });

    state.map.geoObjects.add(state.clusterer);
    syncMapVisibility();
    selectPlace(state.selectedId, true);
  }).catch(() => {
    elements.mapKeyPanel.classList.remove("hidden");
    elements.mapKeyPanel.classList.add("error");
  });
}

elements.categoryStrip.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  const firstVisible = filteredPlaces()[0];
  if (firstVisible) state.selectedId = firstVisible.id;
  renderAll();
  syncMapVisibility();
});

elements.placeList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (row) selectPlace(row.dataset.id);
});

elements.detailsPanel.addEventListener("click", (event) => {
  if (!event.target.closest("#closeDetailsButton")) return;
  state.detailsHidden = true;
  elements.detailsPanel.classList.add("hidden");
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  const firstVisible = filteredPlaces()[0];
  if (firstVisible && !filteredPlaces().some((place) => place.id === state.selectedId)) {
    state.selectedId = firstVisible.id;
  }
  renderList();
  syncMapVisibility();
});

elements.resetButton.addEventListener("click", () => {
  state.category = "все";
  state.search = "";
  state.selectedId = places[0].id;
  elements.searchInput.value = "";
  renderAll();
  syncMapVisibility();
  selectPlace(state.selectedId);
});

elements.randomPlaceButton.addEventListener("click", () => {
  const visible = filteredPlaces();
  const place = visible[Math.floor(Math.random() * visible.length)] || places[0];
  selectPlace(place.id);
});

elements.saveMapKeyButton.addEventListener("click", () => {
  const apiKey = elements.mapKeyInput.value.trim();
  if (!apiKey) return;
  localStorage.setItem("secretMoscowYandexKey", apiKey);
  initMap(apiKey);
});

renderAll();
const storedKey = localStorage.getItem("secretMoscowYandexKey");
if (DEFAULT_YANDEX_MAPS_KEY || storedKey) {
  initMap(DEFAULT_YANDEX_MAPS_KEY || storedKey);
} else {
  elements.mapKeyPanel.classList.remove("hidden");
}
