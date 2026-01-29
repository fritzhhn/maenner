/* global maplibregl */

const STORAGE_KEY = "berlin-map-notes:v1";

const $ = (id) => document.getElementById(id);
/** @type {HTMLElement|null} */
let statusEl = null;
/** @type {HTMLFormElement|null} */
let formEl = null;
/** @type {HTMLTextAreaElement|null} */
let noteEl = null;
/** @type {HTMLButtonElement|null} */
let sendBtn = null;
/** @type {HTMLButtonElement|null} */
let cancelBtn = null;
/** @type {HTMLButtonElement|null} */
let closeBtn = null;
/** @type {HTMLElement|null} */
let modalEl = null;
/** @type {HTMLElement|null} */
let clickedCoordsEl = null;
/** @type {HTMLButtonElement|null} */
let hamburgerBtn = null;
/** @type {HTMLElement|null} */
let menuOverlay = null;
/** @type {HTMLButtonElement|null} */
let locationBtn = null;
/** @type {HTMLElement|null} */
let leftControlsEl = null;

/** @type {{id:string, note:string, lng:number, lat:number, createdAt:number}[]} */
let notes = [];
/** @type {maplibregl.Map} */
let map;
/** @type {Map<string, maplibregl.Marker>} */
const markersById = new Map();
/** @type {{lng:number, lat:number}|null} */
let pendingPoint = null;
/** @type {maplibregl.Marker|null} */
let previewMarker = null;
/** @type {maplibregl.Marker|null} */
let pendingSubmitMarker = null;
/** @type {string|null} */
let cachedPin1Svg = null;
/** @type {string|null} */
let cachedPin2Svg = null;
/** @type {string|null} */
let cachedPin3Svg = null;
/** @type {maplibregl.Popup|null} */
let addNotePopup = null;
/** @type {maplibregl.Popup|null} */
let openMarkerPopup = null;
/** @type {string|null} */
let openMarkerPopupId = null;
/** When true, popup "open" handler should not fly (we already flew from submit path). */
let skipNextPopupOpenFly = false;

function namespaceSvgClasses(svgText, prefix) {
  if (!svgText || typeof svgText !== "string") return svgText;
  // Avoid SVG <style> class name collisions across multiple inline SVGs.
  return svgText
    .replaceAll('class="st0"', `class="${prefix}-st0"`)
    .replaceAll(".st0", `.${prefix}-st0`);
}

/** Force marker pin fill color so inline SVG &lt;style&gt; doesn't override our CSS. */
function setMarkerFill(svgText, fillHex) {
  if (!svgText || typeof svgText !== "string") return svgText;
  return svgText.replace(
    /fill:\s*#?[0-9a-fA-F]{3,8}/g,
    `fill: ${fillHex.startsWith("#") ? fillHex : "#" + fillHex}`
  );
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
  else if (msg) console.warn(msg);
}

