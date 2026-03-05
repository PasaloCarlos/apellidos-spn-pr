let apellidosData = [];
let filteredData = [];
let selectedRegion = null;
let prMap, spainMap;
let prGeoLayer, spainGeoLayer;

// Region colors
const regionColors = {
  'Andalucía': '#e94560',
  'Aragón': '#f5a623',
  'Asturias': '#7ed321',
  'Islas Canarias': '#4a90d9',
  'Castilla': '#bd10e0',
  'Cataluña': '#50e3c2',
  'Extremadura': '#d0021b',
  'Galicia': '#417505',
  'Navarra': '#9013fe',
  'País Vasco': '#f8e71c',
  'Generales (se desconoce su origen o pueden haber tenido origen en otro lugar, pero tienen una alta prevalencia por toda España).': '#8b8b8b'
};

const regionShortNames = {
  'Generales (se desconoce su origen o pueden haber tenido origen en otro lugar, pero tienen una alta prevalencia por toda España).': 'Generales'
};

function getRegionName(region) {
  return regionShortNames[region] || region;
}

function getRegionColor(region) {
  return regionColors[region] || '#666';
}

// Spain GeoJSON mapping (region name -> GeoJSON feature name patterns)
const spainRegionMapping = {
  'Andalucía': ['Andalucia', 'Andalucía'],
  'Aragón': ['Aragon', 'Aragón'],
  'Asturias': ['Asturias'],
  'Islas Canarias': ['Canarias'],
  'Castilla': ['Castilla-Leon', 'Castilla-La Mancha'],
  'Cataluña': ['Cataluña', 'Cataluna'],
  'Extremadura': ['Extremadura'],
  'Galicia': ['Galicia'],
  'Navarra': ['Navarra'],
  'País Vasco': ['Pais Vasco']
};

async function init() {
  const res = await fetch('data/apellidos.json');
  apellidosData = await res.json();
  filteredData = [...apellidosData];

  initPRMap();
  initSpainMap();
  buildRegionList();
  buildFilters();
  renderApellidoList();
  setupSearch();

  setupMobileNav();

  // Fix map sizing after layout
  setTimeout(() => {
    prMap.invalidateSize();
    spainMap.invalidateSize();
  }, 100);
}

// Mobile navigation
function setupMobileNav() {
  const container = document.querySelector('.main-container');
  container.setAttribute('data-view', 'map');

  document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      container.setAttribute('data-view', view);

      document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Invalidate map sizes when switching to a view with a map
      setTimeout(() => {
        if (view === 'map') spainMap.invalidateSize();
        if (view === 'regions') prMap.invalidateSize();
      }, 350);
    });
  });
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function initPRMap() {
  prMap = L.map('pr-map', {
    center: [18.22, -66.45],
    zoom: 8,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(prMap);

  // Load PR GeoJSON (municipalities)
  fetch('data/pr-municipalities.geojson')
    .then(r => {
      if (!r.ok) throw new Error('Failed to load PR GeoJSON: ' + r.status);
      return r.json();
    })
    .then(geo => {
      prGeoLayer = L.geoJSON(geo, {
        style: {
          fillColor: '#1a3a6e',
          fillOpacity: 0.4,
          color: '#4a90d9',
          weight: 1
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties.NAME || feature.properties.name || '';
          layer.bindTooltip(name, { className: 'region-label' });
        }
      }).addTo(prMap);
      prMap.fitBounds(prGeoLayer.getBounds());
    })
    .catch(err => {
      console.error('PR GeoJSON error:', err);
    });
}

function initSpainMap() {
  spainMap = L.map('spain-map', {
    center: [40.0, -3.7],
    zoom: 6,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(spainMap);

  // Load Spain communities GeoJSON
  fetch('data/spain-communities.geojson')
    .then(r => r.json())
    .then(geo => {
      spainGeoLayer = L.geoJSON(geo, {
        style: feature => {
          const name = feature.properties.name || '';
          const dataRegion = findDataRegion(name);
          return {
            fillColor: dataRegion ? getRegionColor(dataRegion) : '#2a2a4a',
            fillOpacity: dataRegion ? 0.6 : 0.2,
            color: '#4a90d9',
            weight: 1
          };
        },
        onEachFeature: (feature, layer) => {
          const name = feature.properties.name || '';
          const dataRegion = findDataRegion(name);
          if (dataRegion) {
            const count = apellidosData.filter(a => a.region === dataRegion).length;
            layer.bindTooltip(`${getRegionName(dataRegion)}: ${count} apellidos`, {
              className: 'region-label'
            });
            layer.on('click', () => selectRegion(dataRegion));
          }
        }
      }).addTo(spainMap);
    })
    .catch(() => {
      console.log('Spain GeoJSON not available');
    });
}

function findDataRegion(geoName) {
  for (const [dataRegion, patterns] of Object.entries(spainRegionMapping)) {
    if (patterns.some(p => geoName.includes(p) || p.includes(geoName))) {
      return dataRegion;
    }
  }
  return null;
}

function buildRegionList() {
  const list = document.querySelector('.region-list');
  const regions = {};
  apellidosData.forEach(a => {
    if (!regions[a.region]) regions[a.region] = 0;
    regions[a.region]++;
  });

  // Add "All" option
  let html = `<div class="region-item active" data-region="all">
    <span>Todas las regiones</span>
    <span class="count">${apellidosData.length}</span>
  </div>`;

  Object.entries(regions)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      const name = getRegionName(region);
      const color = getRegionColor(region);
      html += `<div class="region-item" data-region="${region}" style="border-left: 3px solid ${color}">
        <span>${name}</span>
        <span class="count">${count}</span>
      </div>`;
    });

  list.innerHTML = html;
  list.querySelectorAll('.region-item').forEach(item => {
    item.addEventListener('click', () => {
      const region = item.dataset.region;
      selectRegion(region === 'all' ? null : region);
    });
  });
}

function selectRegion(region) {
  selectedRegion = region;
  document.querySelectorAll('.region-item').forEach(item => {
    item.classList.toggle('active',
      (region === null && item.dataset.region === 'all') ||
      item.dataset.region === region
    );
  });

  // Highlight Spain map
  if (spainGeoLayer) {
    spainGeoLayer.eachLayer(layer => {
      const name = layer.feature.properties.name || '';
      const dataRegion = findDataRegion(name);
      const isSelected = !region || dataRegion === region;
      layer.setStyle({
        fillOpacity: isSelected && dataRegion ? 0.7 : 0.15,
        weight: dataRegion === region ? 2 : 1
      });
    });
  }

  applyFilters();
}

function buildFilters() {
  const origenSelect = document.getElementById('filter-origen');
  const origenes = new Set();
  apellidosData.forEach(a => { if (a.origen) origenes.add(a.origen); });
  [...origenes].sort().forEach(o => {
    origenSelect.innerHTML += `<option value="${o}">${o}</option>`;
  });

  const sortSelect = document.getElementById('filter-sort');

  origenSelect.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change', applyFilters);
}

function setupSearch() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', applyFilters);
}

function applyFilters() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
  const origenFilter = document.getElementById('filter-origen').value;
  const sortBy = document.getElementById('filter-sort').value;

  filteredData = apellidosData.filter(a => {
    if (selectedRegion && a.region !== selectedRegion) return false;
    if (origenFilter && a.origen !== origenFilter) return false;
    if (searchTerm && !a.apellido.toLowerCase().includes(searchTerm)) return false;
    return true;
  });

  // Sort
  filteredData.sort((a, b) => {
    switch (sortBy) {
      case 'rango':
        return (a.rango || 999) - (b.rango || 999);
      case 'poblacion':
        return (b.poblacionPR || 0) - (a.poblacionPR || 0);
      case 'nombre':
      default:
        return a.apellido.localeCompare(b.apellido);
    }
  });

  renderApellidoList();
}

