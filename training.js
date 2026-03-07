const SUPABASE_URL = 'https://elhshkzfiqmyisxavnsh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaHNoa3pmaXFteWlzeGF2bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MDg1OTIsImV4cCI6MjA3NDI4NDU5Mn0.0AaxR_opZSkwz2rRwJ21kmuZ7lrOPglLUIgb8nSnr1k';
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbykYEaa9YFAr2IF3LF0iajPvSiySXUzDFK6Pwbxa0b5PTA0neDc3_M4vBMtRBnX0g3osA/exec';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let sensorChart;

// --- Dark Mode ---
document.getElementById('darkModeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.getElementById('darkModeToggle').innerText = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

// --- Schedule Logic ---
function getScheduledLocation(dateObj) {
    const hour = dateObj.getHours();
    if (hour >= 13 && hour < 19) return { id: 'A', name: 'Loc A' };
    if (hour >= 19 && hour < 1) return { id: 'B', name: 'Loc B' };
    if (hour >= 1 || hour < 7) return { id: 'C', name: 'Loc C' };
    return { id: 'D', name: 'Loc D' };
}

function initChart() {
    const ctx = document.getElementById('realTimeChart').getContext('2d');
    sensorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Temp', borderColor: '#e74c3c', data: [], tension: 0.3 },
                { label: 'Hum', borderColor: '#3498db', data: [], tension: 0.3 },
                { label: 'UV', borderColor: '#9b59b6', data: [], tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#888' } } }
        }
    });
}

async function refreshDisplay() {
    const { data, error } = await db.from('training_data').select('*').order('created_at', { ascending: false }).limit(10);
    if (error || !data.length) return;

    const latest = data[0];
    const activeLoc = getScheduledLocation(new Date());

    document.getElementById('currTemp').innerText = `${latest.temperature.toFixed(1)}°C`;
    document.getElementById('currHum').innerText = `${latest.humidity.toFixed(1)}%`;
    document.getElementById('currUV').innerText = latest.uv_index;
    document.getElementById('scheduleStatus').innerText = `Active: ${activeLoc.name}`;

    ['A', 'B', 'C', 'D'].forEach(id => {
        const row = document.getElementById(`row-${id}`);
        if (id === activeLoc.id) {
            row.classList.add('active-row');
            row.querySelector('input').checked = true;
            row.querySelector('.temp').innerText = `${latest.temperature.toFixed(1)}°C`;
            row.querySelector('.hum').innerText = `${latest.humidity.toFixed(1)}%`;
            row.querySelector('.uv').innerText = latest.uv_index;
        } else {
            row.classList.remove('active-row');
        }
    });

    sensorChart.data.labels = data.map(r => new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})).reverse();
    sensorChart.data.datasets[0].data = data.map(r => r.temperature).reverse();
    sensorChart.data.datasets[1].data = data.map(r => r.humidity).reverse();
    sensorChart.data.datasets[2].data = data.map(r => r.uv_index).reverse();
    sensorChart.update('none');
}

// --- FIXED EXPORT LOGIC ---
document.getElementById('exportBtn').addEventListener('click', async () => {
    const btn = document.getElementById('exportBtn');
    btn.innerText = "Processing...";
    btn.disabled = true;

    // 1. Fetch All Data
    const { data, error } = await db.from('training_data').select('*').order('created_at', { ascending: true });
    
    if (error) {
        alert("Error fetching data!");
        btn.disabled = false;
        return;
    }

    // 2. Build CSV Content & Google Payload
    let csvRows = ["Date,Time,Location,Temperature,Humidity,UV_Index"];
    const googlePayload = [];

    data.forEach(r => {
        const dt = new Date(r.created_at);
        const dateStr = dt.toLocaleDateString();
        const timeStr = dt.toLocaleTimeString();
        const locName = getScheduledLocation(dt).name;

        // Add to CSV string
        csvRows.push(`${dateStr},${timeStr},${locName},${r.temperature},${r.humidity},${r.uv_index}`);
        
        // Add to Google Payload
        googlePayload.push({
            date: dateStr,
            time: timeStr,
            location: locName,
            temp: r.temperature,
            hum: r.humidity,
            uv: r.uv_index
        });
    });

    // 3. TRIGGER LOCAL DOWNLOAD
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Sensor_Export_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 4. TRIGGER GOOGLE SYNC
    try {
        await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(googlePayload) });
        alert(`Exported ${data.length} records! CSV downloaded and Sheets synced.`);
    } catch (e) {
        alert("CSV downloaded, but Google Sheets sync failed.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Export Data";
    }
});

// --- View Controls ---
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const view = e.target.dataset.view;
        sensorChart.data.datasets.forEach((ds, i) => {
            if (view === 'all') { ds.hidden = false; ds.borderColor = '#2ecc71'; }
            else {
                const colors = ['#e74c3c', '#3498db', '#9b59b6'];
                ds.borderColor = colors[i];
                ds.hidden = (view === 'temp' && i !== 0) || (view === 'hum' && i !== 1) || (view === 'uv' && i !== 2);
            }
        });
        sensorChart.update();
    });
});

db.channel('db').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'training_data' }, refreshDisplay).subscribe();
initChart();
refreshDisplay();
setInterval(refreshDisplay, 60000);