function isWebglSupported() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (n) =>
          n &&
          typeof n.id === "string" &&
          typeof n.note === "string" &&
          typeof n.lng === "number" &&
          typeof n.lat === "number" &&
          (typeof n.createdAt === "number" || typeof n.createdAt === "undefined"),
      )
      .map((n) => {
        // Back-compat: older notes didn't store createdAt.
        // Try to infer from id prefix (makeId() starts with Date.now()).
        let createdAt = Date.now();
        if (typeof n.createdAt === "number") createdAt = n.createdAt;
        else {
          const prefix = String(n.id).split("-")[0];
          const inferred = Number(prefix);
          if (Number.isFinite(inferred) && inferred > 0) createdAt = inferred;
        }
        return { ...n, createdAt };
      })
      .slice(0, 500);
  } catch {
    return [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCoords(lng, lat) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatCreatedAt(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

// Preload SVG files and cache them
async function loadSvgFiles() {
  try {
    const [pin1Response, pin2Response, pin3Response] = await Promise.all([
      fetch("pin1.svg"),
      fetch("pin2.svg"),
      fetch("pin3.svg"),
    ]);
    
    if (pin1Response.ok) {
      cachedPin1Svg = setMarkerFill(
        namespaceSvgClasses(await pin1Response.text(), "pin1"),
        "#cd1719"
      );
    } else {
      console.warn("Failed to load pin1.svg, using fallback");
      cachedPin1Svg = null;
    }
    
    if (pin2Response.ok) {
      cachedPin2Svg = setMarkerFill(
        namespaceSvgClasses(await pin2Response.text(), "pin2"),
        "#cd1719"
      );
    } else {
      console.warn("Failed to load pin2.svg, using fallback");
      cachedPin2Svg = null;
    }

    if (pin3Response.ok) {
      cachedPin3Svg = setMarkerFill(
        namespaceSvgClasses(await pin3Response.text(), "pin3"),
        "#cd1719"
      );
    } else {
      console.warn("Failed to load pin3.svg, using fallback");
      cachedPin3Svg = null;
    }
  } catch (error) {
    console.error("Error loading SVG files:", error);
    // If fetch fails (e.g., file:// protocol), use embedded fallback
    cachedPin1Svg = null;
    cachedPin2Svg = null;
    cachedPin3Svg = null;
  }
}

function createCustomMarkerElement() {
  // Use cached SVG content if available, otherwise use fallback
  const pin1Svg = cachedPin1Svg || `
    <svg id="Ebene_1" data-name="Ebene 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.24 20.23" style="width: 100%; height: 100%; display: block;">
      <polygon points="5.1 17.95 8.63 10.13 8.63 8.12 5.1 8.12 8.63 5.37 9.61 1.83 2.38 .57 1.85 2.13 7.12 3.13 6.6 4.76 .5 6.57 .5 9.26 5.05 11.13 5.1 17.95"/>
      <path d="M4.62,20.23l-.06-8.77-4.55-1.87v-3.4l6.2-1.84.27-.84L1.19,2.51l.85-2.51,8.2,1.43-1.17,4.23-2.51,1.96h2.57l-.04,2.72-4.47,9.9ZM1,8.92l4.55,1.87.04,4.87,2.55-5.64v-1.4H3.64l4.55-3.54.79-2.85L2.72,1.13l-.21.61,5.26,1-.77,2.42-6,1.78v1.98Z"/>
    </svg>
  `;
  
  const pin2Svg = cachedPin2Svg || `
    <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 10.23 20.24" style="width: 100%; height: 100%; display: block;">
      <defs>
        <style>
          .st0 {
            fill: #e81faa;
            stroke: #e81faa;
            stroke-miterlimit: 10;
            stroke-width: 1px;
          }
        </style>
      </defs>
      <polygon class="st0" points="5.1 17.95 8.63 10.13 8.63 8.12 5.1 8.12 8.63 5.37 9.61 1.83 2.38 .57 1.85 2.13 7.12 3.13 6.6 4.76 .5 6.57 .5 9.26 5.05 11.13 5.1 17.95"/>
    </svg>
  `;
  
  // Outer container - MapLibre controls this for positioning
  // DO NOT apply transforms to this element!
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.style.display = "block";
  el.style.userSelect = "none";
  el.style.pointerEvents = "auto";
  
  // Set the display size based on SVG aspect ratio (viewBox is 10.24 x 20.23)
  const markerWidth = 32;
  const markerHeight = Math.round((markerWidth * 20.23) / 10.24);
  
  el.style.width = `${markerWidth}px`;
  el.style.height = `${markerHeight}px`;
  
  // Inner container - we can change SVG content here without affecting MapLibre's positioning
  const inner = document.createElement("div");
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.transition = "opacity 0.3s ease";
  inner.style.position = "relative";
  
  // Create two layers for smooth crossfade transition
  const pin1Layer = document.createElement("div");
  pin1Layer.style.width = "100%";
  pin1Layer.style.height = "100%";
  pin1Layer.style.position = "absolute";
  pin1Layer.style.top = "0";
  pin1Layer.style.left = "0";
  pin1Layer.style.transition = "opacity 0.3s ease";
  pin1Layer.style.opacity = "1";
  pin1Layer.innerHTML = pin1Svg;
  
  const pin2Layer = document.createElement("div");
  pin2Layer.style.width = "100%";
  pin2Layer.style.height = "100%";
  pin2Layer.style.position = "absolute";
  pin2Layer.style.top = "0";
  pin2Layer.style.left = "0";
  pin2Layer.style.transition = "opacity 0.3s ease";
  pin2Layer.style.opacity = "0";
  pin2Layer.innerHTML = pin2Svg;
  
  inner.appendChild(pin1Layer);
  inner.appendChild(pin2Layer);
  el.appendChild(inner);
  
  // Add hover effect - crossfade between pin1 and pin2
  el.addEventListener("mouseenter", () => {
    pin1Layer.style.opacity = "0";
    pin2Layer.style.opacity = "1";
  });
  el.addEventListener("mouseleave", () => {
    pin1Layer.style.opacity = "1";
    pin2Layer.style.opacity = "0";
  });
  
  el.setAttribute("data-marker", "true");
  
  return el;
}

/** Preview pin for "preview" placement (first click); no hover. */
function createPreviewMarkerElement() {
  // Prefer pin3.svg for the preview state; fall back to pin1 if missing.
  const previewSvg = cachedPin3Svg || cachedPin1Svg || `
    <svg id="Ebene_1" data-name="Ebene 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.24 20.23" style="width: 100%; height: 100%; display: block;">
      <polygon points="5.1 17.95 8.63 10.13 8.63 8.12 5.1 8.12 8.63 5.37 9.61 1.83 2.38 .57 1.85 2.13 7.12 3.13 6.6 4.76 .5 6.57 .5 9.26 5.05 11.13 5.1 17.95"/>
      <path d="M4.62,20.23l-.06-8.77-4.55-1.87v-3.4l6.2-1.84.27-.84L1.19,2.51l.85-2.51,8.2,1.43-1.17,4.23-2.51,1.96h2.57l-.04,2.72-4.47,9.9ZM1,8.92l4.55,1.87.04,4.87,2.55-5.64v-1.4H3.64l4.55-3.54.79-2.85L2.72,1.13l-.21.61,5.26,1-.77,2.42-6,1.78v1.98Z"/>
    </svg>
  `;
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.style.display = "block";
  el.style.userSelect = "none";
  el.style.pointerEvents = "auto";
  const markerWidth = 32;
  const markerHeight = Math.round((markerWidth * 20.23) / 10.24);
  const hitboxExtraBottom = 12;
  el.style.width = `${markerWidth}px`;
  el.style.height = `${markerHeight}px`;
  el.style.position = "relative";
  const inner = document.createElement("div");
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.innerHTML = previewSvg;
  el.appendChild(inner);
  const hitExtension = document.createElement("div");
  hitExtension.setAttribute("data-preview-marker", "true");
  hitExtension.style.position = "absolute";
  hitExtension.style.left = "0";
  hitExtension.style.right = "0";
  hitExtension.style.bottom = `-${hitboxExtraBottom}px`;
  hitExtension.style.height = `${hitboxExtraBottom}px`;
  hitExtension.style.pointerEvents = "auto";
  el.appendChild(hitExtension);
  el.setAttribute("data-preview-marker", "true");
  return el;
}

/** Build form content for the add-note popup (same look as marker popup). */
function createAddNotePopupContent() {
  const form = document.createElement("form");
  form.className = "addNotePopupForm";
  const textarea = document.createElement("textarea");
  textarea.placeholder = "";
  textarea.rows = 5;
  textarea.name = "note";
  textarea.setAttribute("required", "");
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = "+";
  form.appendChild(textarea);
  form.appendChild(btn);
  // Stop click from bubbling to map so closeOnClick doesn't close popup before submit
  form.addEventListener("click", (e) => e.stopPropagation());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const noteText = textarea.value.trim();
    if (!noteText || !pendingPoint) return;
    submitNoteFromPopup(noteText, btn);
  });
  return form;
}

function openAddNotePopup(lngLat) {
  if (addNotePopup) {
    addNotePopup.remove();
    addNotePopup = null;
  }
  const content = createAddNotePopupContent();
  const center = Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat];
  const popupOptions = {
    anchor: "bottom",
    offset: [0, -GAP_ABOVE_MARKER],
    closeButton: true,
    closeOnClick: true,
  };
  addNotePopup = new maplibregl.Popup(popupOptions)
    .setLngLat(center)
    .setDOMContent(content)
    .addTo(map);
  const flyCenter = getCenterLngLatWithMarkerBelow(center, MARKER_OFFSET_BELOW_CENTER);
  map.flyTo({ center: flyCenter, zoom: map.getZoom() });
  addNotePopup.on("close", () => {
    closeAddNotePopup();
  });
  // Focus when popup is open and layout is done so the caret sits at top-left of textarea
  addNotePopup.once("open", () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = content.querySelector("textarea");
        if (ta) {
          ta.value = "";
          ta.focus();
          ta.setSelectionRange(0, 0);
        }
      });
    });
  });
}

