/**
 * ドライブルート提案アプリ Logic
 */

let map;
let routeLayers = [];
let markers = [];
let municipalitiesData = [];
let currentStep = 1;
let selectedRoute = []; // [{name, lat, lng}]

const GSI_TILE = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
const GSI_ATTRIBUTION = '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';
const MUNICIPALITIES_URL = 'https://raw.githubusercontent.com/yzkn/Gemini-JS-DriveRouteSuggestion/refs/heads/main/master/municipalities.json';

// ヒュベニの公式による距離計算
function calculateDistance(lat1, lng1, lat2, lng2) {
    const rad = (deg) => deg * Math.PI / 180;
    const a = 6378137.0; // 赤道半径
    const b = 6356752.314245; // 極半径
    const e2 = (a ** 2 - b ** 2) / (a ** 2);
    
    const dy = rad(lat1 - lat2);
    const dx = rad(lng1 - lng2);
    const my = rad((lat1 + lat2) / 2);
    
    const W = Math.sqrt(1 - e2 * Math.sin(my) ** 2);
    const M = a * (1 - e2) / (W ** 3);
    const N = a / W;
    
    const d = Math.sqrt((dy * M) ** 2 + (dx * N * Math.cos(my)) ** 2);
    return d / 1000; // km
}

// 初期化
async function init() {
    map = L.map('map').setView([35.6812, 139.7671], 10);
    L.tileLayer(GSI_TILE, { attribution: GSI_ATTRIBUTION }).addTo(map);

    try {
        const res = await fetch(MUNICIPALITIES_URL);
        municipalitiesData = await res.json();
    } catch (e) {
        alert("市区町村データの読み込みに失敗しました。");
    }

    document.getElementById('btn-current-loc').addEventListener('click', getCurrentLocation);
    document.getElementById('btn-start').addEventListener('click', startSequence);
    document.getElementById('btn-reset').addEventListener('click', () => location.reload());
}

// 現在地の取得
function getCurrentLocation() {
    if (!navigator.geolocation) {
        alert("お使いのブラウザはGPSに対応していません。");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await res.json();
            document.getElementById('origin-input').value = data.display_name || `${latitude}, ${longitude}`;
            document.getElementById('origin-input').dataset.lat = latitude;
            document.getElementById('origin-input').dataset.lng = longitude;
        },
        () => alert("現在地の取得に失敗しました。")
    );
}

