const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('C:/Users/carlosfigueroa/Downloads/apellidos.xlsx');
const ws = wb.Sheets['España'];
const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });

const data = raw.slice(2);
const apellidos = [];
let currentRegion = null;
let currentTotal = null;
let currentSubregion = null;
let currentOrigen = null;

data.forEach(row => {
  if (!row[4]) return;
  if (row[0]) currentRegion = row[0];
  if (row[1]) currentTotal = row[1];
  if (row[2]) currentSubregion = row[2];
  if (row[3]) currentOrigen = row[3];

  apellidos.push({
    region: currentRegion || null,
    totalRegion: currentTotal || null,
    subregion: row[2] || null,
    origen: row[3] || null,
    apellido: row[4],
    rango: row[5] || null,
    poblacionPR: row[6] || null,
    poblacionEspana: row[7] || null,
    figuras: row[8] || null
  });
});

fs.writeFileSync('C:/Users/carlosfigueroa/source/repos/apellidos-pr/data/apellidos.json', JSON.stringify(apellidos, null, 2));
console.log('Total apellidos:', apellidos.length);
console.log('Sample:', JSON.stringify(apellidos.slice(0, 3), null, 2));