function closeAddNotePopup() {
  if (addNotePopup) {
    addNotePopup.remove();
    addNotePopup = null;
  }
  if (pendingSubmitMarker) {
    pendingSubmitMarker.remove();
    pendingSubmitMarker = null;
  }
  pendingPoint = null;
}

function submitNoteFromPopup(noteText, buttonEl) {
  if (!noteText || !pendingPoint) return;
  buttonEl.disabled = true;
  setStatus("");
  try {
    const item = {
      id: makeId(),
      note: noteText,
      lng: pendingPoint.lng,
      lat: pendingPoint.lat,
      createdAt: Date.now(),
    };
    notes.unshift(item);
    saveNotes();
    if (pendingSubmitMarker) {
      pendingSubmitMarker.getElement().setAttribute("data-note-id", item.id);
      markersById.set(item.id, pendingSubmitMarker);
      pendingSubmitMarker = null;
    } else {
      if (previewMarker) {
        previewMarker.remove();
        previewMarker = null;
      }
      addMarker(item);
    }
    // Close add-note popup first so keyboard closes and viewport is stable before flyTo
    closeAddNotePopup();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const targetZoom = Math.max(map.getZoom(), 14);
    const flyCenter = getCenterLngLatWithMarkerBelowAtZoom([item.lng, item.lat], MARKER_OFFSET_BELOW_CENTER, targetZoom);
    // Run flyTo after a tick so layout/viewport has settled (avoids UI jumping on mobile)
    requestAnimationFrame(() => {
      if (!map) return;
      map.flyTo({ center: flyCenter, zoom: targetZoom });
      skipNextPopupOpenFly = true;
      openOrToggleMarkerPopup(item.id);
    });
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Something went wrong.");
  } finally {
    buttonEl.disabled = false;
  }
}

