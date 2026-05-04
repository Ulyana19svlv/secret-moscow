const places = window.SECRET_MOSCOW_PLACES;
const DEFAULT_YANDEX_MAPS_KEY = "d0e7278b-1c42-448b-91c8-e17a315bbc82";
const categories = ["все", ...Array.from(new Set(places.map((place) => place.category)))];
const state = {
  category: "все",
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

function createIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function linkToYandex(place) {
  const text = encodeURIComponent(place.address || place.title);
  return `https://yandex.ru/maps/?text=${text}`;
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
    return `<button class="category-chip ${active}" data-category="${category}">${category}</button>`;
  }).join("");
}

function renderList() {
  const visible = filteredPlaces();
  elements.countLabel.textContent = `${visible.length} мест`;
  elements.placeList.innerHTML = visible.map((place) => {
    const active = place.id === state.selectedId ? "active" : "";
    return `
      <button class="place-row ${active}" data-id="${place.id}">
        <span class="row-title">${place.title}</span>
        <span class="row-meta">${place.category}</span>
      </button>
    `;
  }).join("");
}

function renderDetails() {
  const place = places.find((item) => item.id === state.selectedId) || filteredPlaces()[0] || places[0];
  if (!place) return;

  const links = [
    place.links.site && ["Сайт", "globe", place.links.site],
    place.links.instagram && ["Instagram", "instagram", place.links.instagram],
    place.links.telegram && ["Telegram", "send", place.links.telegram],
    ["Яндекс", "map-pinned", linkToYandex(place)]
  ].filter(Boolean);

  elements.detailsPanel.innerHTML = `
    <div class="details-top">
      <span class="details-category">${place.category}</span>
      <button class="icon-button compact" id="closeDetailsButton" title="Свернуть" aria-label="Свернуть">
        <i data-lucide="panel-right-close"></i>
      </button>
    </div>
    <h2>${place.title}</h2>
    <p class="address"><i data-lucide="map-pin"></i>${place.address}</p>
    <p>${place.description}</p>
    <div class="tag-cloud">${place.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
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
if (storedKey || DEFAULT_YANDEX_MAPS_KEY) {
  initMap(storedKey || DEFAULT_YANDEX_MAPS_KEY);
} else {
  elements.mapKeyPanel.classList.remove("hidden");
}
