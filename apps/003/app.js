/**
 * ドライブルート提案アプリ
 */

// --- 設定・定数 ---
const MUNICIPALITIES_URL = 'https://raw.githubusercontent.com/yzkn/Gemini-JS-DriveRouteSuggestion/refs/heads/main/master/municipalities.json';
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// 地図の初期化 (地理院地図)
const map = L.map('map').setView([35.6812, 139.7671], 10);
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイルの詳細</a>"
}).addTo(map);

let markers = [];
let routeLines = [];
let municipalitiesData = [];
let currentStep = 1; // 1: 目的地1, 2: 目的地2, 3: 目的地3
let routePoints = []; // [{name, lat, lng}, ...]
let routeSegments = []; // 各区間の情報

// --- ユーティリティ関数 ---

// ヒュベニの公式による距離計算(km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const rad = (deg) => deg * Math.PI / 180;
    const a = 6378137.0; // 赤道半径
    const b = 6356752.314245; // 極半径
    const e2 = (a ** 2 - b ** 2) / (a ** 2);
    
    const dy = rad(lat1 - lat2);
    const dx = rad(lon1 - lon2);
    const my = rad((lat1 + lat2) / 2);
    
    const w = Math.sqrt(1 - e2 * Math.sin(my) ** 2);
    const m = a * (1 - e2) / (w ** 3);
    const n = a / w;
    
    return Math.sqrt((dy * m) ** 2 + (dx * n * Math.cos(my)) ** 2) / 1000;
}

// 住所から座標を取得 (Nominatim)
async function getCoordsFromAddress(address) {
    try {
        const response = await fetch(`${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=json&limit=1`);
        const data = await response.json();
        if (data.length === 0) throw new Error("住所が見つかりませんでした。");
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (error) {
        alert("ジオコーディングに失敗しました: " + error.message);
        return null;
    }
}

// OSRM APIでルート取得
async function getRoute(p1, p2, mode) {
    const osrmMode = mode === 'bicycle' ? 'bicycle' : (mode === 'walk' ? 'foot' : 'driving');
    const url = `${OSRM_BASE_URL}/${osrmMode}/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=full&geometries=geojson`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== 'Ok') throw new Error("ルートが見つかりませんでした。");
        return data.routes[0];
    } catch (error) {
        alert("ルート検索に失敗しました: " + error.message);
        return null;
    }
}

// --- メインロジック ---

// 自治体データの読み込み
async function loadMunicipalities() {
    try {
        const response = await fetch(MUNICIPALITIES_URL);
        municipalitiesData = await response.json();
    } catch (e) {
        console.error("データ読み込み失敗", e);
    }
}

// 目的地候補の選定
function getCandidates(basePoint, minKm, maxKm) {
    const matches = municipalitiesData.filter(m => {
        const dist = calculateDistance(basePoint.lat, basePoint.lng, m.lat, m.lng);
        return dist >= minKm && dist <= maxKm;
    });
    
    // ランダムに3つ抽出
    return matches.sort(() => 0.5 - Math.random()).slice(0, 3);
}

// UI更新: 候補の表示
function showCandidates(candidates) {
    const list = document.getElementById('candidate-list');
    list.innerHTML = '';
    const section = document.getElementById('suggestion-section');
    section.classList.remove('hidden');
    
    const title = document.getElementById('suggestion-title');
    title.innerText = `目的地${currentStep}の候補を選択`;

    candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = 'candidate-item';
        div.innerHTML = `<strong>${c.city} (${c.pref})</strong><br>現在地からの直線距離: 約${Math.floor(calculateDistance(routePoints[currentStep-1].lat, routePoints[currentStep-1].lng, c.lat, c.lng))}km`;
        div.onclick = () => selectDestination(c);
        list.appendChild(div);
    });
    
    section.scrollIntoView({ behavior: 'smooth' });
}