const GAP_ABOVE_MARKER = 80; // gap between popup tip and top of marker (popup above marker)
const MARKER_OFFSET_BELOW_CENTER = 200; // when centering on marker, place marker this many px below visual center

/** Return center lngLat so that the given point appears offsetPx pixels below the visual center after flyTo. */
function getCenterLngLatWithMarkerBelow(lngLat, offsetPx) {
  const point = map.project(lngLat);
  return map.unproject([point.x, point.y - offsetPx]);
}

/**
 * Return center lngLat at targetZoom so that the given point appears offsetPx pixels below the visual center.
 * Use this when flying to a marker from a different view (e.g. after adding a note) so we don't zoom in place.
 */
function getCenterLngLatWithMarkerBelowAtZoom(lngLat, offsetPx, targetZoom) {
  const savedCenter = map.getCenter();
  const savedZoom = map.getZoom();
  map.setCenter(lngLat);
  map.setZoom(targetZoom);
  const flyCenter = getCenterLngLatWithMarkerBelow(lngLat, offsetPx);
  map.setCenter(savedCenter);
  map.setZoom(savedZoom);
  return flyCenter;
}

/** Open or toggle the note popup for a marker (standalone Popup so anchor/offset are respected). */
function openOrToggleMarkerPopup(noteId) {
  const note = notes.find((n) => n.id === noteId);
  const marker = markersById.get(noteId);
  if (!note || !marker) return;
  if (openMarkerPopupId === noteId) {
    if (openMarkerPopup) openMarkerPopup.remove();
    openMarkerPopup = null;
    openMarkerPopupId = null;
    return;
  }
  if (openMarkerPopup) openMarkerPopup.remove();
  const popup = new maplibregl.Popup({
    anchor: "bottom",
    offset: [0, -GAP_ABOVE_MARKER],
    closeButton: true,
    closeOnClick: true,
  })
    .setLngLat(marker.getLngLat())
    .setText(note.note)
    .addTo(map);
  popup.on("close", () => {
    openMarkerPopup = null;
    openMarkerPopupId = null;
  });
  popup.on("open", () => {
    if (skipNextPopupOpenFly) {
      skipNextPopupOpenFly = false;
      return;
    }
    const flyCenter = getCenterLngLatWithMarkerBelow(marker.getLngLat(), MARKER_OFFSET_BELOW_CENTER);
    map.flyTo({ center: flyCenter, zoom: map.getZoom() });
  });
  openMarkerPopup = popup;
  openMarkerPopupId = noteId;
}

/** Popup options for add-note form and legacy paths. Use forMarker: true for marker popup (unused when using openOrToggleMarkerPopup). */
function getPopupOptions(lng, lat, opts) {
  if (opts?.forMarker) {
    return { anchor: "bottom", offset: [0, -GAP_ABOVE_MARKER] };
  }
  const gapAboveMarker = 80;
  const gapBelowMarker = 80;
  const markerCenterY = 31;
  const sideGap = -40;
  return {
    offset: {
      "top": [0, gapBelowMarker],
      "top-left": [0, gapBelowMarker],
      "top-right": [0, gapBelowMarker],
      "bottom": [0, -gapAboveMarker],
      "bottom-left": [0, -gapAboveMarker],
      "bottom-right": [0, -gapAboveMarker],
      "left": [-sideGap, -markerCenterY],
      "right": [sideGap, -markerCenterY],
      "center": [0, gapBelowMarker / 2],
    },
  };
}