function renderApellidoList() {
  const list = document.querySelector('.apellido-list');
  const header = document.querySelector('.results-header');
  header.textContent = `${filteredData.length} apellidos encontrados`;

  if (filteredData.length === 0) {
    list.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No se encontraron apellidos</div>';
    return;
  }

  list.innerHTML = filteredData.map(a => {
    const color = getRegionColor(a.region);
    const rangoText = a.rango ? `#${a.rango}` : '';
    const pobText = a.poblacionPR ? a.poblacionPR.toLocaleString() : '--';
    return `<div class="apellido-card" data-apellido="${a.apellido}" style="border-left-color: ${color}">
      <div class="name">${a.apellido}</div>
      <div class="meta">
        <span>${getRegionName(a.region)}</span>
        ${rangoText ? `<span>Rango: ${rangoText}</span>` : ''}
        <span>PR: ${pobText}</span>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.apellido-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.apellido;
      const data = apellidosData.find(a => a.apellido === name);
      showDetail(data);
    });
  });
}

function showDetail(a) {
  // On mobile, switch to map view to show overlay
  if (window.innerWidth <= 768) {
    const container = document.querySelector('.main-container');
    container.setAttribute('data-view', 'map');
    document.querySelectorAll('.mobile-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === 'map');
    });
    setTimeout(() => spainMap.invalidateSize(), 350);
  }

  const overlay = document.querySelector('.detail-overlay');
  overlay.classList.add('visible');

  const formatNum = n => n ? n.toLocaleString() : 'Sin datos';

  overlay.querySelector('h2').textContent = a.apellido;
  overlay.querySelector('.detail-grid').innerHTML = `
    <div class="detail-item">
      <div class="label">Region de Origen</div>
      <div class="value">${getRegionName(a.region)}</div>
    </div>
    <div class="detail-item">
      <div class="label">Subregion</div>
      <div class="value">${a.subregion || 'Sin datos'}</div>
    </div>
    <div class="detail-item">
      <div class="label">Rango (Top 200)</div>
      <div class="value">${a.rango ? '#' + a.rango : 'Sin datos'}</div>
    </div>
    <div class="detail-item">
      <div class="label">Origen del Apellido</div>
      <div class="value">${a.origen || 'Sin datos'}</div>
    </div>
    <div class="detail-item">
      <div class="label">Poblacion en PR</div>
      <div class="value">${formatNum(a.poblacionPR)}</div>
    </div>
    <div class="detail-item">
      <div class="label">Poblacion en Espana</div>
      <div class="value">${formatNum(a.poblacionEspana)}</div>
    </div>
    <div class="detail-item">
      <div class="label">Total Region</div>
      <div class="value">${a.totalRegion || 'Sin datos'}</div>
    </div>
    <div class="detail-item">
      <div class="label">Figuras Notables</div>
      <div class="value">${a.figuras || 'Sin datos'}</div>
    </div>
  `;
}

function closeDetail() {
  document.querySelector('.detail-overlay').classList.remove('visible');
}

function togglePRMap() {
  const map = document.getElementById('pr-map');
  const btn = document.querySelector('.toggle-pr-map');
  map.classList.toggle('hidden');
  btn.classList.toggle('collapsed');
  if (!map.classList.contains('hidden')) {
    setTimeout(() => prMap.invalidateSize(), 350);
  }
}

document.addEventListener('DOMContentLoaded', init);
