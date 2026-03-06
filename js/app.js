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

// #6: Accent-insensitive search helper
function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// #2: Find ALL regions for an apellido (it can appear in multiple)
function getApellidoRegions(apellido) {
  const regions = new Set();
  apellidosData.forEach(a => {
    if (a.apellido === apellido) regions.add(a.region);
  });
  return [...regions];
}

// Compute region stats from data
function getRegionStats() {
  const stats = {};
  apellidosData.forEach(a => {
    if (!stats[a.region]) {
      stats[a.region] = { count: 0, totalRegion: a.totalRegion, ranked: 0 };
    }
    stats[a.region].count++;
    if (a.rango) stats[a.region].ranked++;
  });
  return stats;
}

async function init() {
  const res = await fetch('data/apellidos.json');
  apellidosData = await res.json();
  filteredData = [...apellidosData];

  // #10: Handle URL hash on load
  handleHash();

  initPRMap();
  initSpainMap();
  buildRegionList();
  buildFilters();
  buildStatsBar();
  renderApellidoList();
  setupSearch();
  setupMobileNav();

  // Fix map sizing after layout
  setTimeout(() => {
    prMap.invalidateSize();
    spainMap.invalidateSize();
  }, 100);

  // #10: Listen for hash changes
  window.addEventListener('hashchange', handleHash);
}

// #10: URL hash sharing
function handleHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (!hash || !apellidosData.length) return;

  const params = new URLSearchParams(hash);
  const apellido = params.get('apellido');
  if (apellido) {
    const match = apellidosData.find(a => normalize(a.apellido) === normalize(apellido));
    if (match) {
      setTimeout(() => showDetail(match), 300);
    }
  }
}

// #3: Stats bar
function buildStatsBar() {
  const rankedCount = apellidosData.filter(a => a.rango).length;
  const uniqueApellidos = new Set(apellidosData.map(a => a.apellido)).size;
  const regionCount = new Set(apellidosData.map(a => a.region)).size;

  const bar = document.getElementById('stats-bar');
  bar.innerHTML = `
    <span>${uniqueApellidos} apellidos unicos</span>
    <span>${rankedCount} con rango</span>
    <span>${regionCount} regiones</span>
  `;
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
            // #4: Region popup on click with stats
            layer.on('click', () => showRegionPopup(layer, dataRegion));
            layer.on('mouseover', () => {
              if (!layer._isHighlighted) {
                layer.setStyle({ fillOpacity: 0.8, weight: 2 });
              }
            });
            layer.on('mouseout', () => {
              if (!layer._isHighlighted) {
                resetLayerStyle(layer, dataRegion);
              }
            });
          }
        }
      }).addTo(spainMap);
    })
    .catch(() => {
      console.log('Spain GeoJSON not available');
    });
}

// #4: Region popup with stats
function showRegionPopup(layer, dataRegion) {
  const stats = getRegionStats()[dataRegion];
  const regionName = getRegionName(dataRegion);
  const totalInfo = stats.totalRegion || '';

  const popup = L.popup()
    .setLatLng(layer.getBounds().getCenter())
    .setContent(`
      <h4>${regionName}</h4>
      <div style="margin-top:6px">
        <div><strong>${stats.count}</strong> apellidos</div>
        <div><strong>${stats.ranked}</strong> con rango (Top 200)</div>
        ${totalInfo ? `<div style="margin-top:4px;font-size:0.75rem;color:#aaa">Total: ${totalInfo}</div>` : ''}
      </div>
      <div style="margin-top:8px">
        <a href="#" onclick="event.preventDefault();selectRegion('${dataRegion.replace(/'/g, "\\'")}');spainMap.closePopup();" style="color:#e94560;font-size:0.8rem">Ver apellidos de esta region</a>
      </div>
    `)
    .openOn(spainMap);
}

function findDataRegion(geoName) {
  for (const [dataRegion, patterns] of Object.entries(spainRegionMapping)) {
    if (patterns.some(p => geoName.includes(p) || p.includes(geoName))) {
      return dataRegion;
    }
  }
  return null;
}

// #1 + unified: Reset a single layer to its default style
function resetLayerStyle(layer, dataRegion) {
  const isSelected = !selectedRegion || dataRegion === selectedRegion;
  layer.setStyle({
    fillColor: dataRegion ? getRegionColor(dataRegion) : '#2a2a4a',
    fillOpacity: isSelected && dataRegion ? 0.6 : 0.15,
    color: '#4a90d9',
    weight: dataRegion === selectedRegion ? 2 : 1
  });
  layer._isHighlighted = false;
}

// #1: Unified map reset
function resetMapStyles() {
  if (!spainGeoLayer) return;
  spainGeoLayer.eachLayer(layer => {
    const name = layer.feature.properties.name || '';
    const dataRegion = findDataRegion(name);
    resetLayerStyle(layer, dataRegion);
  });
}