function addMarker(note) {
  const markerElement = createCustomMarkerElement();
  markerElement.setAttribute("data-note-id", note.id);

  const marker = new maplibregl.Marker({
    element: markerElement,
    anchor: "bottom",
  })
    .setLngLat([note.lng, note.lat])
    .addTo(map);

  markersById.set(note.id, marker);
}

function removeAllMarkers() {
  for (const marker of markersById.values()) {
    marker.remove();
  }
  markersById.clear();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initMap() {
  if (window.location.protocol === "file:") {
    setStatus(
      "Open this page via http:// (e.g. run: python3 -m http.server 5173, then visit http://localhost:5173). file:// often breaks map rendering.",
    );
    return;
  }

  if (typeof maplibregl === "undefined") {
    setStatus(
      "Map library failed to load. Check your internet connection and reload.",
    );
    return;
  }

  if (typeof maplibregl.Map !== "function") {
    setStatus("Map library loaded, but Map constructor is missing.");
    return;
  }

  // Some builds don't expose maplibregl.supported(); do our own WebGL check.
  if (!isWebglSupported()) {
    setStatus(
      "Your browser does not support WebGL (required to display the map).",
    );
    return;
  }

  // Customize colors for map features
  const buildingColor = "#bababa"; // Buildings color - dark grey
  const waterColor = "#a8d5e2"; // Water color
  const parkColor = "#97c4a8"; // All previously green areas - regardless of hue
  const baseColor = "#e0e0e0"; // Base/background color - light grey

  // Use OpenFreeMap vector tiles (free, no API key, supports styling)
  // This is the same source used in MapLibre official examples
  setStatus("Loading map…");
  map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/bright",
    center: [13.405, 52.52], // Berlin
    zoom: 11.2,
    attributionControl: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

  // Shorten attribution text when control is in DOM (no API to replace; style shows MapLibre + OpenFreeMap)
  const shortenAttribution = () => {
    const inner = map.getContainer().querySelector(".maplibregl-ctrl-attrib-inner");
    if (inner && inner.textContent && !inner.dataset.shortened) {
      inner.textContent = "© MapLibre · OpenFreeMap";
      inner.dataset.shortened = "true";
    }
  };
  map.on("load", () => {
    requestAnimationFrame(shortenAttribution);
    setTimeout(shortenAttribution, 100);
  });
  requestAnimationFrame(shortenAttribution);
  setTimeout(shortenAttribution, 500);

  // Handle style loading errors
  map.on("error", (e) => {
    const msg =
      e && e.error && typeof e.error.message === "string"
        ? e.error.message
        : null;
    if (msg) {
      setStatus(`Map error: ${msg}`);
      console.error("Map error:", e);
    }
  });

  // Apply custom colors when map loads (following MapLibre docs pattern)
  map.on("load", () => {
    try {
      // Style base/background color - only set on actual background type layers
      const style = map.getStyle();
      if (style && style.layers) {
        // Find background type layers (they don't have a source)
        const bgLayers = style.layers.filter(l => l.type === "background");
        bgLayers.forEach(layer => {
          map.setPaintProperty(layer.id, "background-color", baseColor);
        });
      }
      
      // Style buildings - use 'building-top' layer as shown in MapLibre docs
      if (map.getLayer("building-top")) {
        map.setPaintProperty("building-top", "fill-color", buildingColor);
      }
      // Also try other building layer names
      if (map.getLayer("building")) {
        map.setPaintProperty("building", "fill-color", buildingColor);
      }
      
      // Style water - use 'fill-color' for fill layers, 'line-color' for line layers
      if (map.getLayer("water")) {
        map.setPaintProperty("water", "fill-color", waterColor);
      }
      if (map.getLayer("waterway")) {
        const waterwayLayer = map.getLayer("waterway");
        if (waterwayLayer && waterwayLayer.type === "line") {
          map.setPaintProperty("waterway", "line-color", waterColor);
        } else if (waterwayLayer && waterwayLayer.type === "fill") {
          map.setPaintProperty("waterway", "fill-color", waterColor);
        }
      }
      
      // Style all green/nature areas - based on actual layer names from the style
      // All layers that were green (any hue) should be #68997a
      const greenLayers = [
        "park",
        "landcover-wood",
        "landcover-grass",
        "landcover-grass-park",
        "landuse-cemetery"
      ];
      
      greenLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          const layer = map.getLayer(layerId);
          if (layer && layer.type === "fill") {
            // Set fill color
            map.setPaintProperty(layerId, "fill-color", parkColor);
            // Also set opacity to 1 to ensure consistent color (no transparency affecting saturation)
            if (map.getPaintProperty(layerId, "fill-opacity") !== undefined) {
              map.setPaintProperty(layerId, "fill-opacity", 1);
            }
          }
        }
      });
      
      // Check for any other layers that might be green - look for layers with "green" or nature-related names
      if (style && style.layers) {
        const allLayers = style.layers;
        allLayers.forEach(layer => {
          const layerId = layer.id;
          // Check if layer name suggests it might be green/nature
          if ((layerId.includes("park") ||
               layerId.includes("wood") ||
               layerId.includes("grass") ||
               layerId.includes("forest") ||
               layerId.includes("cemetery") ||
               layerId.includes("nature") ||
               layerId.includes("green")) &&
              layer.type === "fill" &&
              !greenLayers.includes(layerId)) {
            try {
              map.setPaintProperty(layerId, "fill-color", parkColor);
              if (map.getPaintProperty(layerId, "fill-opacity") !== undefined) {
                map.setPaintProperty(layerId, "fill-opacity", 1);
              }
            } catch (e) {
              console.warn("Could not style layer", layerId, e);
            }
          }
        });
      }
      
      // Style non-green landuse areas to base color (everything under buildings)
      const baseLanduseLayers = [
        "landuse-residential",
        "landuse-suburb",
        "landuse-commercial",
        "landuse-industrial",
        "landuse-hospital",
        "landuse-school",
        "landuse-railway"
      ];
      
      baseLanduseLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          const layer = map.getLayer(layerId);
          if (layer && layer.type === "fill") {
            map.setPaintProperty(layerId, "fill-color", baseColor);
          }
        }
      });
      
    } catch (error) {
      console.error("Error applying custom colors:", error);
      // Don't prevent map from loading if styling fails
    }
    
    // Load and display markers
    notes = loadNotes();
    for (const n of notes) addMarker(n);
    setStatus(notes.length ? `Loaded ${notes.length} pin(s).` : "");
    requestAnimationFrame(shortenAttribution);
    setTimeout(shortenAttribution, 400);
  });

  // Position zoom controls on bottom-right (MapLibre docs: addControl second arg = position)
  map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");

  // Resize map when viewport changes (fixes iOS Safari address bar / rotation).
  // Defer resize until after flyTo/move so UI doesn't jump during zoom animation.
  const onResize = () => {
    if (!map) return;
    if (typeof map.isMoving === "function" && map.isMoving()) {
      map.once("moveend", () => {
        if (map) map.resize();
      });
      return;
    }
    map.resize();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => {
    setTimeout(onResize, 100);
  });
  map.on("load", () => {
    requestAnimationFrame(onResize);
    setTimeout(onResize, 200);
  });

  map.on("click", (e) => {
    if (!map) return;

    const originalEvent = e.originalEvent;
    const target = originalEvent && originalEvent.target ? originalEvent.target : null;
    const clickedPreview = target && target.closest && target.closest('[data-preview-marker="true"]');
    const clickedSavedMarker = target && target.closest && target.closest('[data-marker="true"]');

    // Click on saved note marker: open/toggle our popup above the marker (standalone Popup so anchor works)
    if (clickedSavedMarker && !clickedPreview) {
      const noteId = clickedSavedMarker.getAttribute("data-note-id");
      if (noteId) openOrToggleMarkerPopup(noteId);
      return;
    }

    // Click on preview marker: confirm placement → normal pin, open add-note popup
    if (clickedPreview && previewMarker) {
      const lngLat = previewMarker.getLngLat();
      pendingPoint = { lng: lngLat.lng, lat: lngLat.lat };
      previewMarker.remove();
      previewMarker = null;
      const normalEl = createCustomMarkerElement();
      pendingSubmitMarker = new maplibregl.Marker({
        element: normalEl,
        anchor: "bottom",
      })
        .setLngLat([pendingPoint.lng, pendingPoint.lat])
        .addTo(map);
      openAddNotePopup([pendingPoint.lng, pendingPoint.lat]);
      return;
    }

    // Click on empty map: place or replace grey preview pin (no modal)
    if (previewMarker) {
      previewMarker.remove();
      previewMarker = null;
    }
    const previewEl = createPreviewMarkerElement();
    previewMarker = new maplibregl.Marker({
      element: previewEl,
      anchor: "bottom",
    })
      .setLngLat(e.lngLat)
      .addTo(map);
  });
}

