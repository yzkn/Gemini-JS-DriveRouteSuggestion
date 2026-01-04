// 定数と設定
const MUNICIPALITIES_URL = "https://raw.githubusercontent.com/yzkn/Gemini-JS-DriveRouteSuggestion/refs/heads/main/master/municipality.json";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const OSRM_BASE = "https://router.project-osrm.org/route/v1";

// 地図の初期化
const map = L.map('map').setView([35.681236, 139.767125], 6);
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
}).addTo(map);


// --- app.js の冒頭（地図初期化の後など）に追加 ---
// ゴールドのカスタムアイコン定義
const goldIcon = L.divIcon({
    className: 'gold-marker',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10]
});
// --- ここまで ---


let markers = [];
let routeLines = [];
let municipalityData = []; // 最初は空配列で初期化
let routePoints = []; // [{lat, lon, name}]

// ヒュベニの公式による距離計算 (km)
function getDistance(lat1, lon1, lat2, lon2) {
    const deg2rad = deg => deg * Math.PI / 180;
    const lat1R = deg2rad(lat1);
    const lon1R = deg2rad(lon1);
    const lat2R = deg2rad(lat2);
    const lon2R = deg2rad(lon2);

    const a = 6378137.0; // 赤道半径
    const b = 6356752.314245; // 極半径
    const e2 = (a * a - b * b) / (a * a); // 第一離心率の2乗
    const dy = lat1R - lat2R;
    const dx = lon1R - lon2R;
    const my = (lat1R + lat2R) / 2;
    const sinMy = Math.sin(my);
    const w = Math.sqrt(1 - e2 * sinMy * sinMy);
    const m = a * (1 - e2) / (w * w * w); // 子午線曲率半径
    const n = a / w; // 卯酉線曲率半径

    const d = Math.sqrt(Math.pow(dy * m, 2) + Math.pow(dx * n * Math.cos(my), 2));
    return d / 1000;
}

// 初期化: 市町村データの読み込み
// 初期化: 市町村データの読み込み (ここを修正)
async function init() {
    try {
        const response = await fetch(MUNICIPALITIES_URL);
        if (!response.ok) throw new Error("データの取得に失敗しました");

        const data = await response.json();

        // JSONの構造に合わせて配列を抽出
        if (Array.isArray(data)) {
            municipalityData = data;
        } else if (data.municipalities && Array.isArray(data.municipalities)) {
            municipalityData = data.municipalities;
        } else {
            throw new Error("JSONデータの形式が正しくありません");
        }

        console.log("データ読み込み完了:", municipalityData.length, "件");
    } catch (error) {
        console.error(error);
        alert("データの読み込みに失敗しました。ページをリロードしてください。");
    }
}

// ジオコーディング (住所 -> 座標)
async function geocode(address) {
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.length === 0) throw new Error("場所が見つかりませんでした。");
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: address };
}

