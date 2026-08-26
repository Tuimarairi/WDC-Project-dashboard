#!/usr/bin/env node
/**
 * PCDFWDC Dashboard Auto-Update Script
 * Pulls data from KoboToolbox API (both forms) and regenerates dashboard HTML
 * Run via: node update-dashboard.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const KOBO_API_URL = 'https://kf.kobotoolbox.org/api/v2';
const API_TOKEN = process.env.KOBO_API_TOKEN || '';

if (!API_TOKEN) {
  console.error('ERROR: KOBO_API_TOKEN environment variable not set');
  process.exit(1);
}

// Helper: Make HTTPS request to KoboToolbox API
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(KOBO_API_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Token ${API_TOKEN}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

// Fetch all assets and find the two forms by name
async function findForms() {
  console.log('Fetching form list from KoboToolbox...');
  const assets = await makeRequest('/assets/?format=json&limit=100');
  
  const projectExpenditureForm = assets.results.find(a =>
    a.name.includes('PCDFWDC_Expenditure') || a.name.includes('Expenditure Form')
  );
  
  const operationalForm = assets.results.find(a =>
    a.name.includes('Ward_Operational') || (a.name.includes('Operational') && a.name.includes('expenditure'))
  );

  if (!projectExpenditureForm) {
    console.warn('WARNING: Ward Project Expenditure Form not found');
  }
  if (!operationalForm) {
    console.warn('WARNING: Ward Operational Expenditure Form not found');
  }

  return {
    projectExpenditure: projectExpenditureForm,
    operationalExpenditure: operationalForm,
  };
}

// Fetch submissions for a specific form
async function getSubmissions(assetUid) {
  console.log(`Fetching submissions for form ${assetUid}...`);
  const submissions = await makeRequest(`/assets/${assetUid}/data/?format=json&limit=50000`);
  return submissions.results || [];
}

// Convert KoboToolbox submission to dashboard project record
function submissionToProject(sub, formType) {
  const getField = (names) => {
    for (const name of names) {
      if (sub[name] !== undefined && sub[name] !== null && sub[name] !== '') {
        return sub[name];
      }
    }
    return null;
  };

  // Common fields
  const province = getField(['Province', 'province']);
  const ward = getField(['Ward', 'ward']);
  const projectName = getField(['Project Name', 'Project_Name', 'project_name']);
  const status = getField(['Project Status', 'Project_Status', 'project_status']);
  const onSchedule = getField(['Is the project on schedule?', 'on_schedule', 'schedule']);
  const lat = sub._Add_GPS_Coordinates_latitude || sub._latitude;
  const lng = sub._Add_GPS_Coordinates_longitude || sub._longitude;

  // Expenditure (sum multiple receipt fields)
  let expenditure = 0;
  if (formType === 'project') {
    // Project form: multiple "Enter the amount on the receipt" fields
    for (let i = 0; i < 6; i++) {
      const suffix = i === 0 ? '' : `.${i}`;
      const fieldName = `Enter the amount on the receipt${suffix}`;
      if (sub[fieldName]) {
        expenditure += parseFloat(sub[fieldName]) || 0;
      }
    }
  } else if (formType === 'operational') {
    // Operational form: multiple receipt amount fields
    for (let i = 0; i < 6; i++) {
      const suffix = i === 0 ? '' : `.${i}`;
      const fieldName = `Enter the amount on the receipt${suffix}`;
      if (sub[fieldName]) {
        expenditure += parseFloat(sub[fieldName]) || 0;
      }
    }
  }

  return {
    name: String(projectName || 'Unnamed Project').trim(),
    province: String(province || 'Unknown').trim(),
    ward: String(ward || 'Unknown').trim(),
    status: String(status || 'Not started').trim(),
    onSchedule: onSchedule === 'Yes' ? 'Yes' : 'No',
    expenditure: Math.round(expenditure * 100) / 100,
    lat: lat && !isNaN(lat) ? parseFloat(lat) : null,
    lng: lng && !isNaN(lng) ? parseFloat(lng) : null,
  };
}

// Main integration function
async function updateDashboard() {
  try {
    console.log('\n=== PCDFWDC Dashboard Update ===');
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    // 1. Find both forms
    const forms = await findForms();
    if (!forms.projectExpenditure && !forms.operationalExpenditure) {
      throw new Error('Could not find either KoboToolbox form');
    }

    // 2. Fetch submissions from both forms
    let allProjects = [];

    if (forms.projectExpenditure) {
      console.log(`Project Expenditure Form UID: ${forms.projectExpenditure.uid}`);
      const projectSubs = await getSubmissions(forms.projectExpenditure.uid);
      console.log(`  → Fetched ${projectSubs.length} submissions`);
      const projectData = projectSubs.map(s => submissionToProject(s, 'project'));
      allProjects = allProjects.concat(projectData);
    }

    if (forms.operationalExpenditure) {
      console.log(`Operational Expenditure Form UID: ${forms.operationalExpenditure.uid}`);
      const opSubs = await getSubmissions(forms.operationalExpenditure.uid);
      console.log(`  → Fetched ${opSubs.length} submissions`);
      const opData = opSubs.map(s => submissionToProject(s, 'operational'));
      allProjects = allProjects.concat(opData);
    }

    console.log(`\nTotal records collected: ${allProjects.length}`);

    // 3. Compute summary stats
    const summary = computeSummaryStats(allProjects);
    console.log(`Summary stats computed:`, summary);

    // 4. Generate dashboard HTML
    const dashboardHtml = generateDashboardHtml(allProjects, summary);

    // 5. Write to file
    const outputPath = path.join(__dirname, 'index.html');
    fs.writeFileSync(outputPath, dashboardHtml, 'utf-8');
    console.log(`\n✓ Dashboard written to: ${outputPath}`);
    console.log(`✓ File size: ${(dashboardHtml.length / 1024).toFixed(1)} KB`);
    console.log('\n=== Update Complete ===\n');

  } catch (error) {
    console.error('\nERROR:', error.message);
    process.exit(1);
  }
}

function computeSummaryStats(projects) {
  const total = projects.length;
  const completed = projects.filter(p => p.status === 'Completed').length;
  const inProgress = projects.filter(p => p.status === 'In Progress').length;
  const mobilised = projects.filter(p => p.status === 'Mobilised').length;
  const notStarted = projects.filter(p => p.status === 'Not started').length;

  const expenditure = projects.reduce((s, p) => s + p.expenditure, 0);
  const withSpend = projects.filter(p => p.expenditure > 0).length;
  const avgExp = withSpend > 0 ? expenditure / withSpend : 0;

  const onSchedule = projects.filter(p => p.onSchedule === 'Yes').length;
  const delayed = projects.filter(p => p.onSchedule === 'No').length;

  const gps = projects.filter(p => p.lat && p.lng).length;
  const provinces = new Set(projects.map(p => p.province)).size;
  const wards = new Set(projects.map(p => p.ward)).size;

  return {
    total, completed, inProgress, mobilised, notStarted,
    expenditure, avgExp, onSchedule, delayed,
    gps, provinces, wards,
  };
}

function generateDashboardHtml(projects, stats) {
  // Format compact currency
  const formatCurrency = (v) => {
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Compute map center from GPS coords
  const gpsProjects = projects.filter(p => p.lat && p.lng);
  let mapCenterLat = -9.21, mapCenterLng = 161.36, mapZoom = 6;
  if (gpsProjects.length > 0) {
    const lats = gpsProjects.map(p => p.lat);
    const lngs = gpsProjects.map(p => p.lng);
    mapCenterLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    mapCenterLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  }

  // Template (simplified, reusing the structure from the earlier dashboard)
  const template = fs.readFileSync(path.join(__dirname, 'dashboard_template.html'), 'utf-8');

  const tokens = {
    '__ALL_PROJECTS_JSON__': JSON.stringify(projects, null, 0),
    '__TOTAL_PROJECTS__': String(stats.total),
    '__INPROG_COUNT__': String(stats.inProgress),
    '__COMPLETED_COUNT__': String(stats.completed),
    '__COMPLETION_RATE__': ((stats.completed / stats.total) * 100).toFixed(1),
    '__TOTAL_EXPENDITURE_LABEL__': formatCurrency(stats.expenditure),
    '__AVG_EXPENDITURE_LABEL__': formatCurrency(stats.avgExp),
    '__ONTIME_RATE__': ((stats.onSchedule / stats.total) * 100).toFixed(1),
    '__DELAYED_COUNT__': String(stats.delayed),
    '__PROVINCE_COUNT__': String(stats.provinces),
    '__WARD_COUNT__': String(stats.wards),
    '__GPS_MAPPED__': String(stats.gps),
    '__DATA_AS_OF__': new Date().toISOString().split('T')[0],
    '__MAP_CENTER_LAT__': mapCenterLat.toFixed(4),
    '__MAP_CENTER_LNG__': mapCenterLng.toFixed(4),
    '__MAP_INITIAL_ZOOM__': String(mapZoom),
  };

  let html = template;
  for (const [key, value] of Object.entries(tokens)) {
    html = html.replace(key, value);
  }

  return html;
}

// Run if executed directly
if (require.main === module) {
  updateDashboard();
}

module.exports = { updateDashboard };