function buildRegionList() {
  const list = document.querySelector('.region-list');
  const stats = getRegionStats();

  // #7: Show totalRegion stat next to region name
  let html = `<div class="region-item active" data-region="all">
    <span>Todas las regiones</span>
    <span class="count">${apellidosData.length}</span>
  </div>`;

  Object.entries(stats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([region, stat]) => {
      const name = getRegionName(region);
      const color = getRegionColor(region);
      const totalBadge = stat.totalRegion ? `<span class="region-total">${stat.totalRegion}</span>` : '';
      html += `<div class="region-item" data-region="${region}" style="border-left: 3px solid ${color}">
        <span class="region-name-col">${name}${totalBadge}</span>
        <span class="count">${stat.count}</span>
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

  // #1: Unified highlight
  resetMapStyles();
  if (region && spainGeoLayer) {
    spainGeoLayer.eachLayer(layer => {
      const name = layer.feature.properties.name || '';
      const dataRegion = findDataRegion(name);
      if (dataRegion === region) {
        layer.setStyle({ fillOpacity: 0.7, weight: 2 });
      }
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

  origenSelect.addEventListener('change', applyFilters);
  document.getElementById('filter-sort').addEventListener('change', applyFilters);
}

function setupSearch() {
  const input = document.getElementById('search-input');
  input.addEventListener('input', applyFilters);
}

function applyFilters() {
  const searchTerm = normalize(document.getElementById('search-input').value.trim());
  const origenFilter = document.getElementById('filter-origen').value;
  const sortBy = document.getElementById('filter-sort').value;

  // #6: Accent-insensitive filtering
  filteredData = apellidosData.filter(a => {
    if (selectedRegion && a.region !== selectedRegion) return false;
    if (origenFilter && a.origen !== origenFilter) return false;
    if (searchTerm && !normalize(a.apellido).includes(searchTerm)) return false;
    return true;
  });

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
    // #2: Show if apellido appears in multiple regions
    const regions = getApellidoRegions(a.apellido);
    const multiRegion = regions.length > 1 ? `<span class="multi-region" title="${regions.map(getRegionName).join(', ')}">+${regions.length - 1}</span>` : '';
    return `<div class="apellido-card" data-apellido="${a.apellido}" style="border-left-color: ${color}">
      <div class="name">${a.apellido} ${multiRegion}</div>
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
      // Mark card as selected
      list.querySelectorAll('.apellido-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
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

  // #2: Highlight ALL origin regions for this apellido
  const regions = getApellidoRegions(a.apellido);
  highlightRegionsOnMap(regions);

  // #10: Update URL hash for sharing
  const newHash = `#apellido=${encodeURIComponent(a.apellido)}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }

  const overlay = document.querySelector('.detail-overlay');
  overlay.classList.add('visible');

  const formatNum = n => n ? n.toLocaleString() : 'Sin datos';

  // #2: Show all regions if multiple
  const allRegions = regions.map(r => `<span style="color:${getRegionColor(r)}">${getRegionName(r)}</span>`).join(', ');

  overlay.querySelector('h2').textContent = a.apellido;
  overlay.querySelector('.detail-grid').innerHTML = `
    <div class="detail-item">
      <div class="label">Region de Origen</div>
      <div class="value">${allRegions}</div>
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
    <div class="detail-item detail-share">
      <button class="share-btn" onclick="shareApellido('${a.apellido.replace(/'/g, "\\'")}')">Compartir enlace</button>
    </div>
  `;
}

// #10: Share link
function shareApellido(apellido) {
  const url = window.location.origin + window.location.pathname + '#apellido=' + encodeURIComponent(apellido);
  if (navigator.share) {
    navigator.share({ title: `Apellido: ${apellido}`, url: url });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.querySelector('.share-btn');
      btn.textContent = 'Enlace copiado!';
      setTimeout(() => { btn.textContent = 'Compartir enlace'; }, 2000);
    });
  }
}

function closeDetail() {
  document.querySelector('.detail-overlay').classList.remove('visible');
  // Clear hash
  history.replaceState(null, '', window.location.pathname);
  // #1: Reset map to current state
  resetMapStyles();
}

// #2: Highlight multiple regions at once
function highlightRegionsOnMap(regions) {
  if (!spainGeoLayer) return;
  spainGeoLayer.eachLayer(layer => {
    const name = layer.feature.properties.name || '';
    const dataRegion = findDataRegion(name);
    const isTarget = regions.includes(dataRegion);
    layer.setStyle({
      fillColor: dataRegion ? getRegionColor(dataRegion) : '#2a2a4a',
      fillOpacity: isTarget ? 0.85 : 0.1,
      color: isTarget ? '#fff' : '#4a90d9',
      weight: isTarget ? 3 : 1
    });
    layer._isHighlighted = isTarget;
    if (isTarget) layer.bringToFront();
  });
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