async function onSubmit(e) {
  e.preventDefault();
  setStatus("");

  const noteText = noteEl.value.trim();
  if (!noteText || !pendingPoint) return;

  sendBtn.disabled = true;
  setStatus("");

  try {
    const item = {
      id: makeId(),
      note: noteText,
      lng: pendingPoint.lng,
      lat: pendingPoint.lat,
      createdAt: Date.now(),
    };

    notes.unshift(item);
    saveNotes();

    if (pendingSubmitMarker) {
      pendingSubmitMarker.getElement().setAttribute("data-note-id", item.id);
      markersById.set(item.id, pendingSubmitMarker);
      pendingSubmitMarker = null;
    } else {
      if (previewMarker) {
        previewMarker.remove();
        previewMarker = null;
      }
      addMarker(item);
    }

    const targetZoom = Math.max(map.getZoom(), 14);
    const flyCenter = getCenterLngLatWithMarkerBelowAtZoom([item.lng, item.lat], MARKER_OFFSET_BELOW_CENTER, targetZoom);
    map.flyTo({ center: flyCenter, zoom: targetZoom });
    skipNextPopupOpenFly = true;
    openOrToggleMarkerPopup(item.id);

    closeAddNotePopup();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Something went wrong.");
  } finally {
    sendBtn.disabled = false;
  }
}