// ルート検索API (OSRM)
async function getRoute(p1, p2, mode) {
    let profile = "driving";
    if (mode === "bicycle") profile = "cycling";
    // 電車・バスはOSRMにないためdrivingで代用

    const url = `${OSRM_BASE}/${profile}/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok") throw new Error("ルートが見つかりませんでした。");
    return data.routes[0];
}

// 目的地候補の抽出
// 目的地候補の抽出 (安全策を追加)
function getCandidates(basePoint, minKm, maxKm) {
    // データが読み込まれていない場合のハンドリング
    if (!municipalityData || municipalityData.length === 0) {
        alert("市町村データがまだ読み込まれていません。少し待ってからやり直してください。");
        return [];
    }

    const candidates = municipalityData.filter(m => {
        // プロパティ名が JSON 内で 'latitude' 'longitude' であることを確認
        const lat = m.latitude || m.lat;
        const lon = m.longitude || m.lon || m.lng || m.long;
        if (!lat || !lon) return false;

        const dist = getDistance(basePoint.lat, basePoint.lon, lat, lon);
        return dist >= minKm && dist <= maxKm;
    });

    // シャッフルして最大3つ抽出
    const items = candidates.sort(() => 0.5 - Math.random()).slice(0, 3);
    console.log(`候補抽出: ${items.length} 件 (範囲: ${minKm}-${maxKm} km)`);
    console.log({ items });
    return items;
}


// UI制御: 目的地セレクトメニューの作成
function createSelectionMenu(step, candidates) {
    const container = document.getElementById("dynamic-selectors");
    const div = document.createElement("div");
    div.className = "destination-select-group";
    div.id = `step-${step}`;

    const label = document.createElement("label");
    label.innerText = `目的地 ${step} を選択:`;

    const select = document.createElement("select");
    select.innerHTML = `<option value="">-- 選択してください --</option>` +
        candidates.map((c, i) => `<option value="${i}">${c.name} (${getDistance(routePoints[step - 1].lat, routePoints[step - 1].lon, c.lat, c.lon).toFixed(1)} km)</option>`).join("");

    select.onchange = async (e) => {
        const idx = e.target.value;
        if (idx === "") return;

        const selected = candidates[idx];
        const point = { lat: selected.lat, lon: selected.lon, name: selected.name };
        routePoints.push(point);

        // 地図更新とルート描画
        console.log(`目的地 ${step} 選択:`, point);
        await addRouteToMap(routePoints[step - 1], point, step);
        console.log("routePoints:", routePoints);

        select.disabled = true; // 選択後は無効化

        if (step < 3) {
            const nextCandidates = getCandidates(point, 50, 100);
            createSelectionMenu(step + 1, nextCandidates);
        } else {
            showResults();
        }
    };

    div.appendChild(label);
    div.appendChild(select);
    container.appendChild(div);
}

// 地図にマーカーとルートを追加
async function addRouteToMap(p1, p2, step) {
    console.log("ルート追加:", p1, p2);

    // マーカー
    if (markers.length === 0) {
        // markers.push(L.marker([p1.lon, p1.lat]).addTo(map).bindPopup("出発地: " + p1.name));
        markers.push(L.marker([p2.lat, p2.lon], { icon: goldIcon }).addTo(map).bindPopup(`<div style="font-family:'Montserrat', sans-serif;">
        <b style="color:#c5a059;">出発地</b>: ${p1.name}
    </div>`));
    }
    // markers.push(L.marker([p2.lon, p2.lat]).addTo(map).bindPopup(`目的地${step}: ` + p2.name));
    markers.push(L.marker([p2.lat, p2.lon], { icon: goldIcon }).addTo(map).bindPopup(`<div style="font-family:'Montserrat', sans-serif;">
        <b style="color:#c5a059;">目的地${step}</b>: ${p2.name}
    </div>`));

    // ルート
    const mode = document.getElementById("transport").value;
    const routeData = await getRoute(p1, p2, mode);
    // app.js 内のルート描画色をゴールドに変更 (L.geoJSONの部分)
    const polyline = L.geoJSON(routeData.geometry, {
        color: '#c5a059', // ゴールド
        weight: 6,
        opacity: 0.8
    }).addTo(map);
    routeLines.push({ polyline, data: routeData });

    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
}

// 最終結果の表示
function showResults() {
    document.getElementById("result-area").classList.remove("hidden");
    const tbody = document.querySelector("#route-details tbody");
    tbody.innerHTML = "";

    let totalDist = 0;
    let totalTime = 0;

    routeLines.forEach((rl, i) => {
        const d = rl.data.distance / 1000;
        const t = rl.data.duration / 60;
        totalDist += d;
        totalTime += t;

        const row = `<tr>
            <td>${routePoints[i].name} → ${routePoints[i + 1].name}</td>
            <td>${d.toFixed(1)} km</td>
            <td>${Math.round(t)} 分</td>
        </tr>`;
        tbody.innerHTML += row;
    });

    document.getElementById("route-summary").innerHTML = `
        <p><strong>総距離:</strong> ${totalDist.toFixed(1)} km</p>
        <p><strong>合計予想時間:</strong> ${Math.round(totalTime / 60)} 時間 ${Math.round(totalTime % 60)} 分</p>
    `;
}

// イベントリスナー: 開始ボタン
document.getElementById("btn-start").addEventListener("click", async () => {
    const originVal = document.getElementById("origin").value;
    if (!originVal) return alert("出発地を入力してください");

    try {
        const originPoint = await geocode(originVal);
        console.log("出発地座標:", originPoint);
        routePoints = [originPoint];

        // UIリセット
        document.getElementById("dynamic-selectors").innerHTML = "";
        document.getElementById("selection-area").classList.remove("hidden");
        document.getElementById("result-area").classList.add("hidden");

        const candidates = getCandidates(originPoint, 100, 300);
        if (candidates.length === 0) {
            alert("100km-300kmの範囲に候補が見つかりませんでした。別の出発地を試してください。");
            return;
        }
        createSelectionMenu(1, candidates);
    } catch (e) {
        alert(e.message);
    }
});

// イベントリスナー: 現在地取得
document.getElementById("btn-current-location").addEventListener("click", () => {
    if (!navigator.geolocation) return alert("お使いのブラウザは位置情報に対応していません");

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            document.getElementById("origin").value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            // 座標から逆ジオコーディングして名前を入れるのが理想だが、ここでは座標をそのまま利用
        },
        () => alert("現在地の取得に失敗しました。")
    );
});

init();

console.log("getDistance", "浜松市中央区 <===> 浜松市浜名区", getDistance(34.710809, 137.726307, 34.791548, 137.783159));