// ルート作成開始
async function startSequence() {
    const input = document.getElementById('origin-input');
    let lat = parseFloat(input.dataset.lat);
    let lng = parseFloat(input.dataset.lng);

    if (isNaN(lat)) {
        // 住所から座標変換
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input.value)}`);
            const data = await res.json();
            if (data.length === 0) throw new Error();
            lat = parseFloat(data[0].lat);
            lng = parseFloat(data[0].lon);
        } catch (e) {
            alert("出発地が見つかりませんでした。");
            return;
        }
    }

    selectedRoute = [{ name: "出発地", lat, lng }];
    addMarker(lat, lng, "出発地");
    map.setView([lat, lng], 9);
    
    document.querySelector('.config-section').classList.add('hidden');
    document.getElementById('suggestion-section').classList.remove('hidden');
    
    proposeNextDestinations();
}

// 次の目的地を提案
function proposeNextDestinations() {
    const lastPoint = selectedRoute[selectedRoute.length - 1];
    let minKm, maxKm;

    if (currentStep === 1) {
        minKm = 100; maxKm = 300;
        document.getElementById('step-title').innerText = "目的地1の提案 (100-300km)";
    } else {
        minKm = 50; maxKm = 100;
        document.getElementById('step-title').innerText = `目的地${currentStep}の提案 (50-100km)`;
    }

    // 範囲内の自治体を抽出
    const candidates = municipalitiesData.filter(m => {
        const d = calculateDistance(lastPoint.lat, lastPoint.lng, m.lat, m.lng);
        return d >= minKm && d <= maxKm;
    });

    // ランダムに3つ抽出
    const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);
    const listDiv = document.getElementById('suggestion-list');
    listDiv.innerHTML = "";

    if (shuffled.length === 0) {
        listDiv.innerHTML = "<p>該当する場所が見つかりませんでした。距離条件を無視して近くの候補を表示します。</p>";
        // 代替案（単純に近い順）
        const alternatives = municipalitiesData
            .map(m => ({...m, d: calculateDistance(lastPoint.lat, lastPoint.lng, m.lat, m.lng)}))
            .sort((a, b) => a.d - b.d)
            .slice(1, 4);
        alternatives.forEach(m => createSuggestionCard(m, listDiv));
    } else {
        shuffled.forEach(m => createSuggestionCard(m, listDiv));
    }
}

function createSuggestionCard(place, container) {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    const dist = calculateDistance(selectedRoute[selectedRoute.length-1].lat, selectedRoute[selectedRoute.length-1].lng, place.lat, place.lng);
    card.innerHTML = `<strong>${place.pref} ${place.city}</strong><br>直線距離: 約${dist.toFixed(1)}km`;
    card.onclick = () => selectDestination(place);
    container.appendChild(card);
}

// 目的地選択
async function selectDestination(place) {
    const lastPoint = selectedRoute[selectedRoute.length - 1];
    const transport = document.getElementById('transport').value;
    
    // OSRMプロファイル設定
    let profile = 'car'; // default
    if (transport === 'bicycle') profile = 'bike';
    // OSRMの公開デモサーバは driving, walking, cycling のみ
    const osrmProfile = (transport === 'bicycle') ? 'cycling' : 'driving';

    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${lastPoint.lng},${lastPoint.lat};${place.lng},${place.lat}?overview=full&geometries=geojson`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code !== 'Ok') throw new Error();

        const route = data.routes[0];
        drawRoute(route.geometry);
        
        selectedRoute.push({
            name: `${place.pref}${place.city}`,
            lat: place.lat,
            lng: place.lng,
            distance: route.distance / 1000, // km
            duration: route.duration / 60 // min
        });

        addMarker(place.lat, place.lng, `目的地${currentStep}: ${place.city}`);

        if (currentStep < 3) {
            currentStep++;
            proposeNextDestinations();
        } else {
            showFinalResults();
        }
    } catch (e) {
        alert("ルートの取得に失敗しました。");
    }
}

function addMarker(lat, lng, title) {
    const marker = L.marker([lat, lng]).addTo(map).bindPopup(title);
    markers.push(marker);
}

function drawRoute(geometry) {
    const line = L.geoJSON(geometry, {
        style: { color: '#3498db', weight: 5, opacity: 0.7 }
    }).addTo(map);
    routeLayers.push(line);
    map.fitBounds(line.getBounds(), { padding: [50, 50] });
}

function showFinalResults() {
    document.getElementById('suggestion-section').classList.add('hidden');
    const resultSection = document.getElementById('result-section');
    resultSection.classList.remove('hidden');

    const statsDiv = document.getElementById('route-stats');
    let totalDist = 0;
    let totalTime = 0;

    let html = `<table><tr><th>区間</th><th>距離</th><th>時間</th></tr>`;
    for (let i = 1; i < selectedRoute.length; i++) {
        const segment = selectedRoute[i];
        totalDist += segment.distance;
        totalTime += segment.duration;
        html += `<tr>
            <td>${selectedRoute[i-1].name} → ${segment.name}</td>
            <td>${segment.distance.toFixed(1)} km</td>
            <td>${Math.round(segment.duration)} 分</td>
        </tr>`;
    }
    
    const hours = Math.floor(totalTime / 60);
    const mins = Math.round(totalTime % 60);

    html += `<tr style="font-weight:bold;">
        <td>合計</td>
        <td>${totalDist.toFixed(1)} km</td>
        <td>${hours}時間${mins}分</td>
    </tr></table>`;

    statsDiv.innerHTML = html;
}

window.onload = init;