function toggleMenu() {
  if (!menuOverlay || !hamburgerBtn) return;
  const isOpen = menuOverlay.classList.contains("open");
  const iconEl = hamburgerBtn.querySelector(".hamburgerIcon");
  if (isOpen) {
    menuOverlay.classList.remove("open");
    menuOverlay.setAttribute("aria-hidden", "true");
    hamburgerBtn.classList.remove("menuOpen");
    if (iconEl) {
      iconEl.innerHTML = '<svg viewBox="0 0 24 18" xmlns="http://www.w3.org/2000/svg"><rect y="0" width="24" height="1" fill="black"/><rect y="8.5" width="24" height="1" fill="black"/><rect y="17" width="24" height="1" fill="black"/></svg>';
    }
    hamburgerBtn.setAttribute("aria-label", "Open menu");
    // Move hamburger back into left controls and remove spacer
    if (leftControlsEl && hamburgerBtn.parentElement !== leftControlsEl) {
      const spacer = leftControlsEl.querySelector(".hamburgerSpacer");
      if (spacer) spacer.remove();
      leftControlsEl.insertBefore(hamburgerBtn, leftControlsEl.firstChild);
    }
  } else {
    menuOverlay.classList.add("open");
    menuOverlay.setAttribute("aria-hidden", "false");
    hamburgerBtn.classList.add("menuOpen");
    if (iconEl) {
      iconEl.innerHTML = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M1 1 L17 17 M17 1 L1 17" stroke="black" stroke-width="1" stroke-linecap="round"/></svg>';
    }
    hamburgerBtn.setAttribute("aria-label", "Close menu");
    // Move hamburger to body so it stacks above the menu (z-index works)
    leftControlsEl = hamburgerBtn.parentElement;
    const spacer = document.createElement("div");
    spacer.className = "hamburgerSpacer";
    spacer.setAttribute("aria-hidden", "true");
    leftControlsEl.insertBefore(spacer, hamburgerBtn);
    document.body.appendChild(hamburgerBtn);
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by your browser.");
    return;
  }

  if (!map) {
    setStatus("Map is not ready yet.");
    return;
  }

  if (locationBtn) {
    locationBtn.disabled = true;
  }
  setStatus("Getting your location…");

  // Try with high accuracy first, but with longer timeout
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { longitude, latitude } = position.coords;
      map.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 15),
      });

      if (previewMarker) {
        previewMarker.remove();
        previewMarker = null;
      }
      const previewEl = createPreviewMarkerElement();
      previewMarker = new maplibregl.Marker({
        element: previewEl,
        anchor: "bottom",
      })
        .setLngLat([longitude, latitude])
        .addTo(map);

      pendingPoint = { lng: longitude, lat: latitude };
      openAddNotePopup([longitude, latitude]);

      setStatus(`Centered on your location: ${formatCoords(longitude, latitude)}`);
      if (locationBtn) {
        locationBtn.disabled = false;
      }
    },
    (error) => {
      // If timeout or unavailable, try again with less strict options
      if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
        setStatus("Trying again with less precise location…");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { longitude, latitude } = position.coords;
            map.flyTo({
              center: [longitude, latitude],
              zoom: Math.max(map.getZoom(), 15),
            });

            if (previewMarker) {
              previewMarker.remove();
              previewMarker = null;
            }
            const previewEl = createPreviewMarkerElement();
            previewMarker = new maplibregl.Marker({
              element: previewEl,
              anchor: "bottom",
            })
              .setLngLat([longitude, latitude])
              .addTo(map);

            pendingPoint = { lng: longitude, lat: latitude };
            openAddNotePopup([longitude, latitude]);

            setStatus(`Centered on your location: ${formatCoords(longitude, latitude)}`);
            if (locationBtn) {
              locationBtn.disabled = false;
            }
          },
          (error2) => {
            let errorMsg = "Unable to get your location.";
            if (error2.code === error2.PERMISSION_DENIED) {
              errorMsg = "Location access denied. Please enable location permissions in your browser settings.";
            } else if (error2.code === error2.POSITION_UNAVAILABLE) {
              errorMsg = "Location information unavailable. Check your GPS/WiFi settings.";
            } else if (error2.code === error2.TIMEOUT) {
              errorMsg = "Location request timed out. Please try again or check your connection.";
            }
            setStatus(errorMsg);
            if (locationBtn) {
              locationBtn.disabled = false;
            }
          },
          {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 60000, // Accept cached location up to 1 minute old
          },
        );
      } else {
        let errorMsg = "Unable to get your location.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "Location access denied. Please enable location permissions in your browser settings.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = "Location information unavailable. Check your GPS/WiFi settings.";
        }
        setStatus(errorMsg);
        if (locationBtn) {
          locationBtn.disabled = false;
        }
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    },
  );
}

