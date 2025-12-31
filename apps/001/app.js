// 初期設定
const map = L.map('map').setView([35.6812, 139.7671], 10);

// 地理院地図タイル
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
}).addTo(map);

let markers = [];
let routeLines = [];
let waypoints = []; // [{lat, lng, name}]
let step = 0; // 0: 出発地, 1: 目的地1, 2: 目的地2, 3: 目的地3
let routeStats = [];

// DOM要素
const originInput = document.getElementById('origin-input');
const btnCurrentLocation = document.getElementById('btn-current-location');
const btnStartPlan = document.getElementById('btn-start-plan');
const suggestionArea = document.getElementById('suggestion-area');
const suggestionList = document.getElementById('suggestion-list');
const resultArea = document.getElementById('result-area');
const stepTitle = document.getElementById('step-title');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('error-message');

// --- ユーティリティ関数 ---

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 5000);
}

function showLoading(show) {
    loading.classList.toggle('hidden', !show);
}

// 現在地取得
btnCurrentLocation.onclick = () => {
    if (!navigator.geolocation) return showError("GPSがサポートされていません");
    showLoading(true);
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await res.json();
                originInput.value = data.display_name.split(',')[0] || "現在地";
                originInput.dataset.lat = latitude;
                originInput.dataset.lng = longitude;
            } catch (e) {
                showError("場所の名前を取得できませんでした。");
            } finally { showLoading(false); }
        },
        () => { showLoading(false); showError("位置情報の取得に失敗しました。"); }
    );
};

// 計画開始
btnStartPlan.onclick = async () => {
    const query = originInput.value;
    if (!query) return showError("出発地を入力してください");

    showLoading(true);
    try {
        let lat, lng;
        if (originInput.dataset.lat) {
            lat = originInput.dataset.lat;
            lng = originInput.dataset.lng;
        } else {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.length === 0) throw new Error("場所が見つかりません");
            lat = data[0].lat;
            lng = data[0].lon;
        }

        waypoints = [{ lat: parseFloat(lat), lng: parseFloat(lng), name: "出発地" }];
        addMarker(lat, lng, "出発地", "blue");
        map.setView([lat, lng], 10);

        step = 1;
        startNextStep();
    } catch (e) {
        showError(e.message);
    } finally { showLoading(false); }
};

// 目的地提案の生成
async function startNextStep() {
    suggestionArea.classList.remove('hidden');
    suggestionList.innerHTML = "";

    let minKm, maxKm;
    if (step === 1) {
        stepTitle.textContent = "目的地1を提案（100km〜300km）";
        minKm = 100; maxKm = 300;
    } else {
        stepTitle.textContent = `目的地${step}を提案（50km〜100km）`;
        minKm = 50; maxKm = 100;
    }

    const base = waypoints[waypoints.length - 1];
    const proposals = generateRandomCoords(base.lat, base.lng, minKm, maxKm, 3);

    for (let p of proposals) {
        const name = await getPlaceName(p.lat, p.lng);
        const card = document.createElement('div');
        card.className = 'suggestion-item';
        card.innerHTML = `<strong>${name}</strong><br>約 ${p.dist}km`;
        card.onclick = () => selectDestination(p.lat, p.lng, name);
        suggestionList.appendChild(card);
    }
}

// 目的地選択
async function selectDestination(lat, lng, name) {
    showLoading(true);
    const prevPoint = waypoints[waypoints.length - 1];

    try {
        const routeData = await fetchRoute(prevPoint, {lat, lng});
        drawRoute(routeData.geometry);

        waypoints.push({lat, lng, name});
        addMarker(lat, lng, `目的地${step}: ${name}`, "red");

        routeStats.push({
            segment: `区間${step}`,
            distance: (routeData.distance / 1000).toFixed(1),
            duration: Math.round(routeData.duration / 60)
        });

        if (step < 3) {
            step++;
            startNextStep();
        } else {
            finishPlanning();
        }
    } catch (e) {
        showError("ルート検索に失敗しました。");
    } finally { showLoading(false); }
}

// 最終表示
function finishPlanning() {
    suggestionArea.classList.add('hidden');
    resultArea.classList.remove('hidden');

    const tbody = document.querySelector('#route-details tbody');
    let totalDist = 0;
    let totalTime = 0;

    routeStats.forEach(s => {
        const row = `<tr><td>${s.segment}</td><td>${s.distance} km</td><td>${s.duration} 分</td></tr>`;
        tbody.innerHTML += row;
        totalDist += parseFloat(s.distance);
        totalTime += s.duration;
    });

    document.getElementById('stats-summary').innerHTML = `
        <p><strong>合計距離:</strong> ${totalDist.toFixed(1)} km</p>
        <p><strong>合計推定時間:</strong> ${Math.floor(totalTime / 60)}時間${totalTime % 60}分</p>
    `;

    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
}

// --- API & ロジック系 ---

function generateRandomCoords(lat, lng, minKm, maxKm, count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        const dist = Math.random() * (maxKm - minKm) + minKm;
        const angle = Math.random() * Math.PI * 2;
        // 1度 ≒ 111km
        const dLat = (dist / 111) * Math.cos(angle);
        const dLng = (dist / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
        points.push({ lat: lat + dLat, lng: lng + dLng, dist: Math.floor(dist) });
    }
    return points;
}

async function getPlaceName(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        return data.address.city || data.address.town || data.address.province || data.address.county || "不明な地点";
    } catch { return "不明な地点"; }
}

async function fetchRoute(start, end) {
    const profile = document.getElementById('transport').value === 'driving-car' ? 'driving' :
                    document.getElementById('transport').value === 'cycling' ? 'cycling' : 'walking';

    const url = `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok') throw new Error("Route not found");
    return data.routes[0];
}

function addMarker(lat, lng, title, color) {
    const marker = L.marker([lat, lng]).addTo(map).bindPopup(title);
    markers.push(marker);
}

function drawRoute(geoJson) {
    const line = L.geoJSON(geoJson, {
        style: { color: '#3498db', weight: 5, opacity: 0.7 }
    }).addTo(map);
    routeLines.push(line);
}