// 目的地選択時の処理
async function selectDestination(target) {
    const prevPoint = routePoints[currentStep - 1];
    const mode = document.getElementById('transport-mode').value;
    
    // ルート取得
    const routeData = await getRoute(prevPoint, target, mode);
    if (!routeData) return;

    // 地図に描画
    const latlngs = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    const polyline = L.polyline(latlngs, { color: currentStep === 1 ? 'blue' : (currentStep === 2 ? 'green' : 'red') }).addTo(map);
    routeLines.push(polyline);
    
    const marker = L.marker([target.lat, target.lng]).addTo(map).bindPopup(`目的地${currentStep}: ${target.city}`).openPopup();
    markers.push(marker);
    map.fitBounds(polyline.getBounds());

    // 情報を保存
    routePoints.push({ name: target.city, lat: target.lat, lng: target.lng });
    routeSegments.push({
        name: `${prevPoint.name} → ${target.city}`,
        distance: (routeData.distance / 1000).toFixed(1),
        duration: Math.floor(routeData.duration / 60)
    });

    // 次のステップへ
    if (currentStep < 3) {
        currentStep++;
        const nextCandidates = getCandidates(target, 50, 100);
        if (nextCandidates.length === 0) {
            alert("50km-100km圏内に候補が見つかりませんでした。終了します。");
            finalizeRoute();
        } else {
            showCandidates(nextCandidates);
        }
    } else {
        finalizeRoute();
    }
}

// 最終結果の表示
function finalizeRoute() {
    document.getElementById('suggestion-section').classList.add('hidden');
    document.getElementById('result-section').classList.remove('hidden');
    
    const tbody = document.getElementById('route-summary-body');
    tbody.innerHTML = '';
    
    let totalD = 0;
    let totalT = 0;
    
    routeSegments.forEach(s => {
        const row = `<tr><td>${s.name}</td><td>${s.distance} km</td><td>${s.duration} 分</td></tr>`;
        tbody.innerHTML += row;
        totalD += parseFloat(s.distance);
        totalT += s.duration;
    });
    
    document.getElementById('total-distance').innerText = totalD.toFixed(1) + " km";
    document.getElementById('total-duration').innerText = `${Math.floor(totalT/60)}時間${totalT%60}分`;
}

// --- イベントリスナー ---

// 「現在地を取得」ボタン
document.getElementById('btn-current-location').onclick = () => {
    if (!navigator.geolocation) {
        alert("お使いのブラウザは位置情報に対応していません。");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            document.getElementById('start-location').value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            // 逆ジオコーディングで地名を入れることも可能だが、今回は簡易的に座標保持
        },
        () => alert("GPSによる測位に失敗しました。手動で入力してください。")
    );
};

// 「ルート作成を開始」ボタン
document.getElementById('btn-start').onclick = async () => {
    const startInput = document.getElementById('start-location').value;
    if (!startInput) return alert("出発地を入力してください");

    let startCoords;
    if (startInput.includes(',')) {
        const parts = startInput.split(',');
        startCoords = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
    } else {
        startCoords = await getCoordsFromAddress(startInput);
    }

    if (!startCoords) return;

    // 初期化
    routePoints = [{ name: "出発地", ...startCoords }];
    currentStep = 1;
    markers.forEach(m => map.removeLayer(m));
    routeLines.forEach(l => map.removeLayer(l));
    markers = [];
    routeLines = [];
    routeSegments = [];
    
    // 出発地マーカー
    const startMarker = L.marker([startCoords.lat, startCoords.lng]).addTo(map).bindPopup("出発地").openPopup();
    markers.push(startMarker);
    map.setView([startCoords.lat, startCoords.lng], 8);

    // 目的地1の候補を表示
    const candidates = getCandidates(startCoords, 100, 300);
    if (candidates.length === 0) {
        alert("100km-300km圏内に候補が見つかりませんでした。");
    } else {
        showCandidates(candidates);
        document.getElementById('setup-section').classList.add('hidden');
    }
};

// リセットボタン
document.getElementById('btn-reset').onclick = () => {
    location.reload();
};

// 起動時
loadMunicipalities();