function onModalClick(e) {
  const target = /** @type {HTMLElement|null} */ (e.target);
  if (target && target.hasAttribute("data-close")) closeAddNotePopup();
}

function initApp() {
  statusEl = null; // Status bar removed
  formEl = /** @type {HTMLFormElement|null} */ ($("noteForm"));
  noteEl = /** @type {HTMLTextAreaElement|null} */ ($("noteInput"));
  sendBtn = /** @type {HTMLButtonElement|null} */ ($("sendBtn"));
  cancelBtn = /** @type {HTMLButtonElement|null} */ ($("cancelBtn"));
  closeBtn = /** @type {HTMLButtonElement|null} */ ($("closeBtn"));
  modalEl = $("modal");
  clickedCoordsEl = $("clickedCoords");
  hamburgerBtn = /** @type {HTMLButtonElement|null} */ ($("hamburgerBtn"));
  menuOverlay = $("menuOverlay");
  locationBtn = /** @type {HTMLButtonElement|null} */ ($("locationBtn"));

  if (
    !formEl ||
    !noteEl ||
    !sendBtn ||
    !cancelBtn ||
    !closeBtn ||
    !modalEl ||
    !clickedCoordsEl
  ) {
    // If this happens, the HTML structure doesn't match what the script expects.
    alert("Setup error: required UI elements not found. Check index.html.");
    return;
  }

  window.addEventListener("error", (ev) => {
    if (ev && typeof ev.message === "string" && ev.message) {
      setStatus(`Error: ${ev.message}`);
    }
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev && "reason" in ev ? ev.reason : null;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : null;
    if (msg) setStatus(`Error: ${msg}`);
  });

  formEl.addEventListener("submit", onSubmit);
  cancelBtn.addEventListener("click", closeAddNotePopup);
  closeBtn.addEventListener("click", closeAddNotePopup);
  modalEl.addEventListener("click", onModalClick);
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", toggleMenu);
  }
  if (locationBtn) {
    locationBtn.addEventListener("click", useMyLocation);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAddNotePopup();
      if (menuOverlay && menuOverlay.classList.contains("open")) {
        toggleMenu();
      }
    }
  });

  // Preload SVG files, then initialize map
  loadSvgFiles().then(() => {
    initMap();
  }).catch(() => {
    // Even if SVG loading fails, initialize map with fallback SVGs
    console.warn("SVG files not loaded, using embedded fallbacks");
    initMap();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
