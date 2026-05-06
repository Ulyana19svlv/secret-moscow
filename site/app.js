const places = window.SECRET_MOSCOW_PLACES;
const DEFAULT_YANDEX_MAPS_KEY = "d0e7278b-1c42-448b-91c8-e17a315bbc82";
const categories = ["все", ...Array.from(new Set(places.map((place) => place.category)))];
const state = {
  category: "все",
  detailsHidden: true,
  mobileMapOpen: false,
  sheetDragStartY: null,
  search: "",
  selectedId: places[0].id,
  map: null,
  clusterer: null,
  placemarks: new Map()
};

const elements = {
  categoryStrip: document.querySelector("#categoryStrip"),
  closeMapButton: document.querySelector("#closeMapButton"),
  countLabel: document.querySelector("#countLabel"),
  detailsPanel: document.querySelector("#detailsPanel"),
  mapKeyInput: document.querySelector("#mapKeyInput"),
  mapKeyPanel: document.querySelector("#mapKeyPanel"),
  mapLoading: document.querySelector("#mapLoading"),
  mobileViewToggle: document.querySelector("#mobileViewToggle"),
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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getCategoryMeta(category) {
  return categoryMeta[category] || { icon: "map-pin", accent: "ink" };
}

function createIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setMapLoading(isLoading) {
  elements.mapLoading?.classList.toggle("hidden", !isLoading);
}

function setMobileMapOpen(isOpen) {
  state.mobileMapOpen = isOpen;
  document.body.classList.toggle("mobile-map-open", isOpen);
  const label = elements.mobileViewToggle?.querySelector("span");
  const icon = elements.mobileViewToggle?.querySelector("i");
  if (label) label.textContent = isOpen ? "Закрыть карту" : "Карта";
  if (icon) icon.setAttribute("data-lucide", "map");
  createIcons();
  if (isOpen && state.map) {
    setTimeout(() => state.map.container.fitToViewport(), 80);
  }
}

function syncDetailsState() {
  document.body.classList.toggle("details-open", !state.detailsHidden);
  elements.detailsPanel.classList.toggle("hidden", state.detailsHidden);
  elements.detailsPanel.setAttribute("aria-hidden", String(state.detailsHidden));
  if (state.detailsHidden) {
    elements.detailsPanel.setAttribute("inert", "");
  } else {
    elements.detailsPanel.removeAttribute("inert");
  }
}

function linkToYandex(place) {
  const text = encodeURIComponent(place.address || place.title);
  return `https://yandex.ru/maps/?text=${text}`;
}

function getPlaceMedia(place) {
  if (place.media) return place.media;
  if (place.links?.instagram) {
    return {
      type: "link",
      url: place.links.instagram,
      label: "Instagram / Reels",
      icon: "instagram"
    };
  }
  if (place.links?.telegram) {
    return {
      type: "link",
      url: place.links.telegram,
      label: "Telegram",
      icon: "send"
    };
  }
  return {
    type: "empty",
    label: "Фото / Reels",
    icon: "image-plus"
  };
}

function getInstagramEmbedUrl(url) {
  const match = String(url || "").match(/instagram\.com\/(p|reel|tv)\/([^/?#]+)/i);
  if (!match) return "";
  return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
}

function renderMediaContent(place, variant = "row") {
  const media = getPlaceMedia(place);
  const labelClass = variant === "details" ? "details-media-label" : "row-media-label";
  const icon = media.icon || (media.type === "video" ? "play" : "image");

  if (media.thumbnail && variant === "row") {
    return `<img src="${media.thumbnail}" alt="${media.alt || place.title}" loading="lazy" />`;
  }

  if (media.type === "instagram" && media.url) {
    const embedUrl = getInstagramEmbedUrl(media.url);
    if (variant === "details" && embedUrl) {
      return `<iframe class="instagram-embed" src="${embedUrl}" title="${place.title} в Instagram" loading="lazy" allowtransparency="true" allowfullscreen></iframe>`;
    }
    return `<span class="${labelClass}"><i data-lucide="instagram"></i><span>${media.label || "Instagram / Reels"}</span></span>`;
  }

  if (media.type === "image" && media.src) {
    return `<img src="${media.src}" alt="${media.alt || place.title}" loading="lazy" />`;
  }

  if (media.type === "video" && media.src) {
    return `<video src="${media.src}" ${variant === "details" ? "controls" : ""} muted playsinline preload="metadata"></video>`;
  }

  const label = media.label || "Медиа";
  const content = `<span class="${labelClass}"><i data-lucide="${icon}"></i><span>${label}</span></span>`;
  if (media.url && variant === "details") {
    return `<a href="${media.url}" target="_blank" rel="noreferrer">${content}</a>`;
  }
  return content;
}

function renderRowMedia(place) {
  const media = getPlaceMedia(place);
  const thumbnailClass = media.thumbnail ? " has-thumbnail" : "";
  return `<span class="row-media${thumbnailClass}">${renderMediaContent(place, "row")}</span>`;
}

function renderDetailsMedia(place) {
  return `<div class="details-media">${renderMediaContent(place, "details")}</div>`;
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

function reconcileSelection({ hideWhenChanged = true } = {}) {
  const visible = filteredPlaces();
  if (!visible.length) {
    state.selectedId = null;
    state.detailsHidden = true;
    return visible;
  }

  if (!visible.some((place) => place.id === state.selectedId)) {
    state.selectedId = visible[0].id;
    if (hideWhenChanged) state.detailsHidden = true;
  }

  return visible;
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
        ${renderRowMedia(place)}
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

function renderListWithTransition() {
  elements.placeList.classList.add("is-filtering");
  requestAnimationFrame(() => {
    renderList();
    requestAnimationFrame(() => elements.placeList.classList.remove("is-filtering"));
  });
}

function renderDetails() {
  const visible = filteredPlaces();
  const place = visible.find((item) => item.id === state.selectedId);
  if (!place) {
    state.detailsHidden = true;
    syncDetailsState();
    elements.detailsPanel.innerHTML = "";
    return;
  }
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
    <h2 id="detailsTitle">${place.title}</h2>
    <p class="address"><i data-lucide="map-pin"></i>${place.address}</p>
    ${renderDetailsMedia(place)}
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
  elements.detailsPanel.setAttribute("aria-labelledby", "detailsTitle");
  syncDetailsState();
  createIcons();
}

function selectPlace(id, focusMap = true, openDetails = true) {
  state.selectedId = id;
  state.detailsHidden = !openDetails;
  const place = places.find((item) => item.id === id);
  renderList();
  renderDetails();
  if (openDetails && window.matchMedia("(max-width: 768px)").matches) {
    setTimeout(() => elements.detailsPanel.querySelector("#closeDetailsButton")?.focus(), 60);
  }

  if (focusMap && state.map && place) {
    state.map.setCenter(place.coords, 14, { duration: prefersReducedMotion() ? 0 : 250 });
    const placemark = state.placemarks.get(id);
    if (placemark) placemark.balloon.open();
  }
}

function scrollToSelectedCard() {
  const row = elements.placeList.querySelector(`[data-id="${state.selectedId}"]`);
  if (!row) return;
  row.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function restoreFocusAfterDetailsClose() {
  if (state.mobileMapOpen) {
    elements.mobileViewToggle?.focus?.({ preventScroll: true });
    return;
  }
  const row = state.selectedId ? elements.placeList.querySelector(`[data-id="${state.selectedId}"]`) : null;
  const target = row || elements.mobileViewToggle || elements.placeList;
  target?.focus?.({ preventScroll: true });
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

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Yandex Maps loading timeout"));
    }, 12000);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    script.onload = () => window.ymaps.ready(() => finish(resolve));
    script.onerror = () => finish(() => reject(new Error("Yandex Maps script failed")));
    document.head.appendChild(script);
  });
}

function initMap(apiKey) {
  elements.mapKeyPanel.classList.add("hidden");
  setMapLoading(true);
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
    selectPlace(state.selectedId, true, !window.matchMedia("(max-width: 768px)").matches);
    setMapLoading(false);
  }).catch(() => {
    setMapLoading(false);
    elements.mapKeyPanel.classList.remove("hidden");
    elements.mapKeyPanel.classList.add("error");
  });
}

elements.categoryStrip.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  reconcileSelection();
  renderCategories();
  renderListWithTransition();
  renderDetails();
  syncMapVisibility();
});

elements.placeList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (!row) return;
  selectPlace(row.dataset.id);
});

elements.detailsPanel.addEventListener("click", (event) => {
  if (!event.target.closest("#closeDetailsButton")) return;
  state.detailsHidden = true;
  restoreFocusAfterDetailsClose();
  syncDetailsState();
});

elements.detailsPanel.addEventListener("pointerdown", (event) => {
  if (!window.matchMedia("(max-width: 768px)").matches) return;
  state.sheetDragStartY = null;
});

elements.detailsPanel.addEventListener("pointerup", (event) => {
  if (!window.matchMedia("(max-width: 768px)").matches || state.sheetDragStartY === null) return;
  const deltaY = event.clientY - state.sheetDragStartY;
  state.sheetDragStartY = null;
  if (deltaY < 80) return;
  state.detailsHidden = true;
  restoreFocusAfterDetailsClose();
  syncDetailsState();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  reconcileSelection();
  renderList();
  renderDetails();
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
  if (!visible.length) {
    state.selectedId = null;
    state.detailsHidden = true;
    renderDetails();
    return;
  }
  const place = visible[Math.floor(Math.random() * visible.length)];
  selectPlace(place.id);
  scrollToSelectedCard();
  const row = elements.placeList.querySelector(`[data-id="${place.id}"]`);
  if (!row) return;
  row.classList.add("is-random-pick");
  setTimeout(() => row.classList.remove("is-random-pick"), 700);
});

elements.mobileViewToggle.addEventListener("click", () => {
  setMobileMapOpen(!state.mobileMapOpen);
});

elements.closeMapButton?.addEventListener("click", () => {
  setMobileMapOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.mobileMapOpen) setMobileMapOpen(false);
});

elements.saveMapKeyButton.addEventListener("click", () => {
  const apiKey = elements.mapKeyInput.value.trim();
  if (!apiKey) return;
  localStorage.setItem("secretMoscowYandexKey", apiKey);
  initMap(apiKey);
});

if (!window.matchMedia("(max-width: 768px)").matches) {
  state.detailsHidden = false;
}

renderAll();
const storedKey = localStorage.getItem("secretMoscowYandexKey");
if (DEFAULT_YANDEX_MAPS_KEY || storedKey) {
  initMap(storedKey || DEFAULT_YANDEX_MAPS_KEY);
} else {
  elements.mapKeyPanel.classList.remove("hidden